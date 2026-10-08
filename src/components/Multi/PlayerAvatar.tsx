import { useState } from 'react';
import type { RoomPlayer } from '../../game/roomLogic';

const COLORS = ['#4ec5e0', '#ff8c5a', '#9c7be0', '#5cc98a', '#f2b632', '#e87aa4', '#5b8def', '#8a9bb0'];

function colorOf(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

interface Props {
  player: Pick<RoomPlayer, 'id' | 'name' | 'profileImage'>;
  size?: number;
}

// SOOP 프로필 사진이 있으면 사진, 없거나 불러오지 못하면 닉네임 첫 글자
export default function PlayerAvatar({ player, size = 32 }: Props) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.45 };

  if (player.profileImage && !failed) {
    return (
      <img
        className="mp-avatar"
        style={style}
        src={player.profileImage}
        alt=""
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="mp-avatar mp-avatar-initial" style={{ ...style, background: colorOf(player.id) }}>
      {[...player.name][0] ?? '?'}
    </span>
  );
}
