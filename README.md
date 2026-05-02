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
18명의 멤버 캐릭터 카드를 마작 패 연결 방식(사천성 룰)으로 제거하며, 5개 스테이지를 통해 점수를 겨루는 퍼즐 게임입니다.

SOOP 아이디로 닉네임·프로필 이미지를 자동 조회하고, 전 세계 TOP 100 랭킹에 점수를 등록할 수 있습니다.

> 이 프로젝트는 **백엔드 없이 클라이언트 단독**으로 동작합니다.  
> 경로 탐색 알고리즘, 반응형 보드 레이아웃, Web Audio API 사운드 합성 등 프론트엔드 심화 기법을 집약했습니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🎮 **5단계 스테이지** | 8×10 → 8×18 보드, 단계마다 크기 확장 + 장애물 추가 |
| 🔗 **경로 연결 알고리즘** | 0·1·2회 꺾임 허용, 장애물 우회, 보드 외곽 통과 지원 |
| ⏱️ **실시간 타이머** | 100초 제한, 판 클리어 시 +60초 보너스 |
| 🎁 **아이템 카드** | 시간추가(+5초), 셔플(보드 재배치) |
| 🚧 **장애물 타일** | 경로를 막는 고정 타일 (스테이지 2부터 등장) |
| 🏆 **5스테이지 클리어 엔딩** | 전 스테이지 클리어 시 전용 결과 화면 + 잔여 시간 보너스 |
| 🔊 **Web Audio 사운드** | 외부 파일 없이 Web Audio API로 실시간 사운드 합성 |
| 🌐 **글로벌 랭킹** | Firebase Firestore 기반 TOP 100 실시간 랭킹 |
| 👤 **SOOP 프로필 연동** | SOOP API로 닉네임·프로필 이미지 자동 조회 |
| 🔇 **음소거** | localStorage 기반 설정 영속 저장 |
| 📱 **반응형** | `dvh` + CSS `min()` 공식으로 모바일~데스크탑 대응 |

---

## 🛠️ 기술 스택

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| **React** | 19 | UI 컴포넌트, 상태 관리 |
| **TypeScript** | 5.9 | 타입 안전성 |
| **Vite** | 7 | 빌드 도구 |
| **Lucide React** | 0.575 | 아이콘 |
| **CSS Variables** | — | 동적 보드 크기 계산 |

### Backend / Infra
| 기술 | 용도 |
|------|------|
| **Firebase Firestore** | 랭킹 데이터 저장·조회 |
| **Firebase Analytics** | 이벤트 트래킹 |
| **Firebase Hosting** | 정적 사이트 배포 |
| **SOOP Public API** | 스트리머 닉네임·프로필 이미지 조회 |

### 사운드
| 기술 | 용도 |
|------|------|
| **Web Audio API** | 브라우저 내장 사운드 합성 (외부 파일 불필요) |

---

## 🎮 게임 방법

```
1. 같은 카드 2장을 클릭하여 연결하세요.
2. 연결 경로는 최대 2번까지 꺾일 수 있습니다.
3. 경로는 빈 칸만 통과할 수 있습니다 (장애물 통과 불가).
4. 보드의 모든 카드를 제거하면 다음 스테이지로 진출합니다.
5. 5스테이지를 모두 클리어하면 전용 엔딩 화면과 함께 최종 점수가 집계됩니다.
6. 시간이 0이 되면 게임 종료 — 점수를 랭킹에 등록하세요!
```

### 점수 체계
| 이벤트 | 점수 |
|--------|------|
| 카드 1쌍 매칭 | +10점 |
| 판 클리어 보너스 | +100점 |
| 남은 시간 보너스 (전 클리어 시) | +(잔여 초 × 10)점 |

### 아이템
- ⏱️ **시간추가 카드** — 매칭 시 +5초
- 🔀 **셔플 카드** — 매칭 시 셔플 1회 충전 → HUD 버튼으로 사용

---

## 🏗️ 아키텍처 & 프로젝트 구조

```
src/
├── components/
│   ├── Game.tsx          # 메인 게임 로직 및 상태 관리
│   ├── Board.tsx         # 보드 렌더링 (CSS 변수 주입)
│   ├── Card.tsx          # 개별 카드 컴포넌트
│   ├── StartScreen.tsx   # 타이틀 화면
│   ├── Ranking/
│   │   ├── RankingModal.tsx         # 랭킹 조회 모달
│   │   └── RankingRegisterModal.tsx # 점수 등록 모달
│   └── Footer/
│       └── Footer.tsx    # 하단 푸터
│
├── game/
│   ├── connectLogic.ts   # 경로 탐색 알고리즘 (핵심)
│   ├── boardLogic.ts     # 보드 생성·셔플·클리어 판정
│   ├── constants.ts      # 카드 정의, 게임 상수
│   └── sounds.ts         # Web Audio API 사운드 합성
│
└── services/
    ├── firebase.ts       # Firestore CRUD, 랭킹 로직
    └── soopAPI.ts        # SOOP 프로필 API 연동
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

### 3. Web Audio API 사운드 합성 (`sounds.ts`)

MP3/WAV 파일 없이 **브라우저 내장 Web Audio API**로 3종 효과음을 실시간 합성합니다.

| 효과음 | 주파수 | 특성 |
|--------|--------|------|
| 매칭 성공 | C5(523Hz) → G5(784Hz) | 2음 상승 (밝고 경쾌) |
| 매칭 실패 | 220Hz → 140Hz | 하강 글리산도 (둔탁) |
| 카드 선택 | 900Hz → 600Hz | 짧은 틱 소리 |

음소거 상태는 `localStorage`에 영속 저장되며, 모듈 레벨 변수로 관리해 컴포넌트 리렌더링과 무관하게 동작합니다.

---

### 4. Firebase Firestore 랭킹 시스템 (`firebase.ts`)

**중복 방지·갱신 로직:**
1. 동일 `soopId`의 기존 점수 조회
2. 새 점수가 기존보다 낮으면 저장 거부
3. 높으면 기존 문서 삭제 후 새 문서 추가 (upsert)
4. 저장 후 TOP 100 초과 문서를 `WriteBatch`로 원자적 일괄 삭제

**보안 규칙:**  
Firestore Security Rules로 클라이언트 조작을 방어합니다.
- `score` 범위 강제 (0 < score ≤ 99999)
- `timestamp` 서버 타임스탬프 일치 검증 (클라이언트 임의값 차단)
- `update` 전면 차단 (기존 기록 조작 불가)
- 필드 타입·길이 강제 (playerName, soopId 1~50자)

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

### 6. React StrictMode 대응 — 순수 updater 함수

React 18+ StrictMode에서 `setState` updater는 **2회 호출**될 수 있습니다.  
ref 뮤테이션을 updater 내부에서 수행하면 중복 실행 시 버그가 발생하므로, 부수효과를 updater 바깥으로 분리했습니다.

```typescript
// Before (StrictMode 버그 위험)
setBoard(prev => {
  pendingRef.current.delete(keyA); // 부수효과 — 2회 호출 시 문제
  return nextBoard;
});

// After (순수 함수)
pendingRef.current.delete(keyA);  // updater 외부에서 처리
pendingRef.current.delete(keyB);
setBoard(prev => nextBoard);      // 순수 계산만 수행
```

---

## 📋 스테이지 구성

| 스테이지 | 보드 크기 | 장애물 | 카드 수 | 특징 |
|:--------:|:---------:|:------:|:-------:|------|
| 1 | 8 × 10 | 0개 | 80장 | 튜토리얼 |
| 2 | 8 × 12 | 4개 | 92장 | 장애물 첫 등장 |
| 3 | 8 × 14 | 6개 | 106장 | 아이템 카드 증가 |
| 4 | 8 × 16 | 8개 | 120장 | 고난이도 |
| 5 | 8 × 18 | 10개 | 134장 | 최고 난이도, 클리어 시 전용 엔딩 |

---

## 🚀 로컬 실행

### 사전 요구사항
- Node.js 18+
- npm 9+
- Firebase 프로젝트 (Firestore 활성화)

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
```

### 빌드 & 배포

```bash
# 프로덕션 빌드
npm run build

# Firebase Hosting 배포
firebase deploy
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
```

---

## 🎨 캐릭터 일람

고래상사 소속 스트리머 16인 + 아이템 카드 2종, 총 18종 카드로 구성됩니다.

| ID | 캐릭터 | 색상 |
|----|--------|------|
| 0 | 감자가비 | 연두 |
| 1 | 견자희 | 민트 |
| 2 | 고래 | 하늘 |
| 3 | 김마렌 | 스카이블루 |
| 4 | 멜로딩딩 | 라벤더 |
| 5 | 밀크티냠 | 핑크 |
| 6 | 빡쏘 | 브라운 |
| 7 | 삐요코 | 크림 |
| 8 | 새우 | 살몬 |
| 9 | 쏭이 | 퍼플블루 |
| 10 | 온자두 | 코랄 |
| 11 | 울큰고 | 다크그레이 |
| 12 | 이지수 | 퍼플 |
| 13 | 조아라 | 오렌지 |
| 14 | 채하나 | 화이트 |
| 15 | 희희덕 | 옐로우 |
| 16 | ⏱️ 시간추가 | 블랙 (아이템) |
| 17 | 🔀 셔플 | 블랙 (아이템) |

---

## 🗺️ 향후 개선 계획

- [ ] Cloud Functions 서버사이드 점수 검증 (Firebase Blaze 플랜 업그레이드 시)
- [ ] 번들 코드 스플리팅 (현재 단일 청크 511KB)
- [ ] 모바일 터치 최적화 및 PWA 지원

---

## 📜 라이선스

MIT License — 자유롭게 사용·수정·배포 가능합니다.  
단, 고래상사 멤버 캐릭터 SVG 이미지의 저작권은 각 스트리머에게 있습니다.

---

<div align="center">

**고래상사 팬 게임** · Made with ❤️ by Jay

[▶ 플레이하기](https://whale-connect.web.app) · [⬆ 맨 위로](#-고래사천성--whale-connect)

</div>
