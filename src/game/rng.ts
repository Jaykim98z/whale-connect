// 시드 기반 난수 생성기 (mulberry32)
// 같은 시드 → 같은 수열. reducer가 난수를 쓰면서도 순수 함수로 남도록 시드를 상태에 저장한다.
export type Rng = () => number;

export interface SeededRng {
  next: Rng;
  /** 지금까지 뽑은 뒤의 내부 상태 — 다음 호출의 시드로 사용 */
  seed: () => number;
}

export function createRng(seed: number): SeededRng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seed: () => s,
  };
}
