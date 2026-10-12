# 설계 / Architecture

## 계층 / Layers

```
UI (src/features/*)
   │  useDb()
   ▼
Database (src/db/database.ts)        ← 평문은 메모리 안에서만 다뤄요
   │  sealJson / openJson (AES-256-GCM)
   ▼
RecordStore (src/db/recordStore.ts)  ← 암호문만 받아요
   ├─ IndexedDbRecordStore           웹
   ├─ SqliteRecordStore              Android (@capacitor-community/sqlite)
   └─ MemoryRecordStore              테스트
```

플랫폼별 저장소(`RecordStore`)는 `(table, id, iv, ct)` 형태의 암호문 행과,
평문 메타 값 몇 개(볼트 헤더, 스키마 버전)만 저장해요.
기록의 내용, 날짜, 관계 같은 정보는 전부 암호문 안에 들어 있어요.

## 암호화 / Encryption

`src/crypto/vault.ts`는 봉투 암호화(envelope encryption) 방식을 써요.

1. 처음 실행할 때 무작위 256비트 **데이터 키**를 만들어요.
2. 사용자 비밀번호를 PBKDF2-SHA256(600,000회)으로 늘려 **래핑 키**를 만들고, 이 키로 데이터 키를 감싸서(AES-GCM) `meta.vault`에 저장해요.
3. 잠금을 해제하면 데이터 키를 풀어 메모리에만 둬요. 이 키는 추출할 수 없게(non-extractable) 만들어요. 비밀번호가 틀리면 GCM 인증이 실패하므로 PIN 해시를 따로 저장하지 않아요.
4. 각 레코드는 새 무작위 IV로 암호화하고, `table`과 `id`를 AAD로 묶어요. 그래서 암호문을 다른 자리에 옮기면 복호화가 실패해요.
5. 비밀번호를 바꿀 때는 데이터 키만 다시 감싸요. 레코드를 다시 암호화하지 않아요.

웹과 Android가 같은 코드로 암호화하므로, 웹에서도 저장된 데이터는 암호문이에요.

## 저장 구조 / Storage layout

**SQLite (Android)**

```sql
CREATE TABLE records (tbl TEXT, id TEXT, iv TEXT, ct TEXT, PRIMARY KEY (tbl, id));
CREATE TABLE meta    (key TEXT PRIMARY KEY, value TEXT);
```

**IndexedDB (웹)**: `records` 스토어(키 `[table, id]`, `by_table` 인덱스)와 `meta` 스토어

여러 테이블에 걸친 쓰기도 하나의 트랜잭션으로 처리해요(`Database.batch`).

## 논리 스키마 / Logical schema

전체 정의는 [`src/db/types.ts`](../src/db/types.ts)에 있어요.

| 테이블 | 내용 | 관계 |
| --- | --- | --- |
| `medications` | 이름, 제형, 용량, 단위, 주기(daily/weekly/interval), 기간, 알림 여부 | |
| `dose_logs` | 예정 시각, 복용/건너뜀, 실제 시각, 당시 용량 스냅샷 | → medications |
| `lab_items` | 사용자가 정의한 검사 항목, 기본 단위 | |
| `lab_sessions` | 검사 날짜, 메모 | |
| `lab_results` | 값, 단위 (검사별·항목별 1개) | → lab_sessions, lab_items |
| `journal_entries` | 날짜, 기분(1–5), 메모, 부작용 메모 | |
| `journal_photos` | 사진 메타데이터 (실제 이미지는 별도의 암호화 저장소) | → journal_entries |
| `appointments` | 제목, 종류, 일시, 장소, 전날 알림 | |
| `notification_links` | OS 알림 ID ↔ 기록 연결 | |
| `settings` | 알림 문구 등 앱 설정 | |

설계 결정:

- **'놓침'은 저장하지 않아요.** 지나간 예정 시각 중 `dose_logs`에 기록이 없는 것을 놓친 것으로 계산해요. 그래서 주기를 바꿔도 기록이 꼬이지 않아요.
- **참고범위나 정상/비정상 필드는 없어요.** 의료적 판단으로 보일 수 있는 기능을 넣지 않기 위해서예요.
- **단위는 결과마다 저장하고 변환하지 않아요.**
- **필터링은 메모리에서 해요.** 개인 기록은 많아야 수천 건이라, 인덱스 없이 테이블 전체를 복호화해도 충분히 빨라요. 덕분에 날짜 같은 정보도 평문으로 남지 않아요.

## 위협 모델 / Threat model

**보호하는 것**

- 기기나 브라우저 저장소의 파일을 복사해 간 사람이 기록을 읽는 것
- 백업이나 동기화된 저장소에서 기록이 노출되는 것 (Android 백업은 6단계에서 끌 예정)
- 알림과 앱 이름으로 앱의 용도가 드러나는 것
- 앱이 네트워크로 데이터를 보내는 것 (CSP, CI 검사, Android 릴리스 빌드에서 INTERNET 권한 제거)

**보호하지 못하는 것**

- 잠금이 풀린 상태의 기기를 다른 사람이 보는 것
- 기기에 설치된 악성코드, 또는 루팅/탈옥된 기기
- **짧은 PIN에 대한 오프라인 대입 공격.** 저장소를 복사해 간 공격자는 PIN을 하나씩 대입해 볼 수 있어요. PBKDF2가 대입 속도를 늦추지만, 6자리 숫자는 충분히 안전하지 않아요. 문자를 섞은 긴 비밀번호를 권장해요.
- 비밀번호를 잊어버린 경우. 데이터를 복구할 방법이 없어요.
