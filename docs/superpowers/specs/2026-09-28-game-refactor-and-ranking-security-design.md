# 게임 구조 개선 · 버그 수정 · 랭킹 보안 설계

- 작성일: 2026-09-28
- 범위: (C) Game.tsx 구조 개선 + (B) 게임 로직 버그 수정 + (A) 랭킹 보안 강화 + 문서 정리

## 1. 배경

`src/components/Game.tsx`(638줄)가 상태 20여 개·ref 6개·타이머·카운트다운·매칭 애니메이션·오버레이 UI를 모두 담당한다. 상태가 흩어져 있어 다음 버그가 발생한다.

| # | 버그 | 원인 |
|---|------|------|
| B5 | 스테이지 전환 카운트다운 중 "새 게임" → 1스테이지인데 2스테이지 보드로 덮어써짐 | `startGame`이 `countdown`/`nextBoardRef`를 초기화하지 않음 |
| B6 | 일시정지 연타 시 시간이 거의 줄지 않음 | 재개마다 1초 `setInterval`을 새로 시작해 1초 미만 진행분 손실 |
| B7 | 게임 오버 후 진행 중이던 매칭 애니메이션이 점수를 가산 | `setTimeout` 콜백이 phase를 확인하지 않음 |
| B8 | `setTimeLeft` 업데이터 안에서 `setPhase`/`stopTimer` 호출 | 업데이터 내 부수효과 (StrictMode 2회 호출 위험) |

랭킹은 클라이언트가 Firestore에 직접 쓴다.

| # | 문제 |
|---|------|
| A1 | `firestore.rules`의 `allow delete: if true` → 누구나 랭킹 전체 삭제 가능 |
| A2 | `playerName`/`profileImage`/`isWC`를 클라이언트가 결정 → 멤버 랭킹 사칭·닉네임 위조 가능 |
| A3 | `saveScore`가 조회→삭제→추가를 트랜잭션 없이 수행, 멤버 랭킹 컬렉션은 정리되지 않음 |

Firebase 플랜은 이미 Blaze이다.

## 2. 목표 / 비목표

**목표**
- 게임 규칙 전체를 순수 reducer로 옮겨 UI 없이 테스트 가능하게 한다.
- B5~B8을 구조적으로 제거하고 회귀 테스트로 고정한다.
- 랭킹 쓰기를 Cloud Function으로 일원화하고 클라이언트 쓰기를 전면 차단한다.

**비목표**
- 점수 진위 검증(세션·리플레이 검증). 사용자가 하루 최대 50명 수준이며, 이상 점수는 운영자가 Firebase 콘솔에서 수동 삭제한다.
- Firestore 데이터 구조 변경·마이그레이션.
- 시각 디자인 변경. 기존 CSS 클래스명을 유지한다.

## 3. 게임 구조 (C + B)

### 3.1 파일 구성

```
src/game/
  rng.ts              # 시드 기반 난수 (mulberry32). next(seed) → { value, seed }
  stages.ts           # getBoardConfig(stage) — Game.tsx에서 이동
  boardLogic.ts       # generateBoardWithObstacles / shuffleBoard가 rng 함수를 인자로 받음
  connectLogic.ts     # 변경 없음
  gameReducer.ts      # GameState, GameAction, GameEvent, gameReducer, createInitialState
  *.test.ts           # Vitest
src/hooks/
  useGameScheduler.ts # 시간 흐름 → dispatch (TICK, MATCH_*, COUNTDOWN_TICK, AUTO_SHUFFLE, FINISH_CLEAR)
  useGameEvents.ts    # events 소비 → 효과음·아이템 메시지 / phase 기반 BGM·게임오버 사운드
src/components/
  Hud.tsx             # 스테이지·점수·쌍·타이머·버튼·볼륨 팝업 (음소거/볼륨은 로컬 상태)
  PauseOverlay.tsx    # 일시정지 + 홈 확인 다이얼로그
  ResultOverlay.tsx   # variant: 'gameover' | 'cleared'
  CountdownOverlay.tsx
  Game.tsx            # useReducer + 훅 + 컴포넌트 조립 (~100줄 목표)
```

### 3.2 GameState

```ts
type Phase = 'title' | 'playing' | 'gameover' | 'cleared';

interface PendingMatch {
  id: number;
  a: [number, number];
  b: [number, number];
  path: [number, number][];
  typeId: number;
  step: 'path' | 'vanish';   // path: 경로 표시 중, vanish: 사라지는 애니메이션 중
}

interface GameState {
  phase: Phase;
  gameId: number;            // START마다 +1
  rngSeed: number;
  stage: number;             // 1~5
  board: Board;
  boardVersion: number;      // 보드가 바뀔 때마다 +1
  selected: [number, number] | null;
  pendingMatches: PendingMatch[];
  nextMatchId: number;
  score: number;
  timeLeftMs: number;
  possiblePairs: number;
  shuffleCharge: number;
  isPaused: boolean;
  countdown: number | null;  // 3,2,1,0 / null
  nextBoard: Board | null;
  clearing: boolean;         // 5스테이지 클리어 후 FINISH_CLEAR 대기
  clearStats: { matchScore: number; clearBonus: number; timeBonus: number };
  finalScore: number;
  events: GameEvent[];       // 소비 측이 id로 중복 처리 방지
  nextEventId: number;
}

type GameEventType =
  | 'select' | 'matchSuccess' | 'matchFail'
  | 'itemTime' | 'shuffleCharged' | 'shuffleUsed' | 'autoShuffle'
  | 'stageClear';
interface GameEvent { id: number; type: GameEventType }
```

`events`는 최근 20개만 유지한다(무한 증가 방지).

### 3.3 액션

모든 타이머 유래 액션은 `gameId`를 포함하며, `gameId !== state.gameId`면 reducer가 상태를 그대로 반환한다.

| 액션 | 동작 |
|------|------|
| `START {seed}` | 상태 전체를 새로 생성(gameId+1). 1스테이지 보드 생성, 시간 100초, 점수 0 |
| `GO_TITLE` | phase='title', pending/countdown/nextBoard 초기화 |
| `PAUSE` / `RESUME` | isPaused 토글. playing이 아니면 무시 |
| `CLICK {r,c}` | 3.4 참조 |
| `MATCH_REVEAL {gameId, matchId}` | 해당 pending의 step을 'vanish'로 |
| `MATCH_RESOLVE {gameId, matchId}` | 3.5 참조 |
| `TICK {gameId, deltaMs}` | playing·비일시정지·countdown=null·!clearing일 때만 차감. 0 이하 → phase='gameover', finalScore=score, pendingMatches=[] |
| `COUNTDOWN_TICK {gameId}` | countdown 3→2→1→0(화면에 "GO!" 1초 표시). 0에서 받으면 board=nextBoard, countdown=null, boardVersion+1, possiblePairs 재계산 |
| `AUTO_SHUFFLE {gameId, boardVersion}` | boardVersion 일치 + possiblePairs=0 + 보드 미클리어일 때만 셔플, selected=null, 'autoShuffle' 이벤트 |
| `MANUAL_SHUFFLE` | playing·비일시정지·countdown=null·pending 없음·shuffleCharge≥1일 때 셔플, charge-1, 'shuffleUsed' 이벤트 |
| `FINISH_CLEAR {gameId}` | clearing일 때 phase='cleared' |

### 3.4 CLICK 규칙 (기존 동작 유지)

1. 무시: phase≠playing, isPaused, countdown≠null, clearing, 빈칸·장애물, pending 중인 셀
2. 선택 없음 → 선택 + 'select'. 같은 셀 재클릭 → 선택 해제
3. 타입 불일치 또는 `findPath` 실패 → 점수 -5(최소 0), 'matchFail', 새 셀 선택
4. 성공 → pendingMatches 추가(step='path'), selected=null, 'matchSuccess'. 시간 아이템이면 즉시 +5초(`timeLeftMs += 5000`), 'itemTime'

경로 탐색은 pending 셀이 아직 보드에 남아 있는 상태로 수행한다(기존과 동일한 보수적 판정).

### 3.5 MATCH_RESOLVE

1. matchId가 pendingMatches에 없거나 phase≠playing이면 무시 (B7 제거)
2. 두 셀을 null로, pending 제거, 점수 +10, 셔플 아이템이면 charge+1·'shuffleCharged', boardVersion+1, possiblePairs 재계산
3. 보드 클리어 판정(장애물 제외):
   - stage 1~4: 점수 +100, 시간 +60초, stage+1, nextBoard 생성, countdown=3, 'stageClear'
   - stage 5: 점수 +100, timeBonus = ceil(timeLeftMs/1000)×10, matchScore = (5스테이지 +100 반영 후, 시간 보너스 반영 전 점수) − 500, clearBonus=500, 최종 점수 = 그 점수 + timeBonus, finalScore 확정, clearing=true, 'stageClear'. 스케줄러가 420ms 뒤 FINISH_CLEAR

판정이 reducer 내부의 실제 보드로 이뤄지므로 연속 매칭 시의 stale closure 문제가 원천적으로 없다.

### 3.6 스케줄러 (useGameScheduler)

- **TICK**: phase=playing·!isPaused·countdown=null·!clearing 동안 250ms 간격, `performance.now()` 차이를 deltaMs로 전달. 조건이 꺼졌다 켜지면 기준 시각 재설정 (B6 제거)
- **매칭**: 새 pending(step='path')마다 200ms 후 MATCH_REVEAL, 이어서 220ms 후 MATCH_RESOLVE. 타이머는 matchId로 관리해 중복 예약하지 않음
- **COUNTDOWN_TICK**: countdown≠null·!isPaused일 때 1초 후. **동작 변경: 일시정지 시 카운트다운도 멈춤**
- **AUTO_SHUFFLE**: playing·possiblePairs=0·보드 미클리어·countdown=null일 때 1.2초 후 (boardVersion 동봉)
- **FINISH_CLEAR**: clearing=true일 때 420ms 후
- 모든 effect는 cleanup에서 타이머를 해제하고, 액션에 gameId를 싣는다 (B5 제거)

### 3.7 파생 값

Board에 넘기는 `pathCells`·`currentPath`(step='path'인 pending의 경로), `matchedCells`(step='vanish'인 pending의 두 셀)는 `pendingMatches`에서 `useMemo`로 파생한다. HUD 표시 시간은 `Math.ceil(timeLeftMs/1000)`초.

### 3.8 useGameEvents

- 처리한 마지막 event id를 ref로 보관하고 그보다 큰 이벤트만 처리
- select/matchSuccess/matchFail → 효과음. itemTime/shuffleCharged/shuffleUsed/autoShuffle/stageClear → 아이템 메시지(1.8초, 이전 메시지 타이머 취소)
- BGM: playing·!isPaused → 재생, playing·isPaused → 일시정지, 그 외 정지. phase가 gameover로 바뀌면 게임오버 사운드

## 4. 랭킹 보안 (A)

### 4.1 firestore.rules

`wc-rankings`, `wc-rankings-wc` 모두 `allow read: if true; allow write: if false;`. 쓰기는 Admin SDK(Cloud Function)만 가능하다. 운영자는 Firebase 콘솔에서 문서를 수동 삭제한다.

### 4.2 Cloud Function `saveRanking` (asia-northeast3)

입력: `{ soopId: string, score: number }`

1. 검증: soopId 1~50자(소문자·trim), score는 1~99,999 정수 → 실패 시 `invalid-argument`
2. 서버에서 `https://bjapi.afreecatv.com/api/{id}/station` 조회 → 닉네임 없으면 `not-found`. playerName·profileImage는 서버 조회값만 사용(프로필은 `//`로 시작하면 https: 접두, http(s)가 아니면 null)
3. `isWC`는 서버의 멤버 ID 목록으로만 판정 (목록은 functions에만 존재)
4. `db.runTransaction` 내부:
   - 기존 기록 조회(`wc-rankings` where soopId) → score ≤ 기존이면 `already-exists`(기존 점수 포함)
   - TOP 100 조회 → 100개 이상이고 score ≤ 100위 점수면 `failed-precondition`(필요 점수 포함)
   - 기존 문서(두 컬렉션 모두) 삭제, 새 문서 추가(isWC면 멤버 컬렉션에도)
   - 예상 순위 = 나보다 높은 점수 수 + 1
5. 트랜잭션 후 두 컬렉션 모두 100위 밖 문서 일괄 삭제(실패해도 결과에 영향 없음)
6. 반환: `{ success: true, rank, isNewRecord }`

문서 필드 형식은 기존과 동일(score, playerName, soopId, profileImage, isWC, timestamp=serverTimestamp, createdAt).

### 4.3 클라이언트

- `firebase.ts`: `saveScore(score, soopId)`를 `httpsCallable(getFunctions(app, 'asia-northeast3'), 'saveRanking')` 호출로 교체. HttpsError 코드를 기존 결과 타입(`LOWER_THAN_EXISTING`, `TOP_100_REQUIRED`, `NOT_FOUND`, `UNKNOWN`)으로 매핑. `WC_MEMBER_IDS`·`isWCMember` 제거. `trackEvent('ranking_register')`는 성공 시 클라이언트에서 유지
- `RankingRegisterModal`: SOOP 미리보기 조회는 유지(입력 확인용), 제출 시 soopId와 score만 전송
- `vite.config.ts`: `firebase/functions`를 firebase-vendor 청크에 추가

### 4.4 설정·배포

- `firebase.json`에 functions 설정 복구(`source: functions`, predeploy 빌드)
- **배포 순서: functions → 클라이언트(hosting) → rules.** rules를 먼저 배포하면 그 사이 등록이 불가능하다. 배포 명령은 사용자가 실행하거나, 실행 전 사용자 확인을 받는다

## 5. 테스트

Vitest를 devDependency로 추가하고 `npm test`(vitest run) 스크립트를 둔다. `npm run build`(tsc 타입 체크 포함)도 통과해야 한다.

- `connectLogic.test.ts`: 0/1/2회 꺾임, 외곽 우회, 장애물 차단, 3회 꺾임 필요 시 null
- `boardLogic.test.ts`: 동일 시드 → 동일 보드, 스테이지별 카드 수 = rows×cols − 장애물, 모든 타입 짝수, 셔플 후 장애물 위치 불변
- `gameReducer.test.ts`:
  - 선택/해제, 오답 −5(최소 0), 매칭 +10, 시간 아이템 +5초, 셔플 충전·사용
  - 1~4스테이지 클리어 → countdown → 다음 보드 교체, 5스테이지 클리어 보너스·clearStats
  - TICK으로 gameover, 일시정지·카운트다운 중 TICK 무시
  - 회귀: 카운트다운 중 START → 깨끗한 1스테이지(B5), gameover 후 MATCH_RESOLVE 무시(B7), 마지막 두 쌍 연속 매칭 시 스테이지 전환, 이전 gameId 액션 무시
- Cloud Function은 자동 테스트 대상에서 제외하고 에뮬레이터 또는 배포 후 수동 확인(등록·갱신·낮은 점수 거부·없는 ID 거부·클라이언트 직접 쓰기 거부)

## 6. 정리 작업

- README: "백엔드 없이 클라이언트 단독" 문구 수정, 캐릭터 수(17인) 통일, 아키텍처 트리·랭킹 저장 방식·테스트 실행법 반영
- `.env.example` 추가(README의 키 목록, 값은 placeholder)
- `constants.ts`: 사용되지 않는 아이템 `image` 경로 제거(`image` 필드를 optional로), Game.tsx의 옛 counts 주석 제거(stages.ts로 이동하며 정리)

## 7. 구현 순서

1. Vitest 도입 + connectLogic/boardLogic 테스트 (rng 주입 포함)
2. stages.ts 분리, gameReducer TDD 구현
3. 훅·컴포넌트 분리, Game.tsx 교체, 브라우저로 동작 확인
4. Cloud Function·rules·클라이언트 연동
5. README·.env.example·상수 정리

## 8. 개정 (2026-09-30) — 캐릭터 개편 브랜치 기준으로 재적용

위 설계는 `main`(2026-05-06, 5스테이지)을 기준으로 작성됐다. 운영 사이트는 `feat/character-restructure`(2026-08-21)에서 배포되고 있었으므로, 같은 설계를 그 브랜치 위에 다시 적용했다(`claude/v2-refactor`). 구조·버그 수정·보안 원칙은 동일하고, 게임 규칙은 개편 브랜치를 그대로 따른다.

| 항목 | 이 문서 본문 | 재적용 버전 |
|------|------|------|
| 스테이지 | 5 | 7 (`MAX_STAGE`, `stages.ts`) |
| 카드 구성 | 17종 고정 counts | 멤버 15 + 팬캐릭 랜덤 선발(`pickFanchars`, 시드 rng), 공식 분배(`getBoardConfig`) |
| 오답 | −5점 | 감점 없음 |
| 콤보 | 없음 | `combo`·`lastMatchAt` 상태. `MATCH_RESOLVE {at}`로 시각을 받아 3초 창 판정, `COMBO_EXPIRE {at}`로 표시 만료 |
| 자동 셔플 | 카드만 | 장애물 포함(`shuffleBoardWithObstacles`, 연결쌍이 생길 때까지 재시도). 수동 셔플은 카드만 |
| 판 클리어 | +60초 | `stageTimeBonus(nextStage)` (현재 60초) |
| 랭킹 요청 | `{ soopId, score }` | `{ soopId, score, stageReached, cleared }` |
| 멤버 등록 | TOP 100 진입 시만 | 멤버 랭킹에는 항상, 전체 랭킹은 TOP 100 진입 시만 (`wcOnly` 반환). 기존 최고점은 두 랭킹 중 높은 값 |
| 멤버 목록 | 서버에만 | 판정은 서버 목록. 클라이언트 목록은 등록 창 안내 표시용으로만 유지 |
