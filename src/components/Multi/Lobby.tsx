import { useState } from 'react';
import { Check, Crown, Eye, EyeOff, Link2, LogOut, Play } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '../../game/roomLogic';
import type { Room, RoomPlayer } from '../../game/roomLogic';
import { VERSUS_BREAK_CHARGES, VERSUS_COLS, VERSUS_ROWS, VERSUS_TIME_LIMIT } from '../../game/versus';
import Footer from '../Footer/Footer';
import PlayerAvatar from './PlayerAvatar';
import '../StartScreen.css';

interface Props {
  room: Room;
  me: RoomPlayer;
  onStart: () => void;
  onLeave: () => void;
}

export default function Lobby({ room, me, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  // 방송 화면에 노출되지 않게 방 코드는 가린 채로 시작한다
  const [hideCode, setHideCode] = useState(true);
  const isHost = room.meta.hostId === me.id;
  const players = [...room.players].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  const canStart = players.length >= MIN_PLAYERS_TO_START;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?room=${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* 클립보드 권한이 없으면 코드를 직접 알려주면 된다 */ }
  };

  return (
    <div className="ss-screen">
      <div className="ss-content">
        <div className="ss-card mp-card">
          <div className="ss-top-bar" />

          <p className="mp-code-label">방 코드</p>
          <p className={`mp-code ${hideCode ? 'mp-code-hidden' : ''}`}>
            {hideCode ? '•'.repeat(room.code.length) : room.code}
          </p>
          <div className="mp-code-actions">
            <button className="mp-copy" type="button" onClick={copyLink}>
              {copied ? <><Check size={14} /> 복사됨</> : <><Link2 size={14} /> 초대 링크 복사</>}
            </button>
            <button className="mp-copy" type="button" onClick={() => setHideCode(!hideCode)}>
              {hideCode ? <><Eye size={14} /> 코드 보기</> : <><EyeOff size={14} /> 코드 가리기</>}
            </button>
          </div>

          <div className="mp-players-head">
            참가자 <strong>{players.length}</strong> / {MAX_PLAYERS}
          </div>
          <ul className="mp-players">
            {players.map(p => (
              <li key={p.id} className={`mp-player ${p.id === me.id ? 'mp-player-me' : ''}`}>
                <PlayerAvatar player={p} size={34} />
                <span className="mp-player-name">{p.name}</span>
                {p.id === room.meta.hostId && <span className="mp-badge mp-badge-host"><Crown size={11} /> 방장</span>}
                {p.id === me.id && <span className="mp-badge">나</span>}
              </li>
            ))}
          </ul>

          <p className="mp-rules">
            {VERSUS_ROWS}×{VERSUS_COLS} 보드 · {VERSUS_TIME_LIMIT}초 · 쌍당 10점 · 콤보 없음 · 장애물 부수기 {VERSUS_BREAK_CHARGES}회
          </p>

          {isHost ? (
            <>
              <button className="ss-btn-start" type="button" onClick={onStart} disabled={!canStart}>
                <Play size={18} fill="white" /> 게임 시작
              </button>
              {!canStart && <p className="mp-hint">{MIN_PLAYERS_TO_START}명 이상 모이면 시작할 수 있습니다.</p>}
            </>
          ) : (
            <p className="mp-waiting">방장이 게임을 시작하기를 기다리는 중</p>
          )}

          <button className="ss-btn-ranking" type="button" onClick={onLeave}>
            <LogOut size={15} /> 방 나가기
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
