import { describe, expect, it } from 'vitest';
import type { Board } from './boardLogic';
import { countPossiblePairs } from './boardLogic';
import { ITEM_SHUFFLE_ID, ITEM_TIME_ID, OBSTACLE_ID, TIME_LIMIT } from './constants';
import { createInitialState, gameReducer, selectBoardView } from './gameReducer';
import type { GameAction, GameState } from './gameReducer';
import { parseBoard } from './testUtils';
import {
  VERSUS_BREAK_CHARGES, VERSUS_COLS, VERSUS_OBSTACLES, VERSUS_ROWS, VERSUS_TIME_LIMIT, VERSUS_TOTAL_CARDS, versusProgress,
} from './versus';

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
function matchPair(state: GameState, a: [number, number], b: [number, number], at = 0): GameState {
  const s = run(state, { type: 'CLICK', r: a[0], c: a[1] }, { type: 'CLICK', r: b[0], c: b[1] });
  const m = s.pendingMatches[s.pendingMatches.length - 1];
  return run(s,
    { type: 'MATCH_REVEAL', gameId: s.gameId, matchId: m.id },
    { type: 'MATCH_RESOLVE', gameId: s.gameId, matchId: m.id, at },
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

  it('다른 카드면 감점 없이 새 셀 선택', () => {
    const s = run(playing(parseBoard(['1..2', '2..1']), { score: 20 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 3 });
    expect(s.score).toBe(20);
    expect(s.selected).toEqual([0, 3]);
    expect(lastEvent(s)).toBe('matchFail');
  });

  it('경로가 없어도 감점 없음', () => {
    const s = run(playing(parseBoard(['#####', '#1#1#', '#####']), { score: 10 }),
      { type: 'CLICK', r: 1, c: 1 }, { type: 'CLICK', r: 1, c: 3 });
    expect(s.score).toBe(10);
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

  it('7스테이지: 보너스 계산 후 FINISH_CLEAR로 cleared', () => {
    let s = matchPair(playing(parseBoard(['1..1']), { stage: 7, score: 1000, timeLeftMs: 30_500 }), [0, 0], [0, 3]);
    // 1000 + 10 + 100 = 1110, 클리어 보너스 7 × 100 = 700, 시간 보너스 ceil(30.5)=31 × 10 = 310
    expect(s.clearing).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.clearStats).toEqual({ matchScore: 410, clearBonus: 700, timeBonus: 310 });
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
      { type: 'MATCH_RESOLVE', gameId: 1, matchId: m1.id, at: 0 },
      { type: 'MATCH_RESOLVE', gameId: 1, matchId: m2.id, at: 100 });
    expect(s.stage).toBe(2);
    expect(s.countdown).toBe(3);
  });
});

describe('콤보', () => {
  const board = parseBoard(['1..1', '2..2', '3..3', '4..4', '5..5', '6..6', '7..7', '8..8']);
  // 행 r의 쌍을 at 시각에 매칭
  const matchRow = (s: GameState, r: number, at: number) => matchPair(s, [r, 0], [r, 3], at);

  it('3초 안에 연속 매칭하면 콤보당 +2점', () => {
    let s = matchRow(playing(board), 0, 1000);
    expect(s.combo).toBe(0);
    expect(s.score).toBe(10);
    s = matchRow(s, 1, 3500);
    expect(s.combo).toBe(1);
    expect(s.score).toBe(10 + 12);
    s = matchRow(s, 2, 6500); // 직전 후 정확히 3초 — 창 안
    expect(s.combo).toBe(2);
    expect(s.score).toBe(10 + 12 + 14);
  });

  it('3초가 지나면 콤보가 0부터 다시 시작', () => {
    let s = matchRow(matchRow(playing(board), 0, 0), 1, 1000);
    expect(s.combo).toBe(1);
    s = matchRow(s, 2, 4001);
    expect(s.combo).toBe(0);
    expect(s.score).toBe(10 + 12 + 10);
  });

  it('콤보는 최대 5', () => {
    let s = playing(board);
    for (let r = 0; r < 8; r++) s = matchRow(s, r, r * 100);
    expect(s.combo).toBe(5);
    // 콤보 0,1,2,3,4,5,5,5 → 80 + 2×(0+1+2+3+4+5+5+5), 마지막 쌍으로 판 클리어 +100
    expect(s.score).toBe(80 + 2 * 25 + 100);
  });

  it('COMBO_EXPIRE는 창이 지난 뒤에만 콤보를 0으로', () => {
    const s = matchRow(matchRow(playing(board), 0, 0), 1, 1000);
    expect(run(s, { type: 'COMBO_EXPIRE', gameId: 1, at: 3999 })).toBe(s);
    expect(run(s, { type: 'COMBO_EXPIRE', gameId: 1, at: 4000 }).combo).toBe(0);
  });

  it('새 게임은 콤보를 초기화', () => {
    const s = matchRow(matchRow(playing(board), 0, 0), 1, 1000);
    const started = run(s, { type: 'START', seed: 1 });
    expect(started.combo).toBe(0);
    expect(started.lastMatchAt).toBeNull();
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
    const after = run(s, { type: 'MATCH_RESOLVE', gameId: 1, matchId, at: 0 });
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
    expect(s2.events.length).toBeGreaterThan(0);
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

describe('대전 모드', () => {
  const versus = (board: Board, overrides: Partial<GameState> = {}) => playing(board, { versus: true, ...overrides });

  it('큰 단판 보드로 시작한다 — 시간추가 아이템 없음, 부수기 지급', () => {
    const s = gameReducer(createInitialState(), { type: 'START', seed: 99, versus: true });
    const cells = s.board.flat();
    expect(s.versus).toBe(true);
    expect(s.board).toHaveLength(VERSUS_ROWS);
    expect(s.board[0]).toHaveLength(VERSUS_COLS);
    expect(cells.filter(v => v === OBSTACLE_ID)).toHaveLength(VERSUS_OBSTACLES);
    expect(cells.filter(v => v !== null && v !== OBSTACLE_ID)).toHaveLength(VERSUS_TOTAL_CARDS);
    expect(cells).not.toContain(ITEM_TIME_ID);
    expect(s.timeLeftMs).toBe(VERSUS_TIME_LIMIT * 1000);
    expect(s.breakCharge).toBe(VERSUS_BREAK_CHARGES);
    expect(versusProgress(s.board)).toBe(0);
  });

  it('모든 카드 종류가 짝수 장', () => {
    const s = gameReducer(createInitialState(), { type: 'START', seed: 4, versus: true });
    const counts = new Map<number, number>();
    for (const v of s.board.flat()) {
      if (v !== null && v !== OBSTACLE_ID) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n % 2).toBe(0);
  });

  it('같은 시드면 같은 보드', () => {
    const a = gameReducer(createInitialState(), { type: 'START', seed: 5, versus: true });
    const b = gameReducer(createInitialState(), { type: 'START', seed: 5, versus: true });
    expect(a.board).toEqual(b.board);
  });

  it('timeLimitMs를 주면 그 시간으로 시작한다', () => {
    const s = gameReducer(createInitialState(), { type: 'START', seed: 5, versus: true, timeLimitMs: 118_500 });
    expect(s.timeLeftMs).toBe(118_500);
  });

  it('연속으로 맞춰도 콤보가 붙지 않는다', () => {
    let s = versus(parseBoard(['11', '22', '33']));
    s = matchPair(s, [0, 0], [0, 1], 1000);
    s = matchPair(s, [1, 0], [1, 1], 1500);
    expect(s.combo).toBe(0);
    expect(s.score).toBe(20);
  });

  it('장애물을 클릭하면 부수기 횟수를 쓰고 장애물이 사라진다', () => {
    const s = run(versus(parseBoard(['1#1', '2.2']), { breakCharge: 1 }), { type: 'CLICK', r: 0, c: 1 });
    expect(s.board[0][1]).toBeNull();
    expect(s.breakCharge).toBe(0);
    expect(s.possiblePairs).toBe(countPossiblePairs(s.board));
  });

  it('부수기는 선택 중인 카드를 유지한다', () => {
    const s = run(versus(parseBoard(['1#1', '2.2']), { breakCharge: 1 }),
      { type: 'CLICK', r: 0, c: 0 }, { type: 'CLICK', r: 0, c: 1 });
    expect(s.selected).toEqual([0, 0]);
  });

  it('횟수가 없으면 장애물 클릭은 무시된다', () => {
    const before = versus(parseBoard(['1#1', '2.2']));
    expect(run(before, { type: 'CLICK', r: 0, c: 1 })).toBe(before);
  });

  it('일시정지할 수 없다', () => {
    const before = versus(parseBoard(['11']));
    expect(run(before, { type: 'PAUSE' }).isPaused).toBe(false);
  });

  it('보드를 다 지우면 한 판으로 끝난다 — 클리어 보너스 + 잔여 시간 보너스', () => {
    const s = matchPair(versus(parseBoard(['11']), { timeLeftMs: 30_000 }), [0, 0], [0, 1]);
    expect(s.clearing).toBe(true);
    expect(s.countdown).toBeNull();
    expect(s.clearStats).toEqual({ matchScore: 10, clearBonus: 100, timeBonus: 300 });
    expect(s.finalScore).toBe(410);
    expect(run(s, { type: 'FINISH_CLEAR', gameId: s.gameId }).phase).toBe('cleared');
  });

  it('진행률은 지운 카드 비율', () => {
    const s = gameReducer(createInitialState(), { type: 'START', seed: 1, versus: true });
    const board = s.board.map(row => [...row]);
    let removed = 0;
    for (let r = 0; r < board.length && removed < VERSUS_TOTAL_CARDS / 2; r++) {
      for (let c = 0; c < board[r].length && removed < VERSUS_TOTAL_CARDS / 2; c++) {
        if (board[r][c] !== null && board[r][c] !== OBSTACLE_ID) { board[r][c] = null; removed++; }
      }
    }
    expect(versusProgress(board)).toBe(50);
  });
});
