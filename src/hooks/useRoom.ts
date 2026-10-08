import { useEffect, useState } from 'react';
import { needsNewHost, pickHost } from '../game/roomLogic';
import type { Room } from '../game/roomLogic';
import { claimHost, subscribeRoom, watchPresence } from '../services/room';

export interface RoomView {
  /** 첫 데이터를 받기 전에는 true */
  loading: boolean;
  /** 방이 없어졌으면 null */
  room: Room | null;
}

// 방을 구독하고, 접속 상태 등록과 방장 승계를 맡는다.
export function useRoom(code: string, playerId: string): RoomView {
  const [view, setView] = useState<RoomView>({ loading: true, room: null });

  useEffect(() => subscribeRoom(code, room => setView({ loading: false, room })), [code]);

  const { room } = view;
  const status = room?.meta.status;

  // 대기실과 플레이 중은 끊겼을 때의 처리가 다르므로 상태가 바뀔 때마다 다시 등록
  useEffect(() => {
    if (!status) return;
    return watchPresence(code, playerId, status);
  }, [code, playerId, status]);

  // 방장이 없거나 끊겼고 내가 다음 차례면 방장을 넘겨받는다
  const hostId = room?.meta.hostId;
  const shouldClaim = room !== null && needsNewHost(room) && pickHost(room.players) === playerId;
  useEffect(() => {
    if (!shouldClaim || hostId === undefined) return;
    void claimHost(code, playerId, hostId).catch(() => {});
  }, [shouldClaim, code, playerId, hostId]);

  return view;
}
