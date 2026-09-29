import { CARD_DEFS, ITEM_SHUFFLE_ID, ITEM_TIME_ID } from './constants';
import type { Rng } from './rng';

export const MAX_STAGE = 7;
export const BOARD_ROWS = 8;

// ── 스테이지별 보드 설정 (7스테이지) ──
// 멤버 15명 전원 항상 등장 + 팬캐릭 랜덤 선발 + 아이템 2종
// 가로:  S1=10 S2=12 S3=12 S4=14 S5=14 S6=16 S7=16 (세로 8 고정)
// 장애물: 0 / 2 / 4 / 8 / 10 / 14 / 16
// 팬캐릭: 1 / 1 / 2 / 3 / 4 / 5 / 6
// 아이템쌍(종류당): 1 / 1 / 1 / 2 / 2 / 3 / 3  (후반 여유 ↑)
//
// ※ 프하 제외로 멤버가 16→15명이 되면서, 빈 자리를 팬캐릭 랜덤 1종으로 대체(전 스테이지 +1).
//   총 캐릭터 종류 = 멤버15 + 팬캐릭 = 16/16/17/18/19/20/21 → 프하 제외 전과 완전히 동일.
//   보드는 종류 개수만 따지므로 난이도(점수 획득 곡선)가 기존과 완전히 동일하게 유지됨.
const STAGE_DATA = [
  { cols: 10, obstacleCount:  0, fanchars: 1, itemPairs: 1 },
  { cols: 12, obstacleCount:  2, fanchars: 1, itemPairs: 1 },
  { cols: 12, obstacleCount:  4, fanchars: 2, itemPairs: 1 },
  { cols: 14, obstacleCount:  8, fanchars: 3, itemPairs: 2 },
  { cols: 14, obstacleCount: 10, fanchars: 4, itemPairs: 2 },
  { cols: 16, obstacleCount: 14, fanchars: 5, itemPairs: 3 },
  { cols: 16, obstacleCount: 16, fanchars: 6, itemPairs: 3 },
] as const;

export interface StageConfig {
  rows: number;
  cols: number;
  obstacleCount: number;
  counts: number[]; // 카드 id별 장 수 (짝수)
}

function stageData(stage: number) {
  return STAGE_DATA[Math.min(Math.max(stage, 1), MAX_STAGE) - 1];
}

// 스테이지별 팬캐릭 랜덤 선발 (등장 종류 수는 STAGE_DATA.fanchars)
export function pickFanchars(stage: number, rng: Rng): number[] {
  const count = stageData(stage).fanchars;
  const arr = CARD_DEFS.filter(d => d.isFanchar).map(d => d.id);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// charCards = totalCells - 아이템카드, base = floor(charCards/charCount) (짝수로 내림)
// 나머지는 앞 charId부터 +2 페어로 분배 → 멤버 확장 시에도 공식만으로 자동 재분배
export function getBoardConfig(stage: number, fancharIds: number[]): StageConfig {
  const { cols, obstacleCount, itemPairs } = stageData(stage);
  const totalCells    = BOARD_ROWS * cols - obstacleCount;
  const memberIds     = CARD_DEFS.filter(d => !d.isItem && !d.isFanchar).map(d => d.id);
  const charIds       = [...memberIds, ...fancharIds];
  const itemCardsEach = itemPairs * 2;
  const charCards     = totalCells - 2 * itemCardsEach;
  let base = Math.floor(charCards / charIds.length);
  if (base % 2 !== 0) base -= 1;
  const extraPairs = (charCards - base * charIds.length) / 2;
  const counts     = new Array<number>(CARD_DEFS.length).fill(0);
  charIds.forEach((id, i) => { counts[id] = base + (i < extraPairs ? 2 : 0); });
  counts[ITEM_TIME_ID]    = itemCardsEach;
  counts[ITEM_SHUFFLE_ID] = itemCardsEach;
  return { rows: BOARD_ROWS, cols, obstacleCount, counts };
}
