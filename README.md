<div align="center">

# 🐋 고래사천성 — Whale Connect

**고래상사 멤버들을 이어 모두 제거하는 마작 스타일 퍼즐 게임**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](#)

### [▶ 지금 바로 플레이하기](https://whale-connect.web.app)

[🐛 버그 제보](https://github.com/Jaykim98z/whale-connect/issues)

</div>

---

## 📖 프로젝트 소개

**고래사천성**은 SOOP(구 아프리카TV) 스트리머 그룹 **고래상사**의 팬 게임입니다.  
멤버 15명과 팬캐릭터 카드를 마작 패 연결 방식(사천성 룰)으로 제거하며, 7개 스테이지를 통해 점수를 겨루는 퍼즐 게임입니다.

SOOP 아이디로 닉네임·프로필 이미지를 자동 조회하고, 전 세계 TOP 100 랭킹에 점수를 등록할 수 있습니다.

> 게임 로직은 **순수 reducer**로 클라이언트에서 동작하고, 랭킹 저장만 **Cloud Function**을 거칩니다.  
> 경로 탐색 알고리즘, 반응형 보드 레이아웃, Web Audio API 사운드 합성 등 프론트엔드 심화 기법을 집약했습니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🎮 **7단계 스테이지** | 8×10 → 8×16 보드, 단계마다 크기 확장 + 장애물 추가 |
| 🐟 **멤버 + 팬캐릭** | 멤버 15명은 항상 등장, 팬캐릭 11종 중 스테이지마다 1~6종 랜덤 선발 |
| 🔥 **콤보** | 3초 안에 연속 매칭 시 콤보당 +2점 (최대 5콤보) |
| 🔗 **경로 연결 알고리즘** | 0·1·2회 꺾임 허용, 장애물 우회, 보드 외곽 통과 지원 |
| ⏱️ **실시간 타이머** | 100초 제한, 판 클리어 시 +60초 보너스 |
| 🎁 **아이템 카드** | 시간추가(+5초), 셔플(보드 재배치) |
| 🚧 **장애물 타일** | 경로를 막는 고정 타일 (스테이지 2부터 등장) |
| 3️⃣ **스테이지 전환 카운트다운** | 판 클리어 후 3·2·1 카운트 → 다음 스테이지 (카운트 중 타이머 정지) |
| 🏆 **7스테이지 클리어 엔딩** | 전 스테이지 클리어 시 전용 결과 화면 + 잔여 시간 보너스, 랭킹에 왕관 표시 |
| 🔍 **보드 크기 조절** | 60~160% 확대·축소, localStorage 저장 |
| 🔊 **사운드** | BGM·게임오버 MP3 + Web Audio API 효과음 합성, 볼륨 localStorage 영속 저장 |
| 👥 **멀티플레이 대전** | 방 코드로 2~12명이 모여 같은 10×18 보드를 120초 동안 각자 풀고 실시간 순위표로 경쟁 |
| 🌐 **글로벌 랭킹** | Firebase Firestore 기반 TOP 100 실시간 랭킹 |
| 👤 **SOOP 프로필 연동** | SOOP API로 닉네임·프로필 이미지 자동 조회 |
| 🔇 **음소거 & 볼륨** | localStorage 기반 설정 영속 저장 |
| 📱 **반응형** | `dvh` + CSS `min()` 공식으로 모바일~데스크탑 대응 |

---

## 🛠️ 기술 스택

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| **React** | 19 | UI 컴포넌트, 상태 관리 |
| **TypeScript** | 5.9 | 타입 안전성 |
| **Vite** | 7 | 빌드 도구 |
| **Vitest** | 5 | 게임 로직 단위 테스트 |
| **Lucide React** | 0.575 | 아이콘 |
| **CSS Variables** | — | 동적 보드 크기 계산 |

### Backend / Infra
| 기술 | 용도 |
|------|------|
| **Firebase Firestore** | 랭킹 데이터 저장·조회 |
| **Cloud Functions (v2)** | 랭킹 저장 (`saveRanking`, 서울 리전) |
| **Firebase Realtime Database** | 멀티플레이 방 상태·점수 실시간 동기화 |
| **Firebase Analytics** | 이벤트 트래킹 |
| **Firebase Hosting** | 정적 사이트 배포 |
| **SOOP Public API** | 스트리머 닉네임·프로필 이미지 조회 |

### 사운드
| 기술 | 용도 |
|------|------|
| **HTMLAudioElement** | BGM(`bgm.mp3`) · 게임오버(`gameover.mp3`) 재생 |
| **Web Audio API** | 매칭 성공·실패·카드 선택 효과음 실시간 합성 |

---

## 🎮 게임 방법

```
1. 같은 카드 2장을 클릭하여 연결하세요.
2. 연결 경로는 최대 2번까지 꺾일 수 있습니다.
3. 경로는 빈 칸만 통과할 수 있습니다 (장애물 통과 불가).
4. 보드의 모든 카드를 제거하면 다음 스테이지로 진출합니다.
5. 7스테이지를 모두 클리어하면 전용 엔딩 화면과 함께 최종 점수가 집계됩니다.
6. 시간이 0이 되면 게임 종료 — 점수를 랭킹에 등록하세요!
```

### 점수 체계
| 이벤트 | 점수 |
|--------|------|
| 카드 1쌍 매칭 성공 | +10점 |
| 콤보 (직전 매칭 후 3초 이내) | 콤보당 +2점 (최대 5콤보 = +10점) |
| 매칭 실패 (연결 불가 또는 다른 카드 선택) | 감점 없음 |
| 판 클리어 보너스 | +100점, 다음 스테이지 +60초 |
| 남은 시간 보너스 (전 클리어 시) | +(잔여 초 × 10)점 |

### 아이템
- ⏱️ **시간추가 카드** — 매칭 시 +5초
- 🔀 **셔플 카드** — 매칭 시 셔플 1회 충전 → HUD 버튼으로 사용

### 멀티플레이 대전

타이틀의 **멀티플레이**에서 방을 만들거나 6자리 코드(또는 초대 링크)로 입장합니다. 방장이 시작하면 전원이 같은 보드로 동시에 출발합니다.

| 항목 | 규칙 |
|------|------|
| 보드 | 10 × 18, 장애물 12개, 카드 168장 (모두 같은 배치로 시작) |
| 제한 시간 | 120초 고정 — 일시정지 없음 |
| 점수 | 쌍당 +10점, 콤보 없음 |
| 클리어 | +100점, 잔여 초 × 10점 |
| 아이템 | 셔플 카드만 등장. 장애물 부수기 2회를 갖고 시작 (장애물을 클릭해 사용) |
| 순위 | 점수 높은 순, 동점이면 그 점수에 먼저 도달한 사람 |

결과는 그 방의 순위표로만 보여주고 저장하지 않습니다. 설계 배경은 `docs/superpowers/specs/2026-10-08-multiplayer-versus-design.md`에 있습니다.

---

## 🏗️ 아키텍처 & 프로젝트 구조

```
src/
├── components/
│   ├── Game.tsx             # useReducer + 훅 + UI 조립
│   ├── Hud.tsx              # 점수·타이머·버튼·볼륨
│   ├── PauseOverlay.tsx     # 일시정지·홈 확인
│   ├── ResultOverlay.tsx    # 시간 종료·전체 클리어 결과
│   ├── CountdownOverlay.tsx # 스테이지 전환 카운트다운
│   ├── BoardSizePanel.tsx   # 보드 크기 조절 패널
│   ├── Board.tsx            # 보드 렌더링 (CSS 변수 주입)
│   ├── Card.tsx             # 개별 카드 컴포넌트
│   ├── StartScreen.tsx      # 타이틀 화면
│   ├── Ranking/
│   │   ├── RankingModal.tsx         # 랭킹 조회 모달
│   │   └── RankingRegisterModal.tsx # 점수 등록 모달
│   └── Footer/
│       └── Footer.tsx       # 하단 푸터
│
├── hooks/
│   ├── useGameScheduler.ts  # 타이머·애니메이션·카운트다운·콤보 만료 → reducer 액션
│   └── useGameEvents.ts     # reducer 이벤트 → 효과음·메시지, BGM
│
├── game/
│   ├── gameReducer.ts       # 게임 규칙 전체 (순수 함수)
│   ├── connectLogic.ts      # 경로 탐색 알고리즘 (핵심)
│   ├── boardLogic.ts        # 보드 생성·셔플·클리어 판정
│   ├── stages.ts            # 7스테이지 보드 설정, 팬캐릭 선발
│   ├── rng.ts               # 시드 기반 난수 (mulberry32)
│   ├── format.ts            # 시간 표시 변환
│   ├── constants.ts         # 카드 정의, 게임 상수
│   ├── sounds.ts            # Web Audio API 사운드 합성
│   └── *.test.ts            # Vitest 단위 테스트
│
└── services/
    ├── firebase.ts          # 랭킹 조회, saveRanking 호출
    └── soopAPI.ts           # SOOP 프로필 미리보기 조회

functions/src/index.ts       # saveRanking Cloud Function
firestore.rules              # 랭킹 읽기 전용 규칙
```

---

## 🧠 핵심 구현 상세

### 1. 경로 탐색 알고리즘 (`connectLogic.ts`)

사천성 룰의 핵심인 **최대 2회 꺾임 경로 탐색**을 구현했습니다.

```
경우 1: 꺾임 없음 (0 turns)
  A ──────── B   같은 행 또는 열의 직선 경로

경우 2: 꺾임 1회 (1 turn)
  A ────┐
        │
        B   L자형 코너 경로

경우 3: 꺾임 2회 (2 turns)
  A ────┐
        │
  B ────┘   Z·U자형 경로 (보드 외곽 통과 포함)
```

**핵심 특징:**
- 보드 바깥(−1 인덱스, rows/cols+1 인덱스)을 **가상 빈 공간**으로 취급 → 보드 외곽을 돌아가는 경로 지원
- 장애물 타일(`OBSTACLE_ID = -1`)은 `null`이 아니므로 경로 차단
- O(rows + cols)의 간결한 선형 스캔으로 2회 꺾임 탐색

```typescript
// 보드 바깥을 자동으로 빈 공간으로 처리
function isPassable(board: Board, r: number, c: number): boolean {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return true; // 외곽 = 통과 가능
  return board[r][c] === null;
}
```

---

### 2. 반응형 보드 크기 — CSS `min()` 공식 (`Board.css`)

모바일부터 와이드 모니터까지 보드가 항상 최대 크기로 꽉 차도록, **CSS Custom Properties + `min()` 함수**로 JavaScript 없이 정확한 종횡비를 유지합니다.

```css
.board {
  --bmax-w: 82vw;
  --bmax-h: calc(100dvh - 180px);

  /* 너비 bound vs 높이 bound 중 작은 쪽 선택 */
  width:  min(var(--bmax-w),  calc(var(--bmax-h) * var(--board-w) / var(--board-h)));
  height: min(var(--bmax-h),  calc(var(--bmax-w) * var(--board-h) / var(--board-w)));
}
```

`--board-w` / `--board-h`는 React에서 stage가 바뀔 때 인라인 스타일로 주입됩니다.  
이 방식으로 Grid 컨테이너의 **암묵적 크기 계산 붕괴(intrinsic size collapse)** 버그를 해결했습니다.

---

### 3. 사운드 시스템 (`sounds.ts`)

**BGM & 게임오버**는 `HTMLAudioElement`로 MP3 파일을 재생하고, **효과음 3종**은 외부 파일 없이 Web Audio API로 실시간 합성합니다.

| 사운드 | 방식 | 특성 |
|--------|------|------|
| BGM | `HTMLAudioElement` (`bgm.mp3`) | 루프 재생, 볼륨 슬라이더 연동 |
| 게임오버 | `HTMLAudioElement` (`gameover.mp3`) | 타이머 0 시 자동 재생 |
| 매칭 성공 | Web Audio API | C5(523Hz) → G5(784Hz) 상승 2음 |
| 매칭 실패 | Web Audio API | 220Hz → 140Hz 하강 글리산도 |
| 카드 선택 | Web Audio API | 900Hz → 600Hz 짧은 틱 |

음소거 상태와 볼륨 값 모두 `localStorage`에 영속 저장되어 페이지 재방문 시 이전 설정이 유지됩니다.

---

### 4. 랭킹 시스템 — Cloud Function 저장 (`functions/src/index.ts`)

클라이언트는 랭킹을 **읽기만** 하고, 저장은 `saveRanking` Cloud Function 하나로만 이뤄집니다.

**저장 흐름:**
1. 클라이언트는 `soopId`, `score`, `stageReached`(도달 스테이지), `cleared`(전체 클리어 여부)만 전송
2. 서버가 SOOP API로 닉네임·프로필 이미지를 직접 조회 (클라이언트 값 위조 불가)
3. 고래상사 멤버 여부도 서버의 멤버 목록으로만 판정
4. **Firestore 트랜잭션** 안에서 기존 기록(두 랭킹 중 최고점) 비교 → TOP 100 진입 판정 → 기존 문서 삭제 + 새 문서 추가
   - 일반 사용자: 전체 TOP 100에 들 때만 등록
   - 고래상사 멤버: 멤버 랭킹에는 항상 등록, 전체 랭킹은 TOP 100에 들 때만
5. 트랜잭션 후 전체 랭킹의 TOP 100 밖 문서 정리

**보안 규칙:** 두 랭킹 컬렉션 모두 `read: true`, `write: false`. Admin SDK만 쓸 수 있습니다.  
비정상 점수는 운영자가 Firebase 콘솔에서 직접 삭제합니다.

**고래상사 멤버 전용 랭킹:** `wc-rankings-wc` 컬렉션에 별도 저장, 멤버 전용 순위표 제공

---

### 5. countPossiblePairs 성능 최적화 (`boardLogic.ts`)

가능한 매칭 쌍을 계산할 때, 타입이 다른 카드끼리는 절대 매칭되지 않으므로 **Map으로 타입별 그룹핑** 후 같은 타입끼리만 경로 탐색합니다.

```typescript
// 타입별로 셀을 그룹화 → 같은 타입 내에서만 findPath 호출
const groups = new Map<number, { r: number; c: number }[]>();
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const v = board[r][c];
    if (v === null || v === OBSTACLE_ID) continue;
    const group = groups.get(v);
    if (group) group.push({ r, c });
    else groups.set(v, [{ r, c }]);
  }
}
```

> S5 기준: 전체 비교 루프 **8,911회 → 406회** (약 95% 감소)

---

### 6. 순수 reducer + 스케줄러 (`gameReducer.ts`, `hooks/`)

게임 규칙 전체(선택·매칭·점수·아이템·스테이지 전환·타이머)를 **부수효과 없는 `gameReducer`** 하나에 모았습니다.

- **시드 기반 난수:** 보드 생성·셔플에 쓰는 난수 시드를 상태에 저장 → 같은 시드면 항상 같은 결과, 테스트가 결정적
- **이벤트 큐:** 효과음·메시지는 reducer가 `events`에 쌓기만 하고 `useGameEvents`가 소비
- **시간 흐름은 훅이 담당:** `useGameScheduler`가 `TICK`·`MATCH_RESOLVE`·`COUNTDOWN_TICK` 등을 dispatch
- **`gameId` 가드:** 모든 타이머 액션에 판 번호를 실어, 새 게임을 시작하면 이전 판의 늦은 타이머는 reducer가 무시
- **ms 단위 타이머:** 실제 경과 시간만큼 차감하고, 멈출 때 잔여분을 flush → 일시정지 연타로 시간이 새지 않음

```typescript
// 매칭 애니메이션이 끝났을 때 — 게임이 이미 끝났거나 다른 판이면 무시
case 'MATCH_RESOLVE':
  return resolveMatch(s, action.matchId); // phase·pending 확인 후 보드 갱신, 클리어 판정
```

`npm test`로 경로 탐색·보드 생성·게임 규칙 전체를 UI 없이 검증합니다.

---

## 📋 스테이지 구성

| 스테이지 | 보드 크기 | 장애물 | 카드 수 | 캐릭터 종류 | 아이템 (종류당) |
|:--------:|:---------:|:------:|:-------:|------------|:------:|
| 1 | 8 × 10 | 0개 | 80장 | 멤버 15 + 팬캐릭 1 | 1쌍 |
| 2 | 8 × 12 | 2개 | 94장 | 멤버 15 + 팬캐릭 1 | 1쌍 |
| 3 | 8 × 12 | 4개 | 92장 | 멤버 15 + 팬캐릭 2 | 1쌍 |
| 4 | 8 × 14 | 8개 | 104장 | 멤버 15 + 팬캐릭 3 | 2쌍 |
| 5 | 8 × 14 | 10개 | 102장 | 멤버 15 + 팬캐릭 4 | 2쌍 |
| 6 | 8 × 16 | 14개 | 114장 | 멤버 15 + 팬캐릭 5 | 3쌍 |
| 7 | 8 × 16 | 16개 | 112장 | 멤버 15 + 팬캐릭 6 | 3쌍 |

캐릭터별 장 수는 `stages.ts`의 공식으로 자동 분배됩니다 (모두 짝수). 팬캐릭은 스테이지마다 랜덤으로 선발됩니다.

---

## 🚀 로컬 실행

### 사전 요구사항
- Node.js 20+
- npm 9+
- Firebase 프로젝트 (Firestore 활성화, Cloud Functions 사용을 위해 Blaze 플랜)

### 설치 & 실행

```bash
# 저장소 클론
git clone https://github.com/Jaykim98z/whale-connect.git
cd whale-connect

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 Firebase 키 입력

# 개발 서버 실행
npm run dev

# 테스트 실행
npm test
```

### 빌드 & 배포

랭킹 저장이 Cloud Function을 거치므로 **functions → hosting → rules** 순서로 배포합니다.  
(rules를 먼저 배포하면 새 함수가 올라가기 전까지 랭킹 등록이 불가능합니다)

```bash
# 1. Cloud Functions (predeploy에서 자동 빌드)
firebase deploy --only functions

# 2. Realtime Database 규칙 (멀티플레이)
firebase deploy --only database

# 3. 프로덕션 빌드 후 Hosting
npm run build
firebase deploy --only hosting

# 4. Firestore 보안 규칙
firebase deploy --only firestore:rules
```

---

## ⚙️ 환경변수 설정

`.env` 파일을 생성하고 아래 값을 입력합니다.  
(`.env`는 `.gitignore`에 포함되어 있어 Git에 업로드되지 않습니다)

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
# 멀티플레이 (Realtime Database) — 비워 두면 멀티플레이 버튼이 숨겨집니다
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.asia-southeast1.firebasedatabase.app
```

---

## 🎨 캐릭터 일람

멤버 15명(항상 등장) + 팬캐릭 11종(스테이지마다 랜덤) + 아이템 카드 2종, 총 28종 카드로 구성됩니다.

| 구분 | 캐릭터 |
|------|--------|
| 멤버 (id 0–14) | 감자가비, 견자희, 김마렌, 멜로딩딩, 밀크티냠, 빡소, 삐요코, 쏭이, 울큰고, 이지수, 조아라, 채하나, 희희덕, 묵아, 셀키 |
| 팬캐릭 (id 15–25) | 고래, 새우, 올챙구, 쭈꾸미, 쑤벌, 아부, 티백이, 빡릴라, 잎새, 다시마, 스윗가비단 |
| 아이템 (id 26–27) | 시간추가(+5초), 셔플(1회 충전) |

---

## 🗺️ 향후 개선 계획

- [ ] 모바일 터치 최적화 및 PWA 지원

---

## 📜 라이선스

MIT License — 자유롭게 사용·수정·배포 가능합니다.  
단, 고래상사 멤버 캐릭터 이미지의 저작권은 각 스트리머에게 있습니다.

---

<div align="center">

**고래상사 팬 게임** · Made with ❤️ by Jay

[▶ 플레이하기](https://whale-connect.web.app) · [⬆ 맨 위로](#-고래사천성--whale-connect)

</div>
