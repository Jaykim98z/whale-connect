import { useState } from 'react';
import Game from './components/Game';
import Multi from './components/Multi/Multi';
import { normalizeRoomCode } from './game/roomLogic';
import { isMultiplayerAvailable } from './services/room';

// 초대 링크(?room=CODE)로 들어오면 바로 멀티플레이 입장 화면을 연다
function invitedRoomCode(): string | null {
  if (!isMultiplayerAvailable) return null;
  return normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
}

export default function App() {
  const [inviteCode] = useState(invitedRoomCode);
  const [multi, setMulti] = useState(inviteCode !== null);

  if (multi) return <Multi initialCode={inviteCode} onExit={() => setMulti(false)} />;
  return <Game onMulti={isMultiplayerAvailable ? () => setMulti(true) : undefined} />;
}
