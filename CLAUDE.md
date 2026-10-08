# Whale_Connect 프로젝트 규칙

## 배포 규칙 (필수)

- **배포(`firebase deploy`)는 절대 독단으로 실행하지 않는다.**
- 배포하기 전에 **반드시 사용자에게 한 번 확인을 받는다.** 사용자가 명시적으로 "배포해", "deploy" 등으로 승인한 경우에만 실행한다.
- 빌드(`npm run build`)나 로컬 서버(`npm run dev`)는 확인 없이 진행해도 되지만, **호스팅 배포는 항상 사전 확인**한다.

## UI 규칙 (필수)

- **기본 윈도우(Segoe UI) 컬러 이모지(🔥 ⭐ 🐋 🎉 등)는 UI에 절대 사용하지 않는다.**
- 강조가 필요하면 텍스트·CSS 스타일(색상, 배지, 그라디언트)로 처리한다.
- lucide-react 같은 아이콘 라이브러리 사용은 허용.

## 배포 절차

랭킹 저장이 Cloud Function(`saveRanking`)을 거치므로 **functions → hosting → rules 순서**를 지킨다.
rules를 먼저 올리면 새 함수·클라이언트가 올라가기 전까지 랭킹 등록이 막힌다. (모두 사용자 승인 후에만)

```
npm test && npm run build
firebase deploy --only functions
firebase deploy --only database
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

- 멀티플레이는 Realtime Database를 쓴다. `database` 규칙(`database.rules.json`)이 hosting보다 먼저 올라가야 새 클라이언트가 방을 만들 수 있다.
- 빌드 전에 `.env`에 `VITE_FIREBASE_DATABASE_URL`이 있는지 확인한다. 없으면 멀티플레이 버튼이 숨겨진 채로 빌드된다.
- 로컬에서 멀티를 시험할 때는 `firebase emulators:start --only database`를 띄우고 `.env.local`에 `VITE_DATABASE_EMULATOR_PORT=9000`을 둔다.

- 운영 사이트의 출처 브랜치를 확인하고 배포한다. `main`이 최신이라고 가정하지 않는다.
- 함수 배포 후 `saveRanking`이 403을 반환하면 Cloud Run `saveranking` 서비스에 공개 호출(allUsers → Cloud Run Invoker) 권한이 있는지 확인한다.

배포 URL: https://whale-connect.web.app
