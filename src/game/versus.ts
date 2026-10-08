import type { Board } from './boardLogic';
import { CARD_DEFS, ITEM_SHUFFLE_ID, OBSTACLE_ID } from './constants';

// ── 멀티 대전 규칙 ──
// 큰 단판 보드 · 고정 시간 · 콤보 없음 · 시간추가 아이템 없음
export const VERSUS_ROWS = 10;
export const VERSUS_COLS = 18;
export const VERSUS_OBSTACLES = 12;
export const VERSUS_FANCHARS = 6;
export const VERSUS_SHUFFLE_PAIRS = 3;
export const VERSUS_TIME_LIMIT = 120;   // 초
export const VERSUS_BREAK_CHARGES = 2;  // 시작 시 지급하는 장애물 부수기 횟수
export const VERSUS_TOTAL_CARDS = VERSUS_ROWS * VERSUS_COLS - VERSUS_OBSTACLES;

// 카드 id별 장 수 (모두 짝수) — stages.ts의 getBoardConfig와 같은 분배 방식
export function getVersusCounts(fancharIds: number[]): number[] {
  const charIds = CARD_DEFS.filter(d => !d.isItem && !d.isFanchar).map(d => d.id).concat(fancharIds);
  const shuffleCards = VERSUS_SHUFFLE_PAIRS * 2;
  const charCards = VERSUS_TOTAL_CARDS - shuffleCards;
  let base = Math.floor(charCards / charIds.length);
  if (base % 2 !== 0) base -= 1;
  const extraPairs = (charCards - base * charIds.length) / 2;
  const counts = new Array<number>(CARD_DEFS.length).fill(0);
  charIds.forEach((id, i) => { counts[id] = base + (i < extraPairs ? 2 : 0); });
  counts[ITEM_SHUFFLE_ID] = shuffleCards;
  return counts;
}

/** 진행률(%) — 처음 카드 수 대비 지운 카드 비율. 부순 장애물은 빈 칸이 되므로 처음 카드 수는 상수로 계산한다. */
export function versusProgress(board: Board): number {
  if (board.length === 0) return 0;
  const remaining = board.flat().filter(v => v !== null && v !== OBSTACLE_ID).length;
  return Math.floor(((VERSUS_TOTAL_CARDS - remaining) / VERSUS_TOTAL_CARDS) * 100);
}
