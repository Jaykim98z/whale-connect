import { ROWS, COLS, CARD_TYPES, CARDS_PER_TYPE, OBSTACLE_ID } from './constants';
import { findPath } from './connectLogic';

export type Board = (number | null)[][];

/**
 * tileCounts: 각 타입별 카드 장수 배열 (짝수여야 쌍이 성립)
 * 단일 숫자를 넘기면 전체 타입에 동일 적용
 */
export function generateBoard(
  rows = ROWS,
  cols = COLS,
  tileCounts: number[] | number = CARDS_PER_TYPE,
): Board {
  const counts = Array.isArray(tileCounts)
    ? tileCounts
    : Array(CARD_TYPES).fill(tileCounts);

  const tiles: number[] = [];
  for (let id = 0; id < counts.length; id++) {
    for (let k = 0; k < counts[id]; k++) tiles.push(id);
  }
  shuffle(tiles);

  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => tiles[r * cols + c] ?? null)
  );
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function shuffleBoard(board: Board): Board {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  // 장애물(-1)은 제외하고 일반 카드만 셔플
  const remaining: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c] !== null && board[r][c] !== OBSTACLE_ID) remaining.push({ r, c });
    }
  }
  const values = remaining.map(pos => board[pos.r][pos.c] as number);
  shuffle(values);
  const newBoard: Board = board.map(row => [...row]);
  remaining.forEach((pos, i) => { newBoard[pos.r][pos.c] = values[i]; });
  return newBoard;
}

export function countPossiblePairs(board: Board): number {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  // 장애물(-1)은 제외
  const cells: { r: number; c: number; val: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = board[r][c];
      if (v !== null && v !== OBSTACLE_ID) cells.push({ r, c, val: v });
    }
  }
  let count = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (cells[i].val === cells[j].val) {
        const path = findPath(board, cells[i].r, cells[i].c, cells[j].r, cells[j].c);
        if (path !== null) count++;
      }
    }
  }
  return count;
}

export function isBoardClear(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      // 장애물(-1)은 남아있어도 클리어로 간주
      if (cell !== null && cell !== OBSTACLE_ID) return false;
    }
  }
  return true;
}

/**
 * 장애물이 포함된 보드 생성
 * 장애물 위치를 먼저 결정한 뒤 나머지 칸에 카드를 채움
 * tileCounts 합계 = rows*cols - obstacleCount 이어야 함
 */
export function generateBoardWithObstacles(
  rows: number,
  cols: number,
  tileCounts: number[] | number,
  obstacleCount: number,
): Board {
  const counts = Array.isArray(tileCounts)
    ? tileCounts
    : Array(CARD_TYPES).fill(tileCounts);

  // 전체 위치 목록 → 셔플
  const allPos: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      allPos.push({ r, c });
  shuffle(allPos);

  const obstaclePos = allPos.slice(0, obstacleCount);
  const cardPos     = allPos.slice(obstacleCount);

  // 카드 타일 생성 & 셔플
  const tiles: number[] = [];
  for (let id = 0; id < counts.length; id++)
    for (let k = 0; k < counts[id]; k++)
      tiles.push(id);
  shuffle(tiles);

  // 보드 구성
  const board: Board = Array.from({ length: rows }, () => Array(cols).fill(null));
  obstaclePos.forEach(({ r, c }) => { board[r][c] = OBSTACLE_ID; });
  cardPos.forEach(({ r, c }, i)  => { board[r][c] = tiles[i] ?? null; });

  return board;
}
