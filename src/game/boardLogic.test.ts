import { describe, expect, it } from 'vitest';
import {
  countPossiblePairs, generateBoardWithObstacles, isBoardClear, shuffleBoard, shuffleBoardWithObstacles,
} from './boardLogic';
import type { Board } from './boardLogic';
import { CARD_DEFS, ITEM_SHUFFLE_ID, ITEM_TIME_ID, OBSTACLE_ID } from './constants';
import { createRng } from './rng';
import { getBoardConfig, MAX_STAGE, pickFanchars } from './stages';
import { parseBoard } from './testUtils';

const cardsOf = (board: Board) => board.flat().filter((v): v is number => v !== null && v !== OBSTACLE_ID);
const occupiedOf = (board: Board) => board.flat().filter((v): v is number => v !== null);
const memberIds = CARD_DEFS.filter(d => !d.isItem && !d.isFanchar).map(d => d.id);
const fancharIds = CARD_DEFS.filter(d => d.isFanchar).map(d => d.id);
const stages = Array.from({ length: MAX_STAGE }, (_, i) => i + 1);

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

describe('pickFanchars', () => {
  const expected = [1, 1, 2, 3, 4, 5, 6];

  it.each(stages)('스테이지 %i: 정해진 수만큼 서로 다른 팬캐릭을 뽑는다', stage => {
    const picked = pickFanchars(stage, createRng(stage).next);
    expect(picked).toHaveLength(expected[stage - 1]);
    expect(new Set(picked).size).toBe(picked.length);
    picked.forEach(id => expect(fancharIds).toContain(id));
  });

  it('같은 시드면 같은 팬캐릭', () => {
    expect(pickFanchars(7, createRng(9).next)).toEqual(pickFanchars(7, createRng(9).next));
  });
});

describe('getBoardConfig', () => {
  it.each(stages)('스테이지 %i: 카드 수 = 칸 수 - 장애물, 모든 타입 짝수, 멤버 전원 등장', stage => {
    const fanchars = pickFanchars(stage, createRng(stage).next);
    const { rows, cols, obstacleCount, counts } = getBoardConfig(stage, fanchars);
    expect(rows).toBe(8);
    expect(counts).toHaveLength(CARD_DEFS.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(rows * cols - obstacleCount);
    counts.forEach(n => expect(n % 2).toBe(0));
    memberIds.forEach(id => expect(counts[id]).toBeGreaterThan(0));
    fancharIds.forEach(id => expect(counts[id] > 0).toBe(fanchars.includes(id)));
    expect(counts[ITEM_TIME_ID]).toBeGreaterThan(0);
    expect(counts[ITEM_SHUFFLE_ID]).toBe(counts[ITEM_TIME_ID]);
  });

  it('스테이지 크기: 가로 10→16, 장애물 0→16', () => {
    const dims = stages.map(s => {
      const { cols, obstacleCount } = getBoardConfig(s, pickFanchars(s, createRng(1).next));
      return [cols, obstacleCount];
    });
    expect(dims).toEqual([[10, 0], [12, 2], [12, 4], [14, 8], [14, 10], [16, 14], [16, 16]]);
  });
});

describe('generateBoardWithObstacles', () => {
  it('같은 시드면 같은 보드', () => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(3, [15, 16]);
    const a = generateBoardWithObstacles(rows, cols, counts, obstacleCount, createRng(7).next);
    const b = generateBoardWithObstacles(rows, cols, counts, obstacleCount, createRng(7).next);
    expect(a).toEqual(b);
  });

  it('설정대로 장애물과 카드를 배치한다', () => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(7, [15, 16, 17, 18, 19, 20]);
    const board = generateBoardWithObstacles(rows, cols, counts, obstacleCount, createRng(1).next);
    const flat = board.flat();
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
    expect(cardsOf(shuffled).sort()).toEqual(cardsOf(board).sort());
  });
});

describe('shuffleBoardWithObstacles', () => {
  const stuck = parseBoard([
    '######',
    '#1...#',
    '####.#',
    '#....#',
    '#1####',
    '######',
  ]);

  it('빈칸 위치는 그대로, 카드+장애물 구성은 유지', () => {
    const shuffled = shuffleBoardWithObstacles(stuck, createRng(5).next);
    stuck.forEach((row, r) => row.forEach((v, c) => {
      expect(shuffled[r][c] === null).toBe(v === null);
    }));
    expect(occupiedOf(shuffled).sort()).toEqual(occupiedOf(stuck).sort());
  });

  it('연결 가능한 쌍이 생기도록 장애물까지 재배치한다', () => {
    expect(countPossiblePairs(stuck)).toBe(0);
    expect(countPossiblePairs(shuffleBoardWithObstacles(stuck, createRng(5).next))).toBeGreaterThan(0);
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
