import {
  countPossiblePairs, generateBoardWithObstacles, isBoardClear, shuffleBoard, shuffleBoardWithObstacles,
} from './boardLogic';
import type { Board } from './boardLogic';
import { findPath } from './connectLogic';
import {
  BOARD_CLEAR_BONUS, COMBO_MAX, COMBO_POINT, COMBO_WINDOW_MS, ITEM_SHUFFLE_ID, ITEM_TIME_ID, OBSTACLE_ID,
  SCORE_PER_MATCH, stageTimeBonus, TIME_ADD_SECONDS, TIME_BONUS_MULTIPLIER, TIME_LIMIT,
} from './constants';
import { toSeconds } from './format';
import { createRng } from './rng';
import type { Rng } from './rng';
import { getBoardConfig, MAX_STAGE, pickFanchars } from './stages';

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
  combo: number;
  lastMatchAt: number | null; // 직전 매칭 완료 시각(ms) — 콤보 판정용
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

// 시각(at)이 필요한 액션은 스케줄러가 현재 시각을 실어 보낸다 — reducer는 시계를 읽지 않는다
export type GameAction =
  | { type: 'START'; seed: number }
  | { type: 'GO_TITLE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'CLICK'; r: number; c: number }
  | { type: 'MATCH_REVEAL'; gameId: number; matchId: number }
  | { type: 'MATCH_RESOLVE'; gameId: number; matchId: number; at: number }
  | { type: 'COMBO_EXPIRE'; gameId: number; at: number }
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
    combo: 0,
    lastMatchAt: null,
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

/** 시드로 난수를 쓰고, 다음 시드와 함께 결과를 돌려준다 */
function withRng<T>(seed: number, fn: (rng: Rng) => T): { value: T; seed: number } {
  const rng = createRng(seed);
  const value = fn(rng.next);
  return { value, seed: rng.seed() };
}

function buildStageBoard(stage: number, seed: number): { value: Board; seed: number } {
  return withRng(seed, rng => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(stage, pickFanchars(stage, rng));
    return generateBoardWithObstacles(rows, cols, counts, obstacleCount, rng);
  });
}

function replaceBoard(s: GameState, shuffle: (board: Board, rng: Rng) => Board): GameState {
  const { value: board, seed } = withRng(s.rngSeed, rng => shuffle(s.board, rng));
  return {
    ...s,
    board,
    rngSeed: seed,
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
  const { value: board, seed: nextSeed } = buildStageBoard(1, seed);
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
  // 오답(다른 카드·연결 불가)은 감점 없이 새 셀 선택
  if (path === null) return withEvent({ ...s, selected: [r, c] }, 'matchFail');

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

  const nextStage = s.stage + 1;
  const { value: nextBoard, seed } = buildStageBoard(nextStage, s.rngSeed);
  return withEvent({
    ...s,
    score,
    stage: nextStage,
    timeLeftMs: s.timeLeftMs + stageTimeBonus(nextStage) * 1000,
    rngSeed: seed,
    nextBoard,
    countdown: COUNTDOWN_START,
    selected: null,
  }, 'stageClear');
}

function resolveMatch(s: GameState, matchId: number, at: number): GameState {
  if (s.phase !== 'playing') return s;
  const match = s.pendingMatches.find(m => m.id === matchId);
  if (!match) return s;

  const board = s.board.map(row => [...row]);
  board[match.a[0]][match.a[1]] = null;
  board[match.b[0]][match.b[1]] = null;

  // 콤보: 직전 매칭 후 COMBO_WINDOW_MS 이내면 +1 (최대 COMBO_MAX), 아니면 0부터
  const inWindow = s.lastMatchAt !== null && at - s.lastMatchAt <= COMBO_WINDOW_MS;
  const combo = inWindow ? Math.min(s.combo + 1, COMBO_MAX) : 0;

  let next: GameState = {
    ...s,
    board,
    boardVersion: s.boardVersion + 1,
    pendingMatches: s.pendingMatches.filter(m => m.id !== matchId),
    score: s.score + SCORE_PER_MATCH + combo * COMBO_POINT,
    combo,
    lastMatchAt: at,
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
      return resolveMatch(s, action.matchId, action.at);
    case 'COMBO_EXPIRE': {
      // 콤보 표시 만료 — 직전 매칭 후 창이 지났을 때만
      if (s.combo === 0 || s.lastMatchAt === null || action.at - s.lastMatchAt < COMBO_WINDOW_MS) return s;
      return { ...s, combo: 0 };
    }
    case 'TICK':
      return tick(s, action.deltaMs, action.flush ?? false);
    case 'COUNTDOWN_TICK':
      return countdownTick(s);
    case 'AUTO_SHUFFLE': {
      if (!isRunning(s) || action.boardVersion !== s.boardVersion) return s;
      if (s.possiblePairs > 0 || s.pendingMatches.length > 0 || isBoardClear(s.board)) return s;
      // 장애물까지 함께 재배치 — 마지막 쌍이 장애물에 갇히는 교착 방지
      return withEvent(replaceBoard(s, (board, rng) => shuffleBoardWithObstacles(board, rng)), 'autoShuffle');
    }
    case 'MANUAL_SHUFFLE': {
      if (!isRunning(s) || s.pendingMatches.length > 0 || s.shuffleCharge < 1) return s;
      return withEvent({ ...replaceBoard(s, shuffleBoard), shuffleCharge: s.shuffleCharge - 1 }, 'shuffleUsed');
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
