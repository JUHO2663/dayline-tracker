# 기여 가이드 / Contributing

Dayline에 관심을 가져 주셔서 고마워요. 이 앱은 매우 민감한 개인 기록을 다루기 때문에,
아래 규칙은 다른 어떤 기능보다 우선합니다.

*Thanks for helping! This app stores very sensitive personal records, so the rules below
take priority over any feature. PRs that break them will not be merged.*

## 프라이버시 규칙 / Privacy rules

1. **네트워크 금지 / No network.** 앱 코드에서 `fetch`, `XMLHttpRequest`, `WebSocket`, 원격 URL 등을 쓰지 않아요. 외부 폰트·CDN·이미지도 쓰지 않아요.
   *No network calls, remote URLs, CDNs or web fonts.*
2. **외부로 데이터를 보내는 라이브러리 금지 / No data-sending dependencies.** 분석, 광고, 오류 수집(crash reporting) SDK는 쓰지 않아요. 의존성을 추가하려면 `privacy-allowlist.json`에 이유와 함께 등록해야 하고, 리뷰를 거쳐요.
   *No analytics, ads or crash reporting. New dependencies must be added to `privacy-allowlist.json` with a reason.*
3. **평문 저장 금지 / Nothing in plaintext.** 사용자 데이터는 항상 `Database`(암호화 계층)를 거쳐 저장해요. `localStorage`나 파일에 직접 쓰지 않아요.
   *All user data goes through the encrypted `Database`. Never write it to localStorage or files directly.*
4. **중립적인 알림 / Neutral notifications.** 알림, 앱 이름, 아이콘에 약 이름이나 건강 관련 단어를 넣지 않아요.
   *Notifications, app name and icon must not reveal what the app is for.*
5. **의료 조언 금지 / No medical advice.** 용량 추천, 참고범위, 정상/비정상 표시, 수치 해석 기능은 받지 않아요.
   *No dose suggestions, reference ranges, normal/abnormal flags or interpretation of values.*
6. **실제 데이터 공유 금지 / No real data in issues.** 이슈, PR, 스크린샷에 실제 개인 기록이나 내보내기 파일을 올리지 마세요. 예시 데이터를 써 주세요.
   *Never attach real records or exports to issues or PRs.*

`npm run privacy-check`가 1–2번과 원격 서버 설정을 자동으로 검사해요. 그래도 최종 판단은 리뷰에서 합니다.

## 개발 환경 / Setup

```bash
npm install
npm run dev
```

PR을 올리기 전에 아래 명령이 통과하는지 확인해 주세요. CI에서도 같은 검사를 해요.
*Before opening a PR, make sure this passes (CI runs it too):*

```bash
npm run check
```

## 코드 구조 / Where things live

- `src/crypto/`: 암호화(키 생성, 잠금 해제, 레코드 암호화)
- `src/db/`: 데이터 타입, 암호화 데이터베이스, 플랫폼별 저장소(IndexedDB/SQLite)
- `src/features/`: 화면별 기능
- `docs/architecture.md`: 설계 설명

새 데이터 타입을 추가할 때는 `src/db/types.ts`의 `TableTypes`와 `TABLE_NAMES`에 등록하고, 부모·자식 관계가 있다면 `RELATIONS`에도 추가해 주세요.

## PR 가이드 / Pull requests

- 하나의 PR에는 하나의 변경만 담아 주세요.
- 동작이 바뀌면 테스트를 추가하거나 수정해 주세요. 특히 `src/crypto`와 `src/db`는 테스트가 필수예요.
- UI 문구는 한국어가 기본이에요. 번역 기여도 환영합니다.
- 접근성(스크린 리더, 글자 크기, 색 대비)을 고려해 주세요.

## 행동 규범 / Conduct

이 프로젝트의 사용자 중에는 사회적으로 취약한 처지에 있는 사람들이 많아요.
모든 참여자를 존중해 주세요. 혐오, 괴롭힘, 다른 사람의 정체성을 추측하거나 드러내는 행동은 허용되지 않아요.

*Be respectful. Harassment, hate, or speculating about anyone's identity is not tolerated.*
