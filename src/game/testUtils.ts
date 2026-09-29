import type { Board } from './boardLogic';
import { ITEM_SHUFFLE_ID, ITEM_TIME_ID, OBSTACLE_ID } from './constants';

// 테스트용 보드 표기: '.'=빈칸, '#'=장애물, '0'-'9'=캐릭터 id, 'T'=시간 아이템, 'S'=셔플 아이템
export function parseBoard(rows: string[]): Board {
  return rows.map(row => [...row].map(ch => {
    if (ch === '.') return null;
    if (ch === '#') return OBSTACLE_ID;
    if (ch === 'T') return ITEM_TIME_ID;
    if (ch === 'S') return ITEM_SHUFFLE_ID;
    const n = Number(ch);
    if (Number.isNaN(n)) throw new Error(`알 수 없는 보드 문자: ${ch}`);
    return n;
  }));
}

/** 경로의 꺾임 횟수 */
export function countTurns(path: [number, number][]): number {
  let turns = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const [pr, pc] = path[i - 1];
    const [cr, cc] = path[i];
    const [nr, nc] = path[i + 1];
    if (cr - pr !== nr - cr || cc - pc !== nc - cc) turns++;
  }
  return turns;
}
