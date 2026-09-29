import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import { isBoardClear } from '../game/boardLogic';
import { COMBO_WINDOW_MS } from '../game/constants';
import { isRunning } from '../game/gameReducer';
import type { GameAction, GameState } from '../game/gameReducer';

const TICK_INTERVAL_MS = 250;
const PATH_SHOW_MS = 200;
const MATCH_ANIM_MS = 220;
const COUNTDOWN_STEP_MS = 1000;
const AUTO_SHUFFLE_DELAY_MS = 1200;
const FINISH_CLEAR_DELAY_MS = 420;

// 시간 흐름을 reducer 액션으로 바꾼다. 모든 액션에 gameId를 실어 이전 판의 타이머는 reducer가 무시한다.
export function useGameScheduler(state: GameState, dispatch: Dispatch<GameAction>) {
  const {
    gameId, phase, isPaused, countdown, clearing, pendingMatches, possiblePairs, boardVersion, board, combo, lastMatchAt,
  } = state;
  const running = isRunning(state);

  // 제한 시간: 실제 경과 시간(ms)만큼 차감. 멈출 때 잔여분을 flush해 일시정지 연타로 시간이 새지 않게 한다.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'TICK', gameId, deltaMs: now - last });
      last = now;
    }, TICK_INTERVAL_MS);
    return () => {
      clearInterval(id);
      dispatch({ type: 'TICK', gameId, deltaMs: performance.now() - last, flush: true });
    };
  }, [running, gameId, dispatch]);

  // 매칭 애니메이션: 경로 표시 → 사라짐 → 보드에서 제거
  const matchTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = matchTimersRef.current;
    for (const m of pendingMatches) {
      if (timers.has(m.id)) continue;
      timers.set(m.id, setTimeout(() => {
        dispatch({ type: 'MATCH_REVEAL', gameId, matchId: m.id });
        timers.set(m.id, setTimeout(() => {
          timers.delete(m.id);
          dispatch({ type: 'MATCH_RESOLVE', gameId, matchId: m.id, at: Date.now() });
        }, MATCH_ANIM_MS));
      }, PATH_SHOW_MS));
    }
  }, [pendingMatches, gameId, dispatch]);
  useEffect(() => {
    const timers = matchTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // 스테이지 전환 카운트다운 (일시정지 중에는 멈춤)
  useEffect(() => {
    if (phase !== 'playing' || countdown === null || isPaused) return;
    const t = setTimeout(() => dispatch({ type: 'COUNTDOWN_TICK', gameId }), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, countdown, isPaused, gameId, dispatch]);

  // 이동 가능한 쌍이 없으면 자동 셔플
  const needsShuffle = running && possiblePairs === 0 && pendingMatches.length === 0 && !isBoardClear(board);
  useEffect(() => {
    if (!needsShuffle) return;
    const t = setTimeout(() => dispatch({ type: 'AUTO_SHUFFLE', gameId, boardVersion }), AUTO_SHUFFLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [needsShuffle, gameId, boardVersion, dispatch]);

  // 콤보 표시 만료 — 마지막 매칭 후 COMBO_WINDOW_MS 동안 매칭이 없으면 0으로
  useEffect(() => {
    if (combo === 0 || lastMatchAt === null) return;
    const wait = Math.max(0, lastMatchAt + COMBO_WINDOW_MS - Date.now());
    const t = setTimeout(() => dispatch({ type: 'COMBO_EXPIRE', gameId, at: Date.now() }), wait);
    return () => clearTimeout(t);
  }, [combo, lastMatchAt, gameId, dispatch]);

  // 마지막 스테이지 클리어 → 잠시 후 엔딩 화면
  useEffect(() => {
    if (!clearing) return;
    const t = setTimeout(() => dispatch({ type: 'FINISH_CLEAR', gameId }), FINISH_CLEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [clearing, gameId, dispatch]);
}
