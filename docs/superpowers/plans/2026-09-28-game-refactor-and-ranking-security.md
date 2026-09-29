# 게임 구조 개선 · 버그 수정 · 랭킹 보안 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Game.tsx의 게임 규칙을 순수 reducer로 옮겨 B5~B8 버그를 구조적으로 제거하고, 랭킹 쓰기를 Cloud Function으로 일원화한다.

**Architecture:** `gameReducer`(순수 함수, 시드 기반 난수)가 모든 규칙을 담당하고, `useGameScheduler`가 시간 흐름을 액션으로, `useGameEvents`가 reducer가 쌓은 이벤트를 사운드·메시지로 바꾼다. 랭킹은 Firestore 규칙으로 클라이언트 쓰기를 막고 `saveRanking` Cloud Function이 SOOP 조회·트랜잭션 저장을 수행한다.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest, Firebase (Firestore, Functions v2, Admin SDK)

**Spec:** `docs/superpowers/specs/2026-09-28-game-refactor-and-ranking-security-design.md`

## Global Constraints

- 기존 CSS 클래스명 유지 — 시각적 변경 없음
- 게임 수치 유지: 시작 100초, 판 클리어 +60초·+100점, 매칭 +10점, 오답 −5점(최소 0), 시간 아이템 +5초, 잔여 시간 보너스 ×10
- 일시정지 시 스테이지 전환 카운트다운도 멈춤 (의도된 동작 변경)
- Functions 리전: `asia-northeast3`
- 점수 유효 범위: 1~99,999 정수
- Firestore 컬렉션·문서 필드 형식 변경 없음 (`wc-rankings`, `wc-rankings-wc`)
- 배포 순서: functions → hosting → rules. 배포 명령은 사용자 확인 후 실행
- `npm test`와 `npm run build`가 모두 통과해야 함

---

## File Structure

| 파일 | 책임 |
|------|------|
| `src/game/rng.ts` (신규) | 시드 기반 난수 생성기 |
| `src/game/stages.ts` (신규) | 스테이지별 보드 설정 |
| `src/game/boardLogic.ts` (수정) | 보드 생성·셔플이 rng를 인자로 받음 |
| `src/game/format.ts` (신규) | ms → 초/`mm:ss` 변환 |
| `src/game/gameReducer.ts` (신규) | 게임 상태·액션·규칙·보드 뷰 파생 |
| `src/game/testUtils.ts` (신규) | 테스트용 보드 파서 |
| `src/game/*.test.ts` (신규) | Vitest |
| `src/hooks/useGameScheduler.ts` (신규) | 타이머 → dispatch |
| `src/hooks/useGameEvents.ts` (신규) | 이벤트 → 사운드·메시지, BGM |
| `src/components/Hud.tsx` 등 4개 (신규) | Game.tsx에서 UI 분리 |
| `src/components/Game.tsx` (재작성) | 조립 |
| `functions/src/index.ts` (재작성) | saveRanking |
| `firestore.rules`, `firebase.json`, `src/services/firebase.ts`, `RankingRegisterModal.tsx`, `vite.config.ts` (수정) | 서버 저장 연동 |
| `README.md`, `.env.example`, `src/game/constants.ts` (수정/신규) | 정리 |

---

### Task 1: Vitest 도입 + rng 주입 + 순수 로직 테스트

**Files:**
- Create: `src/game/rng.ts`, `src/game/stages.ts`, `src/game/testUtils.ts`, `src/game/connectLogic.test.ts`, `src/game/boardLogic.test.ts`
- Modify: `package.json`, `src/game/boardLogic.ts`, `src/components/Game.tsx` (getBoardConfig 제거·rng 인자 전달만)

**Interfaces:**
- Produces:
  - `createRng(seed: number): { next: () => number; seed: () => number }`
  - `type Rng = () => number`
  - `generateBoardWithObstacles(rows, cols, tileCounts: number[] | number, obstacleCount, rng: Rng): Board`
  - `shuffleBoard(board: Board, rng: Rng): Board`
  - `MAX_STAGE = 5`, `getBoardConfig(stage: number): StageConfig` (`{ rows, cols, obstacleCount, counts }`)
  - `parseBoard(rows: string[]): Board` — `.`=빈칸, `#`=장애물, `0-9`=해당 id, `T`=17(시간), `S`=18(셔플)

- [ ] **Step 1: Vitest 설치 및 스크립트 추가**

Run: `npm install && npm install -D vitest`
`package.json` scripts에 `"test": "vitest run"` 추가.

- [ ] **Step 2: rng.ts 작성**

```ts
// 시드 기반 난수 생성기 (mulberry32)
// 같은 시드 → 같은 수열. reducer가 난수를 쓰면서도 순수 함수로 남도록 시드를 상태에 저장한다.
export type Rng = () => number;

export interface SeededRng {
  next: Rng;
  /** 지금까지 뽑은 뒤의 내부 상태 — 다음 호출의 시드로 사용 */
  seed: () => number;
}

export function createRng(seed: number): SeededRng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seed: () => s,
  };
}
```

- [ ] **Step 3: stages.ts 작성** (Game.tsx의 `getBoardConfig`를 이동)

```ts
// 스테이지별 보드 설정
// counts 인덱스: id0..id15 = 캐릭터, id16 = 올챙구, id17 = 시간추가, id18 = 셔플 (모두 짝수)
// counts 합계 = rows*cols - obstacleCount
// 새우(id8)는 S1·S2에 등장하지 않음
//
// S1: 8×10=80,  장애물 0개 → 카드  80장 (18종)
// S2: 8×12=96,  장애물 4개 → 카드  92장 (18종)
// S3: 8×14=112, 장애물 6개 → 카드 106장 (19종)
// S4: 8×16=128, 장애물 8개 → 카드 120장 (19종)
// S5: 8×18=144, 장애물10개 → 카드 134장 (19종)
export const MAX_STAGE = 5;

export interface StageConfig {
  rows: number;
  cols: number;
  obstacleCount: number;
  counts: number[];
}

const fill = (n: number, v: number) => Array<number>(n).fill(v);

const STAGE_CONFIGS: StageConfig[] = [
  { rows: 8, cols: 10, obstacleCount:  0, counts: [...fill(8, 4), 0, ...fill(1, 4), ...fill(6, 6), 4, 2, 2] },
  { rows: 8, cols: 12, obstacleCount:  4, counts: [...fill(4, 4), ...fill(4, 6), 0, ...fill(7, 6), 6, 2, 2] },
  { rows: 8, cols: 14, obstacleCount:  6, counts: [...fill(15, 6), 4, 4, 4, 4] },
  { rows: 8, cols: 16, obstacleCount:  8, counts: [...fill(11, 6), ...fill(5, 8), 6, 4, 4] },
  { rows: 8, cols: 18, obstacleCount: 10, counts: [...fill(3, 4), ...fill(13, 8), 6, 6, 6] },
];

export function getBoardConfig(stage: number): StageConfig {
  const s = Math.min(Math.max(stage, 1), MAX_STAGE);
  return STAGE_CONFIGS[s - 1];
}
```

- [ ] **Step 4: boardLogic.ts에 rng 인자 추가**

`shuffle<T>(arr: T[], rng: Rng)`에서 `Math.random()` → `rng()`. `shuffleBoard(board, rng)`와 `generateBoardWithObstacles(rows, cols, tileCounts, obstacleCount, rng)`가 rng를 받아 내부 `shuffle`에 전달. `import type { Rng } from './rng';` 추가.

- [ ] **Step 5: Game.tsx 임시 수정 (빌드 유지용)**

Game.tsx의 `getBoardConfig` 함수와 counts 주석을 삭제하고 `import { getBoardConfig } from '../game/stages';` 추가. `generateBoardWithObstacles(..., obstacleCount)` 호출 3곳에 `Math.random` 인자, `shuffleBoard(prev)` 2곳을 `shuffleBoard(prev, Math.random)`으로 변경. (Task 3에서 Game.tsx 전체 교체)

- [ ] **Step 6: testUtils.ts 작성**

```ts
import type { Board } from './boardLogic';
import { ITEM_SHUFFLE_ID, ITEM_TIME_ID, OBSTACLE_ID } from './constants';

// 테스트용 보드 표기: '.'=빈칸, '#'=장애물, '0'-'9'=캐릭터 id, 'T'=시간 아이템, 'S'=셔플 아이템
export function parseBoard(rows: string[]): Board {
  return rows.map(row => [...row].map(ch => {
    if (ch === '.') return null;
    if (ch === '#') return OBSTACLE_ID;
    if (ch === 'T') return ITEM_TIME_ID;
    if (ch === 'S') return ITEM_SHUFFLE_ID;
    const n = Number(ch);
    if (Number.isNaN(n)) throw new Error(`알 수 없는 보드 문자: ${ch}`);
    return n;
  }));
}

/** 경로의 꺾임 횟수 */
export function countTurns(path: [number, number][]): number {
  let turns = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const [pr, pc] = path[i - 1];
    const [cr, cc] = path[i];
    const [nr, nc] = path[i + 1];
    if (cr - pr !== nr - cr || cc - pc !== nc - cc) turns++;
  }
  return turns;
}
```

- [ ] **Step 7: connectLogic.test.ts 작성**

```ts
import { describe, expect, it } from 'vitest';
import { findPath } from './connectLogic';
import { countTurns, parseBoard } from './testUtils';

describe('findPath', () => {
  it('같은 행 직선 연결 (0회 꺾임)', () => {
    const board = parseBoard(['1..1']);
    const path = findPath(board, 0, 0, 0, 3);
    expect(path).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
  });

  it('L자 연결 (1회 꺾임)', () => {
    const board = parseBoard([
      '1..',
      '..1',
    ]);
    const path = findPath(board, 0, 0, 1, 2)!;
    expect(path).not.toBeNull();
    expect(countTurns(path)).toBe(1);
  });

  it('보드 안쪽 Z자 연결 (2회 꺾임)', () => {
    const board = parseBoard([
      '1.#',
      '#.#',
      '#.1',
    ]);
    const path = findPath(board, 0, 0, 2, 2)!;
    expect(path).not.toBeNull();
    expect(countTurns(path)).toBe(2);
    expect(path).toContainEqual([1, 1]);
  });

  it('보드 외곽을 돌아가는 연결', () => {
    const board = parseBoard(['1#1']);
    const path = findPath(board, 0, 0, 0, 2)!;
    expect(path).not.toBeNull();
    expect(path.some(([r]) => r < 0 || r >= 1)).toBe(true);
  });

  it('장애물로 막히면 null', () => {
    const board = parseBoard([
      '#####',
      '#1#1#',
      '#####',
    ]);
    expect(findPath(board, 1, 1, 1, 3)).toBeNull();
  });

  it('3회 꺾임이 필요하면 null', () => {
    const board = parseBoard([
      '######',
      '#1...#',
      '####.#',
      '#....#',
      '#1####',
      '######',
    ]);
    expect(findPath(board, 1, 1, 4, 1)).toBeNull();
  });
});
```

- [ ] **Step 8: boardLogic.test.ts 작성**

```ts
import { describe, expect, it } from 'vitest';
import { countPossiblePairs, generateBoardWithObstacles, isBoardClear, shuffleBoard } from './boardLogic';
import { OBSTACLE_ID } from './constants';
import { createRng } from './rng';
import { getBoardConfig, MAX_STAGE } from './stages';
import { parseBoard } from './testUtils';

function cells(board: (number | null)[][]) {
  return board.flat();
}

describe('createRng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng(42), b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
    expect(a.seed()).toBe(b.seed());
    seqA.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });
});

describe('getBoardConfig', () => {
  it.each(Array.from({ length: MAX_STAGE }, (_, i) => i + 1))('스테이지 %i: 카드 수 = 칸 수 - 장애물, 모든 타입 짝수', stage => {
    const { rows, cols, obstacleCount, counts } = getBoardConfig(stage);
    expect(counts).toHaveLength(19);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(rows * cols - obstacleCount);
    counts.forEach(n => expect(n % 2).toBe(0));
  });
});

describe('generateBoardWithObstacles', () => {
  it('같은 시드면 같은 보드', () => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(3);
    const a = generateBoardWithObstacles(rows, cols, counts, obstacleCount, createRng(7).next);
    const b = generateBoardWithObstacles(rows, cols, counts, obstacleCount, createRng(7).next);
    expect(a).toEqual(b);
  });

  it('설정대로 장애물과 카드를 배치한다', () => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(5);
    const board = generateBoardWithObstacles(rows, cols, counts, obstacleCount, createRng(1).next);
    const flat = cells(board);
    expect(board).toHaveLength(rows);
    expect(flat.filter(v => v === OBSTACLE_ID)).toHaveLength(obstacleCount);
    expect(flat.filter(v => v === null)).toHaveLength(0);
    counts.forEach((n, id) => expect(flat.filter(v => v === id)).toHaveLength(n));
  });
});

describe('shuffleBoard', () => {
  it('장애물·빈칸 위치는 그대로, 카드 구성은 유지', () => {
    const board = parseBoard(['1#2.', '2.#1']);
    const shuffled = shuffleBoard(board, createRng(3).next);
    board.forEach((row, r) => row.forEach((v, c) => {
      if (v === OBSTACLE_ID || v === null) expect(shuffled[r][c]).toBe(v);
    }));
    expect(cells(shuffled).filter(v => v !== null).sort()).toEqual(cells(board).filter(v => v !== null).sort());
  });
});

describe('countPossiblePairs / isBoardClear', () => {
  it('연결 가능한 쌍만 센다', () => {
    expect(countPossiblePairs(parseBoard(['1..1', '2..2']))).toBe(2);
    expect(countPossiblePairs(parseBoard(['#####', '#1#1#', '#####']))).toBe(0);
  });

  it('장애물만 남으면 클리어', () => {
    expect(isBoardClear(parseBoard(['#..', '..#']))).toBe(true);
    expect(isBoardClear(parseBoard(['#1.', '..#']))).toBe(false);
  });
});
```

- [ ] **Step 9: 테스트·빌드 실행**

Run: `npm test` → 모두 PASS
Run: `npm run build` → 성공

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/game
git add src/components/Game.tsx
git commit -m "test: Vitest 도입, 시드 기반 rng 주입, 경로·보드 로직 테스트"
```

---

### Task 2: gameReducer (TDD)

**Files:**
- Create: `src/game/gameReducer.ts`, `src/game/gameReducer.test.ts`, `src/game/format.ts`
- Modify: `src/game/constants.ts` (`MISMATCH_PENALTY = 5` 추가)

**Interfaces:**
- Consumes: Task 1의 `createRng`, `getBoardConfig`, `MAX_STAGE`, `generateBoardWithObstacles`, `shuffleBoard`, `parseBoard`
- Produces:
  - `type Cell = [number, number]`
  - `interface PendingMatch { id; a: Cell; b: Cell; path: Cell[]; typeId; step: 'path' | 'vanish' }`
  - `interface ClearStats { matchScore; clearBonus; timeBonus }`
  - `type GameEventType = 'select' | 'matchSuccess' | 'matchFail' | 'itemTime' | 'shuffleCharged' | 'shuffleUsed' | 'autoShuffle' | 'stageClear'`
  - `interface GameState` (스펙 3.2와 동일 필드)
  - `type GameAction` (스펙 3.3, `TICK`에 `flush?: boolean` 추가)
  - `createInitialState(): GameState`, `gameReducer(state, action): GameState`
  - `selectBoardView(pending: PendingMatch[]): { pathCells: Set<string>; matchedCells: Set<string>; currentPath: Cell[] | null }`
  - `isRunning(state): boolean` — playing·!isPaused·countdown=null·!clearing
  - `toSeconds(ms): number`, `formatTime(ms): string`

`TICK {flush: true}`: 스케줄러가 타이머를 멈출 때(일시정지 등) 마지막 틱 이후 경과분을 보낸다. phase=playing·!clearing이면 일시정지·카운트다운 중에도 차감한다. 이것으로 250ms보다 빠른 일시정지 연타에서도 시간이 새지 않는다(B6).

- [ ] **Step 1: format.ts 작성**

```ts
export function toSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatTime(ms: number): string {
  const sec = toSeconds(ms);
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
```

- [ ] **Step 2: 실패하는 테스트 작성 — gameReducer.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import type { Board } from './boardLogic';
import { countPossiblePairs } from './boardLogic';
import { ITEM_SHUFFLE_ID, OBSTACLE_ID, TIME_LIMIT } from './constants';
import { createInitialState, gameReducer, selectBoardView } from './gameReducer';
import type { GameAction, GameState } from './gameReducer';
import { parseBoard } from './testUtils';

function playing(board: Board, overrides: Partial<GameState> = {}): GameState {
  return {
    ...createInitialState(),
    phase: 'playing',
    gameId: 1,
    rngSeed: 123,
    board,
    possiblePairs: countPossiblePairs(board),
    ...overrides,
  };
}

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}

/** a, b를 클릭하고 방금 생긴 매칭을 끝까지 처리 */
function matchPair(state: GameState, a: [number, number], b: [number, number]): GameState {
  const s = run(state, { type: 'CLICK', r: a[0], c: a[1] }, { type: 'CLICK', r: b[0], c: b[1] });
  const m = s.pendingMatches[s.pendingMatches.length - 1];
  return run(s,
    { type: 'MATCH_REVEAL', gameId: s.gameId, matchId: m.id },
    { type: 'MATCH_RESOLVE', gameId: s.gameId, matchId: m.id },
  );
}

const lastEvent = (s: GameState) => s.events[s.events.length - 1]?.type;

describe('START', () => {
  it('1스테이지 게임을 시작한다', () => {
    const s = gameReducer(createInitialState(), { type: 'START', seed: 99 });
    expect(s.phase).toBe('playing');
    expect(s.gameId).toBe(1);
    expect(s.stage).toBe(1);
    expect(s.board).toHaveLength(8);
    expect(s.board[0]).toHaveLength(10);
    expect(s.timeLeftMs).toBe(TIME_LIMIT * 1000);
    expect(s.score).toBe(0);
    expect(s.possiblePairs).toBe(countPossiblePairs(s.board));
  });

  it('같은 시드면 같은 보드', () => {
    const a = gameReducer(createInitialState(), { type: 'START', seed: 5 });
    const b = gameReducer(createInitialState(), { type: 'START', seed: 5 });
    expect(a.board).toEqual(b.board);
  });
});

describe('CLICK', () => {
  it('선택 후 같은 셀을 다시 누르면 해제', () => {
    const s1 = run(playing(parseBoard(['1..1'])), { type: 'CLICK', r: 0, c: 0 });
    expect(s1.selected).toEqual([0, 0]);
    expect(lastEvent(s1)).toBe('select');
    expect(run(s1, { type: 'CLICK', r: 0, c: 0 }).selected).toBeNull();
  });

  it('빈칸·장애물 클릭은 무시', () => {
    const s = playing(parseBoard(['1.#1']));
    expect(run(s, { type: 'CLICK', r: 0, c: 1 })).toBe(s);
    expect(run(s, { type: 'CLICK', r: 0, c: 2 })).toBe(s);
  });

  it('다른 카드면 -5점, 새 셀 선택', () => {
    const s = run(playing(parseBoard(['1..2', '2..1']), { score: 20 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    expect(s.score).toBe(15);
    expect(s.selected).toEqual([0, 3]);
    expect(lastEvent(s)).toBe('matchFail');
  });

  it('감점은 0 아래로 내려가지 않는다', () => {
    const s = run(playing(parseBoard(['1..2', '2..1']), { score: 3 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    expect(s.score).toBe(0);
  });

  it('경로가 없으면 -5점', () => {
    const s = run(playing(parseBoard(['#####', '#1#1#', '#####']), { score: 10 }),
      { type: 'CLICK', r: 1, c: 1 }, { type: 'CLICK', r: 1, c: 3 });
    expect(s.score).toBe(5);
    expect(lastEvent(s)).toBe('matchFail');
  });

  it('매칭 성공 → pending 추가, pending 셀 클릭은 무시', () => {
    const s = run(playing(parseBoard(['1..1', '2..2'])), { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    expect(s.selected).toBeNull();
    expect(s.pendingMatches).toHaveLength(1);
    expect(s.pendingMatches[0]).toMatchObject({ a: [0, 0], b: [0, 3], typeId: 1, step: 'path' });
    expect(lastEvent(s)).toBe('matchSuccess');
    expect(run(s, { type: 'CLICK', r: 0, c: 0 })).toBe(s);
  });

  it('일시정지 중에는 무시', () => {
    const s = playing(parseBoard(['1..1']), { isPaused: true });
    expect(run(s, { type: 'CLICK', r: 0, c: 0 })).toBe(s);
  });
});

describe('매칭 처리', () => {
  it('RESOLVE → 셀 제거, +10점, possiblePairs 갱신', () => {
    const s = matchPair(playing(parseBoard(['1..1', '2..2'])), [0, 0], [0, 3]);
    expect(s.board[0]).toEqual([null, null, null, null]);
    expect(s.score).toBe(10);
    expect(s.pendingMatches).toHaveLength(0);
    expect(s.possiblePairs).toBe(1);
  });

  it('REVEAL → step이 vanish로', () => {
    const s = run(playing(parseBoard(['1..1', '2..2'])), { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    const m = s.pendingMatches[0];
    const r = run(s, { type: 'MATCH_REVEAL', gameId: 1, matchId: m.id });
    expect(r.pendingMatches[0].step).toBe('vanish');
  });

  it('시간 아이템은 매칭 즉시 +5초', () => {
    const s = run(playing(parseBoard(['T..T', '2..2']), { timeLeftMs: 10_000 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    expect(s.timeLeftMs).toBe(15_000);
    expect(lastEvent(s)).toBe('itemTime');
  });

  it('셔플 아이템은 RESOLVE 시 충전', () => {
    const s = matchPair(playing(parseBoard(['S..S', '2..2'])), [0, 0], [0, 3]);
    expect(s.shuffleCharge).toBe(1);
    expect(lastEvent(s)).toBe('shuffleCharged');
  });
});

describe('MANUAL_SHUFFLE', () => {
  const board = parseBoard(['1#2.', '2.#1']);

  it('충전이 있으면 셔플하고 1 차감', () => {
    const s = run(playing(board, { shuffleCharge: 1 }), { type: 'MANUAL_SHUFFLE' });
    expect(s.shuffleCharge).toBe(0);
    expect(s.board[0][1]).toBe(OBSTACLE_ID);
    expect(s.board[1][2]).toBe(OBSTACLE_ID);
    expect(s.boardVersion).toBe(1);
    expect(lastEvent(s)).toBe('shuffleUsed');
  });

  it('충전이 없으면 무시', () => {
    const s = playing(board);
    expect(run(s, { type: 'MANUAL_SHUFFLE' })).toBe(s);
  });
});

describe('스테이지 클리어', () => {
  it('1~4스테이지: +100점, +60초, 카운트다운 후 다음 보드', () => {
    let s = matchPair(playing(parseBoard(['1..1']), { timeLeftMs: 50_000 }), [0, 0], [0, 3]);
    expect(s.score).toBe(10 + 100);
    expect(s.timeLeftMs).toBe(110_000);
    expect(s.stage).toBe(2);
    expect(s.countdown).toBe(3);
    expect(s.nextBoard).toHaveLength(8);
    expect(s.nextBoard![0]).toHaveLength(12);
    expect(lastEvent(s)).toBe('stageClear');

    const next = s.nextBoard;
    s = run(s, { type: 'COUNTDOWN_TICK', gameId: 1 }, { type: 'COUNTDOWN_TICK', gameId: 1 }, { type: 'COUNTDOWN_TICK', gameId: 1 });
    expect(s.countdown).toBe(0);
    s = run(s, { type: 'COUNTDOWN_TICK', gameId: 1 });
    expect(s.countdown).toBeNull();
    expect(s.board).toBe(next);
    expect(s.nextBoard).toBeNull();
    expect(s.possiblePairs).toBe(countPossiblePairs(next!));
  });

  it('일시정지 중에는 카운트다운이 멈춘다', () => {
    const s = playing(parseBoard(['....']), { countdown: 2, isPaused: true });
    expect(run(s, { type: 'COUNTDOWN_TICK', gameId: 1 })).toBe(s);
  });

  it('5스테이지: 보너스 계산 후 FINISH_CLEAR로 cleared', () => {
    let s = matchPair(playing(parseBoard(['1..1']), { stage: 5, score: 1000, timeLeftMs: 30_500 }), [0, 0], [0, 3]);
    // 1000 + 10 + 100 = 1110, 시간 보너스 ceil(30.5)=31 × 10 = 310
    expect(s.clearing).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.clearStats).toEqual({ matchScore: 610, clearBonus: 500, timeBonus: 310 });
    expect(s.finalScore).toBe(1420);
    expect(s.score).toBe(1420);
    s = run(s, { type: 'FINISH_CLEAR', gameId: 1 });
    expect(s.phase).toBe('cleared');
    expect(s.clearing).toBe(false);
  });

  it('마지막 두 쌍을 연속으로 매칭해도 스테이지가 넘어간다', () => {
    let s = playing(parseBoard(['1..1', '2..2']));
    s = run(s,
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 },
      { type: 'CLICK', r: 1, c: 0 }, { type: 'CLICK', r: 1, c: 3 });
    expect(s.pendingMatches).toHaveLength(2);
    const [m1, m2] = s.pendingMatches;
    s = run(s,
      { type: 'MATCH_RESOLVE', gameId: 1, matchId: m1.id },
      { type: 'MATCH_RESOLVE', gameId: 1, matchId: m2.id });
    expect(s.stage).toBe(2);
    expect(s.countdown).toBe(3);
  });
});

describe('TICK', () => {
  it('시간을 차감한다', () => {
    const s = run(playing(parseBoard(['1..1']), { timeLeftMs: 5000 }), { type: 'TICK', gameId: 1, deltaMs: 250 });
    expect(s.timeLeftMs).toBe(4750);
  });

  it('0이 되면 gameover, 최종 점수 확정, pending 제거', () => {
    let s = run(playing(parseBoard(['1..1', '2..2']), { timeLeftMs: 200, score: 70 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    s = run(s, { type: 'TICK', gameId: 1, deltaMs: 250 });
    expect(s.phase).toBe('gameover');
    expect(s.timeLeftMs).toBe(0);
    expect(s.finalScore).toBe(70);
    expect(s.pendingMatches).toHaveLength(0);
  });

  it('일시정지·카운트다운 중 일반 TICK은 무시', () => {
    const paused = playing(parseBoard(['1..1']), { isPaused: true });
    expect(run(paused, { type: 'TICK', gameId: 1, deltaMs: 250 })).toBe(paused);
    const counting = playing(parseBoard(['....']), { countdown: 3 });
    expect(run(counting, { type: 'TICK', gameId: 1, deltaMs: 250 })).toBe(counting);
  });

  it('flush TICK은 일시정지 중에도 차감한다 (일시정지 연타 방지)', () => {
    const s = run(playing(parseBoard(['1..1']), { isPaused: true, timeLeftMs: 5000 }),
      { type: 'TICK', gameId: 1, deltaMs: 180, flush: true });
    expect(s.timeLeftMs).toBe(4820);
  });
});

describe('AUTO_SHUFFLE', () => {
  const stuck = parseBoard([
    '######',
    '#1...#',
    '####.#',
    '#....#',
    '#1####',
    '######',
  ]);

  it('boardVersion이 맞고 가능한 쌍이 0이면 셔플', () => {
    const s0 = playing(stuck, { boardVersion: 4 });
    expect(s0.possiblePairs).toBe(0);
    const s = run(s0, { type: 'AUTO_SHUFFLE', gameId: 1, boardVersion: 4 });
    expect(s.boardVersion).toBe(5);
    expect(lastEvent(s)).toBe('autoShuffle');
  });

  it('boardVersion이 다르면 무시', () => {
    const s0 = playing(stuck, { boardVersion: 4 });
    expect(run(s0, { type: 'AUTO_SHUFFLE', gameId: 1, boardVersion: 3 })).toBe(s0);
  });
});

describe('회귀 테스트', () => {
  it('B5: 카운트다운 중 START → 깨끗한 1스테이지', () => {
    let s = matchPair(playing(parseBoard(['1..1'])), [0, 0], [0, 3]);
    expect(s.countdown).toBe(3);
    s = run(s, { type: 'START', seed: 1 });
    expect(s.stage).toBe(1);
    expect(s.countdown).toBeNull();
    expect(s.nextBoard).toBeNull();
    expect(s.board[0]).toHaveLength(10);
    const after = run(s, { type: 'COUNTDOWN_TICK', gameId: 1 });
    expect(after).toBe(s);
  });

  it('B7: gameover 후 도착한 MATCH_RESOLVE는 점수를 바꾸지 않는다', () => {
    let s = run(playing(parseBoard(['1..1', '2..2']), { timeLeftMs: 100, score: 40 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    const matchId = s.pendingMatches[0].id;
    s = run(s, { type: 'TICK', gameId: 1, deltaMs: 250 });
    const after = run(s, { type: 'MATCH_RESOLVE', gameId: 1, matchId });
    expect(after).toBe(s);
    expect(after.finalScore).toBe(40);
  });

  it('이전 gameId의 액션은 무시', () => {
    const s = playing(parseBoard(['1..1']), { gameId: 2 });
    expect(run(s, { type: 'TICK', gameId: 1, deltaMs: 500 })).toBe(s);
    expect(run(s, { type: 'FINISH_CLEAR', gameId: 1 })).toBe(s);
  });

  it('GO_TITLE 후 늦게 도착한 액션은 무시', () => {
    let s = run(playing(parseBoard(['1..1', '2..2'])), { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    s = run(s, { type: 'GO_TITLE' });
    expect(s.phase).toBe('title');
    expect(run(s, { type: 'TICK', gameId: 1, deltaMs: 500 })).toBe(s);
  });
});

describe('events', () => {
  it('최근 20개만 유지하고 id는 계속 증가', () => {
    let s = playing(parseBoard(['1..1']));
    for (let i = 0; i < 30; i++) s = run(s, { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 0 });
    expect(s.events).toHaveLength(20);
    expect(s.events[19].id).toBe(30);
  });

  it('START 후에도 이벤트 id는 이어진다', () => {
    const s1 = run(playing(parseBoard(['1..1'])), { type: 'CLICK', r: 0, c: 0 });
    const s2 = run(s1, { type: 'START', seed: 3 }, { type: 'CLICK', r: 0, c: 0 });
    const lastId = s1.events[s1.events.length - 1].id;
    s2.events.forEach(e => expect(e.id).toBeGreaterThan(lastId));
  });
});

describe('selectBoardView', () => {
  it('path 단계는 경로로, vanish 단계는 matchedCells로', () => {
    const view = selectBoardView([
      { id: 1, a: [0, 0], b: [0, 2], path: [[0, 0], [0, 1], [0, 2]], typeId: 1, step: 'vanish' },
      { id: 2, a: [1, 0], b: [1, 1], path: [[1, 0], [1, 1]], typeId: ITEM_SHUFFLE_ID, step: 'path' },
    ]);
    expect(view.currentPath).toEqual([[1, 0], [1, 1]]);
    expect([...view.pathCells]).toEqual(['1,0', '1,1']);
    expect([...view.matchedCells].sort()).toEqual(['0,0', '0,2']);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test` → FAIL (`./gameReducer` 모듈 없음)

- [ ] **Step 4: constants.ts에 `export const MISMATCH_PENALTY = 5;` 추가 (SCORE_PER_MATCH 아래)**

- [ ] **Step 5: gameReducer.ts 구현**

```ts
import { countPossiblePairs, generateBoardWithObstacles, isBoardClear, shuffleBoard } from './boardLogic';
import type { Board } from './boardLogic';
import { findPath } from './connectLogic';
import {
  BOARD_CLEAR_BONUS, ITEM_SHUFFLE_ID, ITEM_TIME_ID, MISMATCH_PENALTY, OBSTACLE_ID,
  SCORE_PER_MATCH, TIME_ADD_SECONDS, TIME_BONUS_MULTIPLIER, TIME_CLEAR_BONUS, TIME_LIMIT,
} from './constants';
import { toSeconds } from './format';
import { createRng } from './rng';
import { getBoardConfig, MAX_STAGE } from './stages';

export type Cell = [number, number];
export type Phase = 'title' | 'playing' | 'gameover' | 'cleared';

export interface PendingMatch {
  id: number;
  a: Cell;
  b: Cell;
  path: Cell[];
  typeId: number;
  step: 'path' | 'vanish'; // path: 경로 표시 중, vanish: 사라지는 애니메이션 중
}

export interface ClearStats {
  matchScore: number;
  clearBonus: number;
  timeBonus: number;
}

export type GameEventType =
  | 'select' | 'matchSuccess' | 'matchFail'
  | 'itemTime' | 'shuffleCharged' | 'shuffleUsed' | 'autoShuffle'
  | 'stageClear';

export interface GameEvent {
  id: number;
  type: GameEventType;
}

export interface GameState {
  phase: Phase;
  gameId: number;
  rngSeed: number;
  stage: number;
  board: Board;
  boardVersion: number;
  selected: Cell | null;
  pendingMatches: PendingMatch[];
  nextMatchId: number;
  score: number;
  timeLeftMs: number;
  possiblePairs: number;
  shuffleCharge: number;
  isPaused: boolean;
  countdown: number | null;
  nextBoard: Board | null;
  clearing: boolean;
  clearStats: ClearStats;
  finalScore: number;
  events: GameEvent[];
  nextEventId: number;
}

export type GameAction =
  | { type: 'START'; seed: number }
  | { type: 'GO_TITLE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'CLICK'; r: number; c: number }
  | { type: 'MATCH_REVEAL'; gameId: number; matchId: number }
  | { type: 'MATCH_RESOLVE'; gameId: number; matchId: number }
  | { type: 'TICK'; gameId: number; deltaMs: number; flush?: boolean }
  | { type: 'COUNTDOWN_TICK'; gameId: number }
  | { type: 'AUTO_SHUFFLE'; gameId: number; boardVersion: number }
  | { type: 'MANUAL_SHUFFLE' }
  | { type: 'FINISH_CLEAR'; gameId: number };

const MAX_EVENTS = 20;
const COUNTDOWN_START = 3;

export function createInitialState(): GameState {
  return {
    phase: 'title',
    gameId: 0,
    rngSeed: 0,
    stage: 1,
    board: [],
    boardVersion: 0,
    selected: null,
    pendingMatches: [],
    nextMatchId: 1,
    score: 0,
    timeLeftMs: TIME_LIMIT * 1000,
    possiblePairs: 0,
    shuffleCharge: 0,
    isPaused: false,
    countdown: null,
    nextBoard: null,
    clearing: false,
    clearStats: { matchScore: 0, clearBonus: 0, timeBonus: 0 },
    finalScore: 0,
    events: [],
    nextEventId: 1,
  };
}

/** 클릭·시간 차감이 가능한 상태인지 */
export function isRunning(s: GameState): boolean {
  return s.phase === 'playing' && !s.isPaused && s.countdown === null && !s.clearing;
}

function withEvent(s: GameState, type: GameEventType): GameState {
  const events = [...s.events, { id: s.nextEventId, type }].slice(-MAX_EVENTS);
  return { ...s, events, nextEventId: s.nextEventId + 1 };
}

function buildStageBoard(stage: number, seed: number): { board: Board; seed: number } {
  const rng = createRng(seed);
  const { rows, cols, counts, obstacleCount } = getBoardConfig(stage);
  const board = generateBoardWithObstacles(rows, cols, counts, obstacleCount, rng.next);
  return { board, seed: rng.seed() };
}

function shuffled(s: GameState): GameState {
  const rng = createRng(s.rngSeed);
  const board = shuffleBoard(s.board, rng.next);
  return {
    ...s,
    board,
    rngSeed: rng.seed(),
    boardVersion: s.boardVersion + 1,
    selected: null,
    possiblePairs: countPossiblePairs(board),
  };
}

const cellKey = ([r, c]: Cell) => `${r},${c}`;

function isPendingCell(s: GameState, r: number, c: number): boolean {
  return s.pendingMatches.some(m => (m.a[0] === r && m.a[1] === c) || (m.b[0] === r && m.b[1] === c));
}

function start(prev: GameState, seed: number): GameState {
  const { board, seed: nextSeed } = buildStageBoard(1, seed);
  return {
    ...createInitialState(),
    phase: 'playing',
    gameId: prev.gameId + 1,
    rngSeed: nextSeed,
    board,
    boardVersion: prev.boardVersion + 1,
    possiblePairs: countPossiblePairs(board),
    // id는 판이 바뀌어도 계속 증가 — 이벤트 소비·타이머 관리가 id로 중복을 판별하기 때문
    nextMatchId: prev.nextMatchId,
    nextEventId: prev.nextEventId,
  };
}

function click(s: GameState, r: number, c: number): GameState {
  if (!isRunning(s)) return s;
  const value = s.board[r]?.[c];
  if (value === null || value === undefined || value === OBSTACLE_ID) return s;
  if (isPendingCell(s, r, c)) return s;

  if (s.selected === null) return withEvent({ ...s, selected: [r, c] }, 'select');

  const [sr, sc] = s.selected;
  if (sr === r && sc === c) return { ...s, selected: null };

  const path = s.board[sr][sc] === value ? findPath(s.board, sr, sc, r, c) : null;
  if (path === null) {
    return withEvent({ ...s, score: Math.max(0, s.score - MISMATCH_PENALTY), selected: [r, c] }, 'matchFail');
  }

  const match: PendingMatch = { id: s.nextMatchId, a: [sr, sc], b: [r, c], path, typeId: value, step: 'path' };
  let next = withEvent({
    ...s,
    selected: null,
    pendingMatches: [...s.pendingMatches, match],
    nextMatchId: s.nextMatchId + 1,
  }, 'matchSuccess');
  if (value === ITEM_TIME_ID) {
    next = withEvent({ ...next, timeLeftMs: next.timeLeftMs + TIME_ADD_SECONDS * 1000 }, 'itemTime');
  }
  return next;
}

function clearStage(s: GameState): GameState {
  const score = s.score + BOARD_CLEAR_BONUS;

  if (s.stage >= MAX_STAGE) {
    const timeBonus = toSeconds(s.timeLeftMs) * TIME_BONUS_MULTIPLIER;
    const clearBonus = MAX_STAGE * BOARD_CLEAR_BONUS;
    const finalScore = score + timeBonus;
    return withEvent({
      ...s,
      score: finalScore,
      finalScore,
      clearing: true,
      selected: null,
      clearStats: { matchScore: score - clearBonus, clearBonus, timeBonus },
    }, 'stageClear');
  }

  const { board: nextBoard, seed } = buildStageBoard(s.stage + 1, s.rngSeed);
  return withEvent({
    ...s,
    score,
    stage: s.stage + 1,
    timeLeftMs: s.timeLeftMs + TIME_CLEAR_BONUS * 1000,
    rngSeed: seed,
    nextBoard,
    countdown: COUNTDOWN_START,
    selected: null,
  }, 'stageClear');
}

function resolveMatch(s: GameState, matchId: number): GameState {
  if (s.phase !== 'playing') return s;
  const match = s.pendingMatches.find(m => m.id === matchId);
  if (!match) return s;

  const board = s.board.map(row => [...row]);
  board[match.a[0]][match.a[1]] = null;
  board[match.b[0]][match.b[1]] = null;

  let next: GameState = {
    ...s,
    board,
    boardVersion: s.boardVersion + 1,
    pendingMatches: s.pendingMatches.filter(m => m.id !== matchId),
    score: s.score + SCORE_PER_MATCH,
    possiblePairs: countPossiblePairs(board),
  };
  if (match.typeId === ITEM_SHUFFLE_ID) {
    next = withEvent({ ...next, shuffleCharge: next.shuffleCharge + 1 }, 'shuffleCharged');
  }
  // 판 클리어 판정은 실제 보드로 — 연속 매칭 시 stale 보드 문제 없음
  return isBoardClear(board) ? clearStage(next) : next;
}

function tick(s: GameState, deltaMs: number, flush: boolean): GameState {
  // flush: 스케줄러가 타이머를 멈출 때 보내는 잔여 경과분 — 일시정지 연타로 시간이 새지 않게 한다
  const canTick = flush ? s.phase === 'playing' && !s.clearing : isRunning(s);
  if (!canTick || deltaMs <= 0) return s;
  const timeLeftMs = s.timeLeftMs - deltaMs;
  if (timeLeftMs > 0) return { ...s, timeLeftMs };
  return { ...s, timeLeftMs: 0, phase: 'gameover', finalScore: s.score, pendingMatches: [], selected: null };
}

function countdownTick(s: GameState): GameState {
  if (s.phase !== 'playing' || s.countdown === null || s.isPaused) return s;
  if (s.countdown > 0) return { ...s, countdown: s.countdown - 1 };
  const board = s.nextBoard ?? s.board;
  return {
    ...s,
    board,
    nextBoard: null,
    countdown: null,
    boardVersion: s.boardVersion + 1,
    possiblePairs: countPossiblePairs(board),
  };
}

export function gameReducer(s: GameState, action: GameAction): GameState {
  // 타이머에서 온 액션은 현재 판의 것만 처리
  if ('gameId' in action && action.gameId !== s.gameId) return s;

  switch (action.type) {
    case 'START':
      return start(s, action.seed);
    case 'GO_TITLE':
      return {
        ...s,
        phase: 'title',
        isPaused: false,
        selected: null,
        pendingMatches: [],
        countdown: null,
        nextBoard: null,
        clearing: false,
      };
    case 'PAUSE':
      return s.phase === 'playing' && !s.isPaused ? { ...s, isPaused: true } : s;
    case 'RESUME':
      return s.isPaused ? { ...s, isPaused: false } : s;
    case 'CLICK':
      return click(s, action.r, action.c);
    case 'MATCH_REVEAL': {
      if (!s.pendingMatches.some(m => m.id === action.matchId && m.step === 'path')) return s;
      return {
        ...s,
        pendingMatches: s.pendingMatches.map(m => (m.id === action.matchId ? { ...m, step: 'vanish' } : m)),
      };
    }
    case 'MATCH_RESOLVE':
      return resolveMatch(s, action.matchId);
    case 'TICK':
      return tick(s, action.deltaMs, action.flush ?? false);
    case 'COUNTDOWN_TICK':
      return countdownTick(s);
    case 'AUTO_SHUFFLE': {
      if (!isRunning(s) || action.boardVersion !== s.boardVersion) return s;
      if (s.possiblePairs > 0 || s.pendingMatches.length > 0 || isBoardClear(s.board)) return s;
      return withEvent(shuffled(s), 'autoShuffle');
    }
    case 'MANUAL_SHUFFLE': {
      if (!isRunning(s) || s.pendingMatches.length > 0 || s.shuffleCharge < 1) return s;
      return withEvent({ ...shuffled(s), shuffleCharge: s.shuffleCharge - 1 }, 'shuffleUsed');
    }
    case 'FINISH_CLEAR':
      return s.clearing ? { ...s, phase: 'cleared', clearing: false } : s;
  }
}

/** Board 렌더링용 파생 값 — 가장 최근 경로 표시 중인 매칭의 경로, 사라지는 중인 셀들 */
export function selectBoardView(pending: PendingMatch[]): {
  pathCells: Set<string>;
  matchedCells: Set<string>;
  currentPath: Cell[] | null;
} {
  const showing = [...pending].reverse().find(m => m.step === 'path') ?? null;
  const matchedCells = new Set<string>();
  for (const m of pending) {
    if (m.step === 'vanish') {
      matchedCells.add(cellKey(m.a));
      matchedCells.add(cellKey(m.b));
    }
  }
  return {
    pathCells: new Set(showing ? showing.path.map(cellKey) : []),
    matchedCells,
    currentPath: showing ? showing.path : null,
  };
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test` → 모두 PASS
Run: `npm run build` → 성공

- [ ] **Step 7: Commit**

```bash
git add src/game
git commit -m "feat: 순수 gameReducer로 게임 규칙 이전 (B5·B6·B7·B8 회귀 테스트 포함)"
```

---

### Task 3: 훅·컴포넌트 분리와 Game.tsx 교체

**Files:**
- Create: `src/hooks/useGameScheduler.ts`, `src/hooks/useGameEvents.ts`, `src/components/Hud.tsx`, `src/components/PauseOverlay.tsx`, `src/components/ResultOverlay.tsx`, `src/components/CountdownOverlay.tsx`
- Modify: `src/components/Game.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 2의 `GameState`, `GameAction`, `gameReducer`, `createInitialState`, `selectBoardView`, `isRunning`, `ClearStats`, `formatTime`, `toSeconds`
- Produces: `useGameScheduler(state, dispatch): void`, `useGameEvents(state): string | null`

- [ ] **Step 1: useGameScheduler.ts**

```ts
import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import { isBoardClear } from '../game/boardLogic';
import { isRunning } from '../game/gameReducer';
import type { GameAction, GameState } from '../game/gameReducer';

const TICK_INTERVAL_MS = 250;
const PATH_SHOW_MS = 200;
const MATCH_ANIM_MS = 220;
const COUNTDOWN_STEP_MS = 1000;
const AUTO_SHUFFLE_DELAY_MS = 1200;
const FINISH_CLEAR_DELAY_MS = 420;

// 시간 흐름을 reducer 액션으로 바꾼다. 모든 액션에 gameId를 실어 이전 판의 타이머는 reducer가 무시한다.
export function useGameScheduler(state: GameState, dispatch: Dispatch<GameAction>) {
  const { gameId, phase, isPaused, countdown, clearing, pendingMatches, possiblePairs, boardVersion, board } = state;
  const running = isRunning(state);

  // 제한 시간: 실제 경과 시간(ms)만큼 차감. 멈출 때 잔여분을 flush해 일시정지 연타로 시간이 새지 않게 한다.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'TICK', gameId, deltaMs: now - last });
      last = now;
    }, TICK_INTERVAL_MS);
    return () => {
      clearInterval(id);
      dispatch({ type: 'TICK', gameId, deltaMs: performance.now() - last, flush: true });
    };
  }, [running, gameId, dispatch]);

  // 매칭 애니메이션: 경로 표시 → 사라짐 → 보드에서 제거
  const matchTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = matchTimersRef.current;
    for (const m of pendingMatches) {
      if (timers.has(m.id)) continue;
      timers.set(m.id, setTimeout(() => {
        dispatch({ type: 'MATCH_REVEAL', gameId, matchId: m.id });
        timers.set(m.id, setTimeout(() => {
          timers.delete(m.id);
          dispatch({ type: 'MATCH_RESOLVE', gameId, matchId: m.id });
        }, MATCH_ANIM_MS));
      }, PATH_SHOW_MS));
    }
  }, [pendingMatches, gameId, dispatch]);
  useEffect(() => {
    const timers = matchTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // 스테이지 전환 카운트다운 (일시정지 중에는 멈춤)
  useEffect(() => {
    if (phase !== 'playing' || countdown === null || isPaused) return;
    const t = setTimeout(() => dispatch({ type: 'COUNTDOWN_TICK', gameId }), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, countdown, isPaused, gameId, dispatch]);

  // 이동 가능한 쌍이 없으면 자동 셔플
  const needsShuffle = running && possiblePairs === 0 && pendingMatches.length === 0 && !isBoardClear(board);
  useEffect(() => {
    if (!needsShuffle) return;
    const t = setTimeout(() => dispatch({ type: 'AUTO_SHUFFLE', gameId, boardVersion }), AUTO_SHUFFLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [needsShuffle, gameId, boardVersion, dispatch]);

  // 5스테이지 클리어 → 잠시 후 엔딩 화면
  useEffect(() => {
    if (!clearing) return;
    const t = setTimeout(() => dispatch({ type: 'FINISH_CLEAR', gameId }), FINISH_CLEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [clearing, gameId, dispatch]);
}
```

- [ ] **Step 2: useGameEvents.ts**

```ts
import { useEffect, useRef, useState } from 'react';
import { BOARD_CLEAR_BONUS, TIME_ADD_SECONDS } from '../game/constants';
import type { GameEventType, GameState } from '../game/gameReducer';
import {
  pauseBGM, playBGM, playCardSelect, playGameOver, playMatchFail, playMatchSuccess, stopBGM,
} from '../game/sounds';

const ITEM_MSG_MS = 1800;

const SOUNDS: Partial<Record<GameEventType, () => void>> = {
  select: playCardSelect,
  matchSuccess: playMatchSuccess,
  matchFail: playMatchFail,
};

const MESSAGES: Partial<Record<GameEventType, string>> = {
  itemTime: `+${TIME_ADD_SECONDS}초 추가!`,
  shuffleCharged: '셔플 충전!',
  shuffleUsed: '셔플 발동!',
  autoShuffle: '이동 불가 — 자동 셔플',
  stageClear: `판 클리어! +${BOARD_CLEAR_BONUS}`,
};

// reducer가 쌓은 이벤트를 사운드·아이템 메시지로 바꾼다. 반환값은 현재 표시할 메시지.
export function useGameEvents(state: GameState): string | null {
  const { events, phase, isPaused } = state;
  const [itemMsg, setItemMsg] = useState<string | null>(null);
  const lastEventIdRef = useRef(0);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const ev of events) {
      if (ev.id <= lastEventIdRef.current) continue;
      lastEventIdRef.current = ev.id;
      SOUNDS[ev.type]?.();
      const msg = MESSAGES[ev.type];
      if (msg) {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
        setItemMsg(msg);
        msgTimerRef.current = setTimeout(() => setItemMsg(null), ITEM_MSG_MS);
      }
    }
  }, [events]);

  useEffect(() => () => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
  }, []);

  // BGM: 플레이 중 재생, 일시정지 시 멈춤, 그 외 정지
  useEffect(() => {
    if (phase === 'playing' && !isPaused) playBGM();
    else if (phase === 'playing' && isPaused) pauseBGM();
    else stopBGM();
  }, [phase, isPaused]);

  useEffect(() => {
    if (phase === 'gameover') playGameOver();
  }, [phase]);

  // 타이틀로 나가면 남은 메시지 제거
  useEffect(() => {
    if (phase === 'title') setItemMsg(null);
  }, [phase]);

  return itemMsg;
}
```

- [ ] **Step 3: CountdownOverlay.tsx**

```tsx
interface Props {
  countdown: number;
}

export default function CountdownOverlay({ countdown }: Props) {
  return (
    <div className="countdown-overlay">
      <div className="countdown-number" key={countdown}>
        {countdown === 0 ? 'GO!' : countdown}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ResultOverlay.tsx** (기존 Game.tsx 405~488행 JSX 이동)

```tsx
import { Clock, Home, RefreshCw, Trophy } from 'lucide-react';
import type { ClearStats } from '../game/gameReducer';

interface Props {
  variant: 'gameover' | 'cleared';
  finalScore: number;
  clearStats: ClearStats;
  onRegister: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export default function ResultOverlay({ variant, finalScore, clearStats, onRegister, onRestart, onTitle }: Props) {
  const buttons = (
    <div className="result-btns">
      <button className="btn btn-gold" onClick={onRegister}>
        <Trophy size={14} /> 랭킹 등록
      </button>
      <button className="btn btn-primary" onClick={onRestart}>
        <RefreshCw size={14} /> 다시 시작
      </button>
      <button className="btn btn-ghost" onClick={onTitle}>
        <Home size={14} /> 타이틀로
      </button>
    </div>
  );

  if (variant === 'gameover') {
    return (
      <div className="overlay overlay-timeout">
        <div className="result-card result-card-timeout">
          <div className="result-icon-wrap result-icon-timeout">
            <Clock size={44} strokeWidth={1.5} />
          </div>
          <h2 className="result-title">시간 종료</h2>
          <div className="result-divider" />
          <div className="result-score-block">
            <span className="result-score-label">최종 점수</span>
            <span className="result-score">{finalScore.toLocaleString()}<small>점</small></span>
          </div>
          <div className="result-divider" />
          {buttons}
        </div>
      </div>
    );
  }

  return (
    <div className="overlay overlay-clear">
      <div className="result-card result-card-clear">
        {/* 트로피 아이콘 + 빛살 (같은 래퍼 → 트로피 중심 기준 회전) */}
        <div className="result-icon-area">
          <div className="result-rays" />
          <div className="result-icon-wrap result-icon-clear">
            <Trophy size={44} strokeWidth={1.5} />
          </div>
        </div>

        <h2 className="result-title result-title-clear">CLEAR!</h2>
        <p className="result-sub">⭐ 5스테이지 전 클리어 달성! ⭐</p>

        <div className="result-divider" />

        <div className="result-breakdown">
          <div className="result-breakdown-row">
            <span>매칭 점수</span>
            <span>{clearStats.matchScore.toLocaleString()}점</span>
          </div>
          <div className="result-breakdown-row result-breakdown-bonus">
            <span>스테이지 클리어 ×5</span>
            <span>+{clearStats.clearBonus.toLocaleString()}점</span>
          </div>
          <div className="result-breakdown-row result-breakdown-bonus">
            <span>잔여 시간 보너스</span>
            <span>+{clearStats.timeBonus.toLocaleString()}점</span>
          </div>
        </div>

        <div className="result-score-block">
          <span className="result-score-label">최종 점수</span>
          <span className="result-score result-score-clear">
            {finalScore.toLocaleString()}<small>점</small>
          </span>
        </div>

        <div className="result-divider" />
        {buttons}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: PauseOverlay.tsx** (기존 579~617행)

```tsx
import { Home, Pause, Play } from 'lucide-react';
import { formatTime } from '../game/format';

interface Props {
  showHomeConfirm: boolean;
  timeLeftMs: number;
  score: number;
  onResume: () => void;
  onHome: () => void;
  onCancelHome: () => void;
}

export default function PauseOverlay({ showHomeConfirm, timeLeftMs, score, onResume, onHome, onCancelHome }: Props) {
  return (
    <div className="pause-overlay">
      <div className="pause-card">
        {showHomeConfirm ? (
          /* ── 홈 확인 다이얼로그 ── */
          <>
            <div className="pause-icon pause-icon-warn">
              <Home size={40} strokeWidth={1.4} />
            </div>
            <h2 className="pause-title" style={{ fontSize: '20px' }}>게임을 종료할까요?</h2>
            <p className="pause-confirm-desc">진행 중인 게임이 사라집니다</p>
            <button className="btn btn-danger" onClick={onHome}>
              <Home size={15} /> 나가기
            </button>
            <button className="btn btn-primary" onClick={onCancelHome}>
              <Play size={15} /> 계속하기
            </button>
          </>
        ) : (
          /* ── 일반 일시정지 ── */
          <>
            <div className="pause-icon"><Pause size={44} strokeWidth={1.4} /></div>
            <h2 className="pause-title">일시정지</h2>
            <div className="pause-info">
              <span>{formatTime(timeLeftMs)}</span>
              <span>·</span>
              <span>{score.toLocaleString()}점</span>
            </div>
            <button className="btn btn-primary" onClick={onResume}>
              <Play size={15} /> 계속하기
            </button>
            <button className="btn btn-secondary" onClick={onHome}>
              <Home size={15} /> 타이틀로
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Hud.tsx** (기존 495~561행, 음소거·볼륨은 로컬 상태)

```tsx
import { useState } from 'react';
import { Home, Pause, Play, RefreshCw, Shuffle, Trophy, Volume2, VolumeX } from 'lucide-react';
import { TIME_LIMIT } from '../game/constants';
import { formatTime, toSeconds } from '../game/format';
import { getBGMVolume, getMuted, setBGMVolume, setMuted } from '../game/sounds';

interface Props {
  stage: number;
  score: number;
  possiblePairs: number;
  timeLeftMs: number;
  isPaused: boolean;
  shuffleCharge: number;
  onHome: () => void;
  onTogglePause: () => void;
  onShuffle: () => void;
  onShowRanking: () => void;
  onRestart: () => void;
}

export default function Hud({
  stage, score, possiblePairs, timeLeftMs, isPaused, shuffleCharge,
  onHome, onTogglePause, onShuffle, onShowRanking, onRestart,
}: Props) {
  const [isMuted, setIsMuted] = useState(() => getMuted());
  const [bgmVolume, setBgmVolume] = useState(() => getBGMVolume());

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    setMuted(next);
  };

  // 볼륨 0 ↔ 음소거 연동
  const handleVolumeChange = (val: number) => {
    setBgmVolume(val);
    setBGMVolume(val);
    if (val === 0 && !isMuted) { setIsMuted(true); setMuted(true); }
    else if (val > 0 && isMuted) { setIsMuted(false); setMuted(false); }
  };

  const timeRatio = Math.min(toSeconds(timeLeftMs) / TIME_LIMIT, 1);
  const timerColor = timeRatio > 0.4 ? '#4ecdc4' : timeRatio > 0.2 ? '#ffd166' : '#ef4444';
  const canShuffle = shuffleCharge >= 1;

  return (
    <div className="hud">
      <div className="hud-stage">
        <span className="hud-stage-label">STAGE</span>
        <span className="hud-stage-num">{stage}</span>
      </div>
      <div className="hud-left">
        <div className="hud-score">{score.toLocaleString()}점</div>
        <div className="hud-pairs">
          <span className="hud-pairs-dot" style={{ background: possiblePairs === 0 ? '#ef4444' : possiblePairs <= 3 ? '#ffd166' : '#4ecdc4' }} />
          {possiblePairs}쌍
        </div>
      </div>
      <div className="hud-center">
        <div className="timer-text" style={{ color: timerColor }}>
          <span className={`timer-digits ${timeRatio <= 0.2 ? 'timer-digits-urgent' : ''}`}>{formatTime(timeLeftMs)}</span>
        </div>
        <div className="timer-bar-wrap">
          <div className="timer-bar" style={{ width: `${timeRatio * 100}%`, background: timerColor }} />
          <div className="timer-bar-shine" />
        </div>
      </div>
      <div className="hud-right">
        <button className="hud-btn" title="홈" onClick={onHome}>
          <Home size={16} />
        </button>
        <button className="hud-btn" title={isPaused ? '계속하기' : '일시정지'} onClick={onTogglePause}>
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button
          className={`hud-btn hud-btn-shuffle ${canShuffle ? 'hud-btn-charged' : ''}`}
          title={`셔플 (${shuffleCharge}회 보유)`}
          onClick={onShuffle}
          disabled={!canShuffle}
        >
          <Shuffle size={16} />
          {shuffleCharge > 0 && (
            <span className="hud-btn-badge hud-btn-badge-ready">{shuffleCharge}</span>
          )}
        </button>
        <div className="hud-volume-wrap">
          <button
            className={`hud-btn ${isMuted ? 'hud-btn-muted' : ''}`}
            title={isMuted ? '소리 켜기' : '소리 끄기'}
            onClick={handleToggleMute}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="hud-volume-popup">
            <input
              type="range"
              className="hud-volume-slider"
              min={0} max={1} step={0.05}
              value={bgmVolume}
              onChange={e => handleVolumeChange(Number(e.target.value))}
            />
          </div>
        </div>
        <button className="hud-btn" title="랭킹" onClick={onShowRanking}>
          <Trophy size={16} />
        </button>
        <button className="hud-btn" title="새 게임" onClick={onRestart}>
          <RefreshCw size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Game.tsx 전체 교체**

```tsx
import { useCallback, useMemo, useReducer, useState } from 'react';
import { createInitialState, gameReducer, selectBoardView } from '../game/gameReducer';
import { useGameEvents } from '../hooks/useGameEvents';
import { useGameScheduler } from '../hooks/useGameScheduler';
import Board from './Board';
import CountdownOverlay from './CountdownOverlay';
import Hud from './Hud';
import PauseOverlay from './PauseOverlay';
import RankingModal from './Ranking/RankingModal';
import RankingRegisterModal from './Ranking/RankingRegisterModal';
import ResultOverlay from './ResultOverlay';
import StartScreen from './StartScreen';
import './Game.css';

const randomSeed = () => Math.floor(Math.random() * 0x100000000);

export default function Game() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [showRanking, setShowRanking] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [highlightId, setHighlightId] = useState<string | undefined>();

  useGameScheduler(state, dispatch);
  const itemMsg = useGameEvents(state);
  const { pathCells, matchedCells, currentPath } = useMemo(
    () => selectBoardView(state.pendingMatches),
    [state.pendingMatches],
  );

  const startGame = useCallback(() => {
    setShowHomeConfirm(false);
    dispatch({ type: 'START', seed: randomSeed() });
  }, []);

  const goTitle = useCallback(() => {
    setShowHomeConfirm(false);
    dispatch({ type: 'GO_TITLE' });
  }, []);

  const handleCellClick = useCallback((r: number, c: number) => dispatch({ type: 'CLICK', r, c }), []);

  // HUD 홈 버튼 — 실수 클릭 방지: 일시정지 + 확인 다이얼로그
  const handleHomeClick = () => {
    dispatch({ type: 'PAUSE' });
    setShowHomeConfirm(true);
  };

  const handleCancelHome = () => {
    setShowHomeConfirm(false);
    dispatch({ type: 'RESUME' });
  };

  const { phase, isPaused } = state;

  if (phase === 'title') {
    return <StartScreen onStart={startGame} />;
  }

  return (
    <div className="game-wrap">
      {state.countdown !== null && <CountdownOverlay countdown={state.countdown} />}

      {(phase === 'gameover' || phase === 'cleared') && (
        <ResultOverlay
          variant={phase}
          finalScore={state.finalScore}
          clearStats={state.clearStats}
          onRegister={() => setShowRegister(true)}
          onRestart={startGame}
          onTitle={goTitle}
        />
      )}

      {phase === 'playing' && (
        <div className={`game-content ${isPaused ? 'game-content-paused' : ''}`}>
          <Hud
            stage={state.stage}
            score={state.score}
            possiblePairs={state.possiblePairs}
            timeLeftMs={state.timeLeftMs}
            isPaused={isPaused}
            shuffleCharge={state.shuffleCharge}
            onHome={handleHomeClick}
            onTogglePause={() => dispatch({ type: isPaused ? 'RESUME' : 'PAUSE' })}
            onShuffle={() => dispatch({ type: 'MANUAL_SHUFFLE' })}
            onShowRanking={() => setShowRanking(true)}
            onRestart={startGame}
          />
          <div className="board-wrap">
            <Board
              board={state.board}
              selected={state.selected}
              pathCells={pathCells}
              matchedCells={matchedCells}
              currentPath={currentPath}
              onCellClick={handleCellClick}
            />
          </div>
        </div>
      )}

      {isPaused && phase === 'playing' && (
        <PauseOverlay
          showHomeConfirm={showHomeConfirm}
          timeLeftMs={state.timeLeftMs}
          score={state.score}
          onResume={() => dispatch({ type: 'RESUME' })}
          onHome={goTitle}
          onCancelHome={handleCancelHome}
        />
      )}

      {itemMsg && <div className="item-msg">{itemMsg}</div>}

      {showRanking && (
        <RankingModal onClose={() => setShowRanking(false)} highlightSoopId={highlightId} />
      )}
      {showRegister && (
        <RankingRegisterModal
          score={state.finalScore}
          onClose={() => setShowRegister(false)}
          onSuccess={(_rank, soopId) => {
            setHighlightId(soopId);
            setShowRegister(false);
            setShowRanking(true);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: 테스트·빌드**

Run: `npm test && npm run build` → 성공

- [ ] **Step 9: 브라우저 동작 확인** (`preview_start whale-connect-dev`, `.env`가 필요하면 메인 체크아웃에서 복사)

확인 항목: 시작 → 카드 선택·매칭·경로 표시·사라짐 애니메이션, 오답 감점, 타이머 감소, 일시정지/재개, 홈 확인 다이얼로그, 셔플 버튼, 콘솔 에러 없음. 스테이지 전환은 `javascript_tool`로 확인하지 않고 reducer 테스트로 갈음.

- [ ] **Step 10: Commit**

```bash
git add src/hooks src/components
git commit -m "refactor: Game.tsx를 reducer·스케줄러·이벤트 훅과 UI 컴포넌트로 분리"
```

---

### Task 4: 랭킹 저장을 Cloud Function으로 일원화

**Files:**
- Modify: `functions/src/index.ts` (재작성), `functions/package.json` (`@types/node` 추가), `firestore.rules`, `firebase.json`, `src/services/firebase.ts`, `src/components/Ranking/RankingRegisterModal.tsx`, `vite.config.ts`

**Interfaces:**
- Produces: callable `saveRanking({ soopId: string, score: number }) → { success: true, rank: number, isNewRecord: boolean, isWC: boolean }`, 에러 코드 `invalid-argument | not-found | already-exists(details.existingBest) | failed-precondition(details.minScore)`
- Client: `saveScore(score: number, soopId: string): Promise<SaveScoreResult>` (`error`: `'LOWER_THAN_EXISTING' | 'TOP_100_REQUIRED' | 'NOT_FOUND' | 'UNKNOWN'`)

- [ ] **Step 1: functions/src/index.ts 재작성**

```ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const RANKINGS = 'wc-rankings';
const WC_RANKINGS = 'wc-rankings-wc';
const TOP_N = 100;
const MIN_SCORE = 1;
const MAX_SCORE = 99_999;

// ── 고래상사 멤버 목록 (멤버 여부는 서버에서만 판정) ──
const WC_MEMBER_IDS = [
  'xpdpfv2', 'kimmaren77', 'melodingding', 'bach023', 'gyeonjahee',
  'akdma9692', 'nlov555jij', 'doki0818', 'joaras2', 'ducke77',
  'gatgdf', 'soyoung6056', 'chae1hana', 'eunpp0', 'poippoi52', 'himuru',
];

interface SaveRankingRequest {
  soopId: unknown;
  score: unknown;
}

interface SaveRankingResult {
  success: true;
  rank: number;
  isNewRecord: boolean;
  isWC: boolean;
}

interface SoopProfile {
  nickname: string;
  profileImage: string | null;
}

interface SoopStationResponse {
  user_nick?: string;
  profile_image?: string;
  station?: { user_nick?: string; profile_image?: string };
}

// SOOP 방송국 API로 닉네임·프로필을 서버에서 직접 조회 (클라이언트 값은 신뢰하지 않음)
async function fetchSoopProfile(soopId: string): Promise<SoopProfile | null> {
  try {
    const res = await fetch(`https://bjapi.afreecatv.com/api/${encodeURIComponent(soopId)}/station`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (WhaleConnect ranking)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SoopStationResponse;
    const nickname = (data.user_nick || data.station?.user_nick || '').trim().slice(0, 50);
    if (!nickname) return null;
    const raw = data.profile_image || data.station?.profile_image || '';
    const profileImage = raw.startsWith('//') ? `https:${raw}` : /^https?:\/\//.test(raw) ? raw : null;
    return { nickname, profileImage };
  } catch {
    return null;
  }
}

// TOP_N 밖으로 밀려난 문서 정리
async function trimCollection(name: string): Promise<void> {
  const overflow = await db.collection(name).orderBy('score', 'desc').offset(TOP_N).get();
  if (overflow.empty) return;
  const batch = db.batch();
  overflow.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

/**
 * saveRanking — 랭킹 저장의 유일한 경로
 * 클라이언트 쓰기는 firestore.rules에서 전면 차단되어 있고, Admin SDK는 규칙을 우회한다.
 */
export const saveRanking = onCall<SaveRankingRequest, Promise<SaveRankingResult>>(
  { region: 'asia-northeast3' },
  async (request) => {
    const { soopId, score } = request.data;

    if (typeof soopId !== 'string' || typeof score !== 'number') {
      throw new HttpsError('invalid-argument', '잘못된 데이터 형식입니다.');
    }
    if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
      throw new HttpsError('invalid-argument', `점수는 ${MIN_SCORE}~${MAX_SCORE} 사이 정수여야 합니다.`);
    }
    const id = soopId.toLowerCase().trim();
    if (id.length < 1 || id.length > 50) {
      throw new HttpsError('invalid-argument', 'SOOP 아이디가 유효하지 않습니다.');
    }

    const profile = await fetchSoopProfile(id);
    if (!profile) {
      throw new HttpsError('not-found', 'SOOP 아이디를 확인할 수 없습니다.');
    }

    const isWC = WC_MEMBER_IDS.includes(id);

    const { rank, isNewRecord } = await db.runTransaction(async (tx) => {
      // 트랜잭션: 모든 읽기를 쓰기 전에 수행
      const existingSnap = await tx.get(db.collection(RANKINGS).where('soopId', '==', id));
      const wcExistingSnap = await tx.get(db.collection(WC_RANKINGS).where('soopId', '==', id));
      const topSnap = await tx.get(db.collection(RANKINGS).orderBy('score', 'desc').limit(TOP_N));

      if (!existingSnap.empty) {
        const existingBest = Math.max(...existingSnap.docs.map(d => d.get('score') as number));
        if (score <= existingBest) {
          throw new HttpsError('already-exists', `이미 더 높은 점수(${existingBest})가 등록되어 있습니다.`, { existingBest });
        }
      }

      const others = topSnap.docs.filter(d => d.get('soopId') !== id);
      if (others.length >= TOP_N) {
        const minScore = others[others.length - 1].get('score') as number;
        if (score <= minScore) {
          throw new HttpsError('failed-precondition', `TOP ${TOP_N} 진입을 위해 ${minScore + 1}점 이상이 필요합니다.`, { minScore });
        }
      }

      existingSnap.docs.forEach(d => tx.delete(d.ref));
      wcExistingSnap.docs.forEach(d => tx.delete(d.ref));

      const data = {
        score,
        playerName: profile.nickname,
        soopId: id,
        profileImage: profile.profileImage,
        isWC,
        timestamp: FieldValue.serverTimestamp(),
        createdAt: new Date().toISOString(),
      };
      tx.set(db.collection(RANKINGS).doc(), data);
      if (isWC) tx.set(db.collection(WC_RANKINGS).doc(), data);

      return {
        rank: others.filter(d => (d.get('score') as number) > score).length + 1,
        isNewRecord: !existingSnap.empty,
      };
    });

    // 정리는 부가 작업 — 실패해도 등록 결과에는 영향 없음
    await Promise.all([trimCollection(RANKINGS), trimCollection(WC_RANKINGS)]).catch(() => {});

    return { success: true, rank, isNewRecord, isWC };
  },
);
```

- [ ] **Step 2: functions/package.json devDependencies에 `"@types/node": "^20.0.0"` 추가, 빌드 확인**

Run: `cd functions && npm install && npm run build` → 성공

- [ ] **Step 3: firestore.rules 교체**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 랭킹은 누구나 읽을 수 있고, 쓰기는 saveRanking Cloud Function(Admin SDK)만 가능하다.
    // 비정상 점수는 운영자가 Firebase 콘솔에서 직접 삭제한다.
    match /wc-rankings/{docId} {
      allow read: if true;
      allow write: if false;
    }
    match /wc-rankings-wc/{docId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 4: firebase.json에 functions 설정 추가** (hosting·firestore 유지)

```json
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "*.local"],
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ]
```

- [ ] **Step 5: src/services/firebase.ts 수정**

- import에서 `addDoc, deleteDoc, doc, where, serverTimestamp, writeBatch` 제거, `import { getFunctions, httpsCallable } from 'firebase/functions'; import type { FunctionsError } from 'firebase/functions';` 추가
- `WC_MEMBER_IDS`, `isWCMember`, 기존 `saveScore`, `cleanupOldRankings` 삭제
- `SaveScoreResult.error` 주석에 코드 목록 명시
- 아래 코드 추가:

```ts
const functions = getFunctions(app, 'asia-northeast3');

interface SaveRankingResponse {
  success: true;
  rank: number;
  isNewRecord: boolean;
  isWC: boolean;
}

const saveRankingFn = httpsCallable<{ soopId: string; score: number }, SaveRankingResponse>(functions, 'saveRanking');

// ── 점수 저장 (Cloud Function 경유 — 닉네임·프로필·멤버 여부는 서버가 결정) ──
export async function saveScore(score: number, soopId: string): Promise<SaveScoreResult> {
  try {
    const { data } = await saveRankingFn({ soopId, score });
    trackEvent('ranking_register', { score, rank: data.rank, is_wc: data.isWC, is_update: data.isNewRecord });
    return { success: true, rank: data.rank, isNewRecord: data.isNewRecord };
  } catch (e) {
    const err = e as FunctionsError;
    const details = (err.details ?? {}) as { existingBest?: number };
    switch (err.code) {
      case 'functions/already-exists':
        return { success: false, error: 'LOWER_THAN_EXISTING', message: err.message, existingBest: details.existingBest };
      case 'functions/failed-precondition':
        return { success: false, error: 'TOP_100_REQUIRED', message: err.message };
      case 'functions/not-found':
        return { success: false, error: 'NOT_FOUND', message: err.message };
      default:
        return { success: false, error: 'UNKNOWN', message: String(e) };
    }
  }
}
```

- [ ] **Step 6: RankingRegisterModal.tsx 수정**

- `const [registeredRank, setRegisteredRank] = useState<number | null>(null);` 추가
- `saveScore(score, userInfo.soopId)`로 호출 변경, 성공 시 `setRegisteredRank(result.rank)`
- 에러 분기에 `else if (result.error === 'NOT_FOUND') setErrorMsg('SOOP 아이디를 확인할 수 없습니다.');` 추가
- 완료 화면 순위를 `{registeredRank ?? eligibility?.estimatedRank ?? '?'}위`로

- [ ] **Step 7: vite.config.ts** — `'firebase-vendor'` 배열에 `'firebase/functions'` 추가

- [ ] **Step 8: 빌드·테스트**

Run: `npm test && npm run build` → 성공

- [ ] **Step 9: Commit**

```bash
git add functions/src/index.ts functions/package.json functions/package-lock.json firestore.rules firebase.json src/services/firebase.ts src/components/Ranking/RankingRegisterModal.tsx vite.config.ts
git commit -m "security: 랭킹 쓰기를 saveRanking Cloud Function으로 일원화, 클라이언트 쓰기 차단"
```

- [ ] **Step 10: 배포 (사용자 확인 후)**

```bash
firebase deploy --only functions
npm run build && firebase deploy --only hosting
firebase deploy --only firestore:rules
```

---

### Task 5: 문서·상수 정리

**Files:**
- Create: `.env.example`
- Modify: `README.md`, `src/game/constants.ts`, `src/components/Card.tsx`(필요 시)

- [ ] **Step 1: constants.ts** — `CardDef.image`를 `image?: string`로, 아이템 두 개의 `image` 속성 삭제. Card.tsx는 아이템이 아닐 때만 `def.image`를 사용하므로 변경 불필요(빌드로 확인).

- [ ] **Step 2: .env.example**

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

- [ ] **Step 3: README 수정**

- "백엔드 없이 클라이언트 단독" 인용 블록 → 게임 로직은 순수 reducer로 클라이언트에서 동작하고, 랭킹 저장만 Cloud Function을 거친다는 설명으로 교체
- Backend/Infra 표에 `Cloud Functions (v2)` 행 추가, 랭킹 섹션(4번)을 서버 저장 방식(SOOP 서버 조회·트랜잭션·클라이언트 쓰기 차단)으로 교체
- 아키텍처 트리를 새 파일 구성으로 교체(hooks/, gameReducer.ts, stages.ts, rng.ts, format.ts, 분리된 컴포넌트, functions/)
- 6번 "StrictMode 대응" 섹션을 "순수 reducer + 스케줄러" 설명으로 교체
- 로컬 실행에 `npm test` 추가, 배포 섹션에 배포 순서(functions → hosting → rules) 명시
- 캐릭터 수 표기를 "17인"으로 통일(18종/19종 표기는 카드 종류 수로 유지)
- 향후 개선 계획에서 Cloud Functions 항목 제거

- [ ] **Step 4: 빌드·테스트 후 Commit**

```bash
npm test && npm run build
git add README.md .env.example src/game/constants.ts
git commit -m "docs: README·.env.example 정리, 미사용 아이템 이미지 경로 제거"
```
