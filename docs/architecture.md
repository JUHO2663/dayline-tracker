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

## 투약 일정과 알림 / Schedules and reminders

- 주기 계산은 순수 함수(`src/features/medications/schedule.ts`)로 되어 있어요. 날짜 계산은 `YYYY-MM-DD` 문자열을 UTC 기준으로 다뤄서 서머타임에 영향을 받지 않아요.
- `interval`(N일마다)은 사용자가 정한 기준일(`anchor`)부터 N일 간격으로 계산해요.
- **날짜마다 그때 적용되던 주기로 계산해요.** `Medication.scheduleHistory`에 지난 주기와 사용 중지 기간을 보관하고, `scheduleOn(med, date)`가 그 날짜의 주기를 찾아요. 상태 변경 규칙은 `medicationOps.ts`에 있어요.
  - 주기를 바꿀 때 바꾸기 전의 주기가 이미 지난 날짜에 적용됐다면, 사용자에게 **유지**(지난 날짜는 이전 주기로 계속 계산)와 **삭제**(해당 약의 체크 기록을 지우고 오늘부터 새로 시작) 중에 고르게 해요.
  - 사용 중지 기간은 '쉼'으로 기록돼서 놓친 기록으로 세지 않아요.
- 약별 기록 화면은 기간 안의 예정 시각과 기록을 합쳐서 보여줘요. 나중에 시간이 바뀌어 주기와 맞지 않게 된 기록도 숨기지 않아요.
- 오늘 이전 날짜의 체크 기록에는 실제 체크 시각(`takenAt`)을 남기지 않아요. 나중에 체크하면 실제 시각을 알 수 없기 때문이에요.

알림(`src/services/notifications.ts`)은 기기 안에서만 예약해요. 푸시 서버는 쓰지 않아요.

- 잠금을 풀 때와 투약 데이터가 바뀔 때마다, 앞으로 14일치 알림(최대 60개)을 다시 예약해요. OS의 반복 알림은 'N일마다' 같은 주기를 표현하지 못해서 이 방식을 써요.
- 같은 시각에 여러 항목이 있어도 알림은 하나만 보내요. 알림 내용으로 무엇을 몇 개 하는지 알 수 없게 하기 위해서예요.
- 그 시각의 항목을 모두 체크하거나 건너뛰면 해당 알림을 취소해요.
- **알림에는 설정의 중립 문구만 들어가요.** Android 플러그인은 재부팅 후 다시 예약하려고 알림 내용(제목, 본문, extra)을 앱 전용 저장소에 평문으로 보관해요. 그래서 약 이름, ID, extra 데이터를 절대 알림에 넣지 않아요. 알림 ID와 기록의 연결은 암호화된 `notification_links` 테이블에 둬요.
- Android 알림 채널은 잠금 화면에서 내용을 숨기는 `private`로 만들어요.
- 웹에서는 브라우저의 Notification API를 쓰기 때문에, 탭이 열려 있을 때만 알림이 와요.

## 혈액검사 기록 / Lab results

- 항목(`lab_items`)은 사용자가 자유롭게 만들어요. 이름은 대소문자를 구분하지 않고 중복을 막아요.
- 검사 1회(`lab_sessions`)에 여러 결과(`lab_results`)가 들어가요. 새 검사를 추가할 때는 직전 검사의 항목과 단위를 미리 채워 주고, 값을 비워 둔 줄은 저장하지 않아요.
- `<20`, `>1000`처럼 부등호가 붙은 값은 `comparator`로 저장해요. 그래프에서는 적힌 숫자 위치에 속이 빈 점으로 표시해요.
- **판단하지 않아요.** 참고범위, 정상/비정상 표시, 색으로 높고 낮음을 나타내는 기능, 단위 변환이 없어요. 단위가 다른 값은 그래프를 따로 그려요.
- 그래프(Recharts)는 값이 2개 이상일 때만 그려요. 차트 색은 라이트/다크 모드 각각 대비 검사를 통과한 값을 써요. 모든 값은 그래프 아래 목록에서도 볼 수 있어요.
- 차트 라이브러리는 검사 탭을 열 때만 불러와요(코드 분할).

## 일지와 사진 / Journal and photos

- 일지는 날짜, 기분(1–5, 선택), 메모, 부작용 메모, 사진으로 이루어져요. 이 중 하나는 있어야 저장돼요.
- **사진 처리** (`src/services/images.ts`)
  - 긴 변을 1600px로 줄이고 JPEG로 다시 인코딩해요. 이 과정에서 EXIF(위치, 기기, 촬영 시각 등) 정보가 모두 사라져요.
  - 사진은 데이터 키로 암호화한 **blob**으로 저장해요. 웹에서는 IndexedDB의 `blobs` 스토어에, Android에서는 앱 전용 내부 저장소(`Directory.Data/blobs/`)의 파일로 저장해요. 공용 저장소나 MediaStore에는 저장하지 않아서 갤러리에 나타나지 않아요.
  - `journal_photos` 레코드에는 사진의 메타데이터만 들어 있어요. 사진 데이터(blob)는 레코드보다 먼저 쓰고, 지울 때는 레코드보다 나중에 지워요. 그래서 중간에 앱이 멈추더라도 남는 건 참조되지 않는 blob뿐이고, 잠금을 풀 때 `sweepOrphanBlobs`가 정리해요.
- **Android 카메라의 임시 파일**: WebView의 파일 선택기로 사진을 찍으면, Capacitor가 원본 JPEG를 `Android/data/<앱>/files/Pictures`에 남겨요. 그래서 사진을 처리한 직후와 잠금을 풀 때마다 이 폴더를 비우고, 오래된 Android의 미디어 스캐너가 이 폴더를 읽지 않도록 `.nomedia` 파일을 둬요.
- 앨범에서 고른 사진의 원본은 앨범에 그대로 남아요. 앱은 원본을 지우지 않고, 화면에서 그 사실을 알려 줘요.

## 병원 일정 / Appointments

- 일정마다 제목, 종류(진료/검사/기타), 일시, 장소, 메모를 넣고, 전날 알림을 켜거나 끌 수 있어요.
- 알림은 **전날 20:00**에 와요. 문구는 설정의 `appointmentText`(기본값 "내일 일정이 있어요")만 쓰고, 제목이나 장소는 넣지 않아요. 알림 시각이 이미 지난 경우(예: 전날 밤 늦게 일정을 추가)에는 예약하지 않아요.
- 투약 알림과 일정 알림은 `syncReminders`가 함께 관리해요. 바뀔 때마다 기존 알림을 모두 취소하고 다시 예약해요.

## 네트워크 차단 / Network isolation

여러 겹으로 막아요.

1. **소스 검사**: `npm run privacy-check`가 앱 코드의 네트워크 API와 원격 URL, 허용 목록에 없는 의존성을 찾아내요.
2. **CSP**: 빌드에 `connect-src 'self'`가 들어가서, 라이브러리 안에 통신 코드가 있더라도 브라우저가 외부 요청을 막아요.
3. **Capacitor 설정**: `CapacitorHttp`와 `CapacitorCookies`를 끄고, `server.url`을 쓰지 않아요. 참고로 `@capacitor/core`에는 `CapacitorHttp`의 웹 구현(fetch)이 포함되어 있지만, 호출하지 않으면 실행되지 않고 CSP에도 막혀요.
4. **Android 권한**: 릴리스 빌드에서 `INTERNET` 권한을 빼요(6단계).

Vite의 modulepreload 폴리필은 꺼 두었어요. 이 폴리필은 앱 자신의 파일을 fetch로 미리 받아 오는데, 지원 대상 WebView에는 필요 없어요.

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
