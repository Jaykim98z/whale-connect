import type { Board as BoardType } from '../game/boardLogic';
import Card from './Card';
import './Board.css';

interface Props {
  board: BoardType;
  selected: [number, number] | null;
  pathCells: Set<string>;
  matchedCells: Set<string>;
  currentPath: [number, number][] | null;
  onCellClick: (r: number, c: number) => void;
}

// 연결 경로 → 꺾임점(코너)만 추출
function getWaypoints(path: [number, number][]): [number, number][] {
  if (path.length <= 2) return path;
  const pts: [number, number][] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const [pr, pc] = path[i - 1];
    const [cr, cc] = path[i];
    const [nr, nc] = path[i + 1];
    if ((cr - pr) !== (nr - cr) || (cc - pc) !== (nc - cc)) {
      pts.push(path[i]);
    }
  }
  pts.push(path[path.length - 1]);
  return pts;
}

// ── SVG 좌표계 상수 ──
const PAD    = 8;
const GAP    = 4;
const CELL_W = 75;
const CELL_H = 100;

export default function Board({ board, selected, pathCells, matchedCells, currentPath, onCellClick }: Props) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;

  // 보드 크기에 맞게 SVG 뷰박스 동적 계산
  const TOTAL_W = PAD * 2 + cols * CELL_W + (cols - 1) * GAP;
  const TOTAL_H = PAD * 2 + rows * CELL_H + (rows - 1) * GAP;

  function cx(c: number) { return PAD + c * (CELL_W + GAP) + CELL_W / 2; }
  function cy(r: number) { return PAD + r * (CELL_H + GAP) + CELL_H / 2; }

  const waypoints = currentPath ? getWaypoints(currentPath) : null;
  const polyPoints = waypoints
    ? waypoints.map(([r, c]) => `${cx(c)},${cy(r)}`).join(' ')
    : '';

  const startPt = waypoints ? waypoints[0] : null;
  const endPt   = waypoints ? waypoints[waypoints.length - 1] : null;

  return (
    <div
      className="board"
      style={{
        '--rows': rows,
        '--cols': cols,
        '--board-w': TOTAL_W,
        '--board-h': TOTAL_H,
      } as React.CSSProperties}
    >
      {/* ── SVG 연결 경로 오버레이 ── */}
      {waypoints && waypoints.length >= 2 && (
        <svg
          className="path-svg"
          viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
          overflow="visible"
        >
          <defs>
            <filter id="wc-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="5"
                floodColor="#ffd166" floodOpacity="0.85" />
            </filter>
            <marker
              id="wc-arrow"
              viewBox="0 0 10 10"
              refX="9" refY="5"
              markerUnits="strokeWidth"
              markerWidth="6" markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0.5 L 9.5 5 L 0 9.5 Z" fill="#ffd166" />
            </marker>
          </defs>

          <polyline
            points={polyPoints}
            fill="none"
            stroke="rgba(255,209,102,0.25)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={polyPoints}
            fill="none"
            stroke="#ffd166"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#wc-arrow)"
            filter="url(#wc-glow)"
          />
          {startPt && (
            <circle
              cx={cx(startPt[1])} cy={cy(startPt[0])}
              r="7" fill="#ffd166"
              stroke="rgba(255,255,255,0.85)" strokeWidth="2.5"
              filter="url(#wc-glow)"
            />
          )}
          {endPt && endPt !== startPt && (
            <circle
              cx={cx(endPt[1])} cy={cy(endPt[0])}
              r="4" fill="rgba(255,209,102,0.5)" stroke="none"
            />
          )}
        </svg>
      )}

      {/* ── 셀 렌더링 ── */}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const key = `${r},${c}`;
          const val = board[r][c];
          const isSelected = selected !== null && selected[0] === r && selected[1] === c;
          const isOnPath   = pathCells.has(key);
          const isMatched  = matchedCells.has(key);
          const isEmpty    = val === null;

          return (
            <div key={key} className={`board-cell${isEmpty ? ' board-cell-empty' : ''}`}>
              {!isEmpty && (
                <Card
                  typeId={val!}
                  isSelected={isSelected}
                  isOnPath={isOnPath}
                  isMatched={isMatched}
                  onClick={() => onCellClick(r, c)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
