import { rankPlayers } from '../../game/roomLogic';
import type { RoomPlayer } from '../../game/roomLogic';
import PlayerAvatar from './PlayerAvatar';

const ROW_HEIGHT = 56;

interface Props {
  players: RoomPlayer[];
  meId: string;
  title: string;
  /** 진행 중에는 끝낸 사람에게 '완료' 표시를 붙인다 */
  showFinished?: boolean;
}

// 실시간 순위표. 행의 DOM 순서는 고정하고 세로 위치만 순위에 맞춰 옮겨, 순위가 바뀌면 행이 미끄러지듯 이동한다.
export default function Leaderboard({ players, meId, title, showFinished = false }: Props) {
  const rankOf = new Map(rankPlayers(players).map((p, i) => [p.id, i]));
  const stable = [...players].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="lb">
      <div className="lb-title">{title}</div>
      <div className="lb-rows" style={{ height: players.length * ROW_HEIGHT }}>
        {stable.map(p => {
          const rank = rankOf.get(p.id) ?? 0;
          return (
            <div
              key={p.id}
              className={[
                'lb-row',
                p.id === meId ? 'lb-row-me' : '',
                p.connected ? '' : 'lb-row-off',
              ].join(' ')}
              style={{ transform: `translateY(${rank * ROW_HEIGHT}px)`, order: rank }}
            >
              <span className={`lb-rank lb-rank-${rank + 1}`}>{rank + 1}</span>
              <PlayerAvatar player={p} size={30} />
              <div className="lb-main">
                <div className="lb-name">
                  <span className="lb-name-text">{p.name}</span>
                  {!p.connected && <span className="lb-tag lb-tag-off">끊김</span>}
                  {p.connected && showFinished && p.finished && <span className="lb-tag">완료</span>}
                </div>
                <div className="lb-bar">
                  <div className="lb-bar-fill" style={{ width: `${p.progress}%` }} />
                </div>
              </div>
              <div className="lb-score">
                {p.score.toLocaleString()}
                <span className="lb-progress">{p.progress}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
