import { useEffect, useState } from 'react';
import { useRoom } from '../../hooks/useRoom';
import { leaveRoom, returnToLobby, startRound } from '../../services/room';
import Lobby from './Lobby';
import MultiEntry from './MultiEntry';
import type { RoomSession } from './MultiEntry';
import VersusGame from './VersusGame';
import './Multi.css';

interface Props {
  /** 초대 링크(?room=CODE)로 들어온 경우의 방 코드 */
  initialCode: string | null;
  onExit: () => void;
}

// 초대 링크의 ?room= 은 읽은 뒤 주소창에서 지운다 — 방송 화면의 주소창에 방 코드가 남지 않게
function clearRoomParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('room')) return;
  url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

// 멀티플레이 화면 전환: 입장 → 대기실 → 대전 → (한 판 더) 대기실
export default function Multi({ initialCode, onExit }: Props) {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(clearRoomParam, []);

  const handleLeft = (message: string | null) => {
    setSession(null);
    setNotice(message);
  };

  if (!session) {
    return (
      <MultiEntry
        initialCode={initialCode}
        notice={notice}
        onJoined={joined => {
          setNotice(null);
          setSession(joined);
        }}
        onBack={onExit}
      />
    );
  }
  return <RoomScreen key={`${session.code}/${session.playerId}`} session={session} onLeft={handleLeft} />;
}

function RoomScreen({ session, onLeft }: { session: RoomSession; onLeft: (message: string | null) => void }) {
  const { code, playerId } = session;
  const { loading, room } = useRoom(code, playerId);
  const me = room?.players.find(p => p.id === playerId);

  // 방이 사라졌거나(전원 퇴장) 접속이 끊겨 내 항목이 지워진 경우
  const lost = !loading && (!room || !me);
  useEffect(() => {
    if (lost) onLeft('방과의 연결이 끊어졌습니다. 다시 입장해 주세요.');
  }, [lost, onLeft]);

  if (!room || !me) {
    return <div className="mp-loading">방에 연결하는 중</div>;
  }

  const leave = () => {
    void leaveRoom(code, playerId).catch(() => {});
    onLeft(null);
  };

  if (room.meta.status === 'lobby') {
    return <Lobby room={room} me={me} onStart={() => void startRound(room).catch(() => {})} onLeave={leave} />;
  }
  return (
    <VersusGame
      key={room.meta.round}
      room={room}
      me={me}
      onReturnToLobby={() => void returnToLobby(room).catch(() => {})}
      onLeave={leave}
    />
  );
}
