# Dayline

기기 안에서만 동작하는 개인 기록 앱입니다. 투약 체크, 검사 수치, 일지, 병원 일정을 기록해요.
서버가 없고, 모든 데이터는 암호화되어 기기에만 저장됩니다.

*A private, offline-first log for medication check-offs, lab values, a daily journal and appointments.
No server, no accounts, no tracking. Everything is encrypted and stays on the device.
Runs on Android (Capacitor) and in the browser.*

## 원칙

- **기기 밖으로 아무것도 보내지 않아요.** 네트워크 요청, 분석·광고·오류 수집 SDK를 쓰지 않아요. CI가 매 PR마다 검사합니다.
- **모든 기록을 암호화해요.** 사용자가 정한 비밀번호로 만든 키로 AES-256-GCM 암호화해서 저장하고, 비밀번호를 모르면 아무도 읽을 수 없어요. 개발자도 마찬가지예요.
- **알림 문구는 중립적이에요.** 알림에 약 이름이나 건강 관련 단어가 나오지 않아요.
- **의료 조언을 하지 않아요.** 용량 추천이나 수치의 정상/비정상 판정 같은 기능은 넣지 않아요. 사용자가 입력한 값을 기록하고 보여줄 뿐이에요.

## 기능 (진행 상황)

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 프로젝트 세팅, 암호화 저장소 | ✅ |
| 2 | 투약 관리, 로컬 알림 | ✅ |
| 3 | 검사 기록, 추이 그래프 | ✅ |
| 4 | 일지(사진 첨부), 병원 일정 | ✅ |
| 5 | 잠금(생체인증), 내보내기, 전체 삭제 | ⏳ |
| 6 | Android APK 빌드 | ⏳ |

## 개발 시작하기

필요한 것: Node.js 22 이상 (Android 빌드에는 Android Studio도 필요)

```bash
npm install
npm run dev      # 브라우저에서 실행
npm run check    # 프라이버시 검사 + 타입 검사 + 테스트 + 빌드
```

구조와 설계는 [docs/architecture.md](docs/architecture.md)에 정리되어 있어요.

## 기여하기

누구나 기여할 수 있어요. 이슈, 버그 제보, 번역, 코드 모두 환영합니다.
시작하기 전에 [CONTRIBUTING.md](CONTRIBUTING.md)의 프라이버시 규칙을 꼭 읽어 주세요.

보안 문제는 공개 이슈 대신 [SECURITY.md](SECURITY.md)의 방법으로 알려 주세요.

## 라이선스

[MIT](LICENSE)
