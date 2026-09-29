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
