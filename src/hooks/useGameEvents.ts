import { useEffect, useRef, useState } from 'react';
import { BOARD_CLEAR_BONUS, stageTimeBonus, TIME_ADD_SECONDS } from '../game/constants';
import type { GameEventType, GameState } from '../game/gameReducer';
import {
  pauseBGM, playBGM, playCardSelect, playGameOver, playMatchFail, playMatchSuccess, stopBGM,
} from '../game/sounds';

const ITEM_MSG_MS = 1800;

const SOUNDS: Partial<Record<GameEventType, () => void>> = {
  select: playCardSelect,
  matchSuccess: playMatchSuccess,
  matchFail: playMatchFail,
};

const MESSAGES: Partial<Record<GameEventType, string>> = {
  itemTime: `+${TIME_ADD_SECONDS}초 추가!`,
  shuffleCharged: '셔플 충전!',
  shuffleUsed: '셔플 발동!',
  autoShuffle: '이동 불가 — 자동 셔플',
};

// 판 클리어 메시지 — 마지막 스테이지는 엔딩 화면으로 넘어가므로 표시하지 않음
function eventMessage(type: GameEventType, stage: number, clearing: boolean): string | undefined {
  if (type === 'stageClear') {
    return clearing ? undefined : `판 클리어! +${BOARD_CLEAR_BONUS}점 · +${stageTimeBonus(stage)}초`;
  }
  return MESSAGES[type];
}

// reducer가 쌓은 이벤트를 사운드·아이템 메시지로 바꾼다. 반환값은 현재 표시할 메시지.
export function useGameEvents(state: GameState): string | null {
  const { events, phase, isPaused, stage, clearing } = state;
  const [itemMsg, setItemMsg] = useState<string | null>(null);
  const lastEventIdRef = useRef(0);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const ev of events) {
      if (ev.id <= lastEventIdRef.current) continue;
      lastEventIdRef.current = ev.id;
      SOUNDS[ev.type]?.();
      const msg = eventMessage(ev.type, stage, clearing);
      if (msg) {
        if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
        setItemMsg(msg);
        msgTimerRef.current = setTimeout(() => setItemMsg(null), ITEM_MSG_MS);
      }
    }
  }, [events, stage, clearing]);

  useEffect(() => () => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
  }, []);

  // BGM: 플레이 중 재생, 일시정지 시 멈춤, 그 외 정지
  useEffect(() => {
    if (phase === 'playing' && !isPaused) playBGM();
    else if (phase === 'playing' && isPaused) pauseBGM();
    else stopBGM();
  }, [phase, isPaused]);

  useEffect(() => {
    if (phase === 'gameover') playGameOver();
  }, [phase]);

  // 타이틀로 나가면 남은 메시지 제거
  useEffect(() => {
    if (phase === 'title') setItemMsg(null);
  }, [phase]);

  return itemMsg;
}
