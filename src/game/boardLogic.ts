import { CARD_TYPES, OBSTACLE_ID } from './constants';
import { findPath } from './connectLogic';

export type Board = (number | null)[][];

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

  // 타입별로 셀을 그룹화 (장애물 제외)
  // → 같은 타입 내에서만 findPath 호출, 타입 간 비교 루프 제거
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

  // 같은 타입 그룹 내에서만 경로 체크
  // S5 기준: 전체 루프 8,911회 → 406회로 감소
  let count = 0;
  for (const cells of groups.values()) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (findPath(board, cells[i].r, cells[i].c, cells[j].r, cells[j].c) !== null) {
          count++;
        }
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
