import type { Board } from './boardLogic';

type Cell = [number, number];

// 셀이 비어있거나 그리드 바깥(가상 테두리)인지 확인
function isPassable(board: Board, r: number, c: number): boolean {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  if (r < 0 || r >= rows || c < 0 || c >= cols) return true; // 그리드 바깥 = 빈 공간
  return board[r][c] === null;
}

// 두 셀 사이 직선 경로가 막힘 없이 연결되는지 확인 (끝점 제외)
function segClear(board: Board, r1: number, c1: number, r2: number, c2: number): boolean {
  if (r1 === r2) {
    const lo = Math.min(c1, c2), hi = Math.max(c1, c2);
    for (let c = lo + 1; c < hi; c++) {
      if (!isPassable(board, r1, c)) return false;
    }
    return true;
  }
  if (c1 === c2) {
    const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
    for (let r = lo + 1; r < hi; r++) {
      if (!isPassable(board, r, c1)) return false;
    }
    return true;
  }
  return false;
}

// (r1,c1)과 (r2,c2)를 최대 2번 꺾임으로 연결하는 경로를 반환
// 연결 불가 시 null 반환
export function findPath(board: Board, r1: number, c1: number, r2: number, c2: number): Cell[] | null {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;

  // 0 turns: 같은 행 또는 같은 열
  if (r1 === r2 && segClear(board, r1, c1, r1, c2)) {
    return buildStraightPath(r1, c1, r1, c2);
  }
  if (c1 === c2 && segClear(board, r1, c1, r2, c1)) {
    return buildStraightPath(r1, c1, r2, c1);
  }

  // 1 turn: 코너 (r1,c2) 또는 (r2,c1)
  if (isPassable(board, r1, c2) && segClear(board, r1, c1, r1, c2) && segClear(board, r1, c2, r2, c2)) {
    return [...buildStraightPath(r1, c1, r1, c2), ...buildStraightPath(r1, c2, r2, c2).slice(1)];
  }
  if (isPassable(board, r2, c1) && segClear(board, r1, c1, r2, c1) && segClear(board, r2, c1, r2, c2)) {
    return [...buildStraightPath(r1, c1, r2, c1), ...buildStraightPath(r2, c1, r2, c2).slice(1)];
  }

  // 2 turns: 중간 열 c (-1 ~ cols) 를 통해
  for (let c = -1; c <= cols; c++) {
    if (c === c1 || c === c2) continue;
    if (isPassable(board, r1, c) && isPassable(board, r2, c)
      && segClear(board, r1, c1, r1, c)
      && segClear(board, r1, c, r2, c)
      && segClear(board, r2, c, r2, c2)) {
      return [
        ...buildStraightPath(r1, c1, r1, c),
        ...buildStraightPath(r1, c, r2, c).slice(1),
        ...buildStraightPath(r2, c, r2, c2).slice(1),
      ];
    }
  }

  // 2 turns: 중간 행 r (-1 ~ rows) 를 통해
  for (let r = -1; r <= rows; r++) {
    if (r === r1 || r === r2) continue;
    if (isPassable(board, r, c1) && isPassable(board, r, c2)
      && segClear(board, r1, c1, r, c1)
      && segClear(board, r, c1, r, c2)
      && segClear(board, r, c2, r2, c2)) {
      return [
        ...buildStraightPath(r1, c1, r, c1),
        ...buildStraightPath(r, c1, r, c2).slice(1),
        ...buildStraightPath(r, c2, r2, c2).slice(1),
      ];
    }
  }

  return null;
}

function buildStraightPath(r1: number, c1: number, r2: number, c2: number): Cell[] {
  const path: Cell[] = [];
  if (r1 === r2) {
    const step = c1 <= c2 ? 1 : -1;
    for (let c = c1; c !== c2 + step; c += step) path.push([r1, c]);
  } else {
    const step = r1 <= r2 ? 1 : -1;
    for (let r = r1; r !== r2 + step; r += step) path.push([r, c1]);
  }
  return path;
}
