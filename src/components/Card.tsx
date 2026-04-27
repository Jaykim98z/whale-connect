import { Clock, Shuffle, Lock } from 'lucide-react';
import { CARD_DEFS, ITEM_TIME_ID, OBSTACLE_ID } from '../game/constants';
import './Card.css';

interface Props {
  typeId: number;
  isSelected: boolean;
  isOnPath: boolean;
  isMatched: boolean;
  onClick: () => void;
}

export default function Card({ typeId, isSelected, isOnPath, isMatched, onClick }: Props) {
  // 장애물 카드
  if (typeId === OBSTACLE_ID) {
    return (
      <div className="card card-obstacle">
        <Lock strokeWidth={2} className="card-obstacle-lock" />
      </div>
    );
  }

  const def = CARD_DEFS[typeId];

  return (
    <div
      className={[
        'card',
        isSelected ? 'card-selected' : '',
        isOnPath   ? 'card-on-path'  : '',
        isMatched  ? 'card-matched'  : '',
        def.isItem ? 'card-item'     : '',
      ].join(' ')}
      onClick={onClick}
      style={{ '--card-color': def.color } as React.CSSProperties}
    >
      {def.isItem ? (
        /* 아이템 카드: lucide 아이콘 */
        <div className="card-item-icon">
          {typeId === ITEM_TIME_ID
            ? <Clock  strokeWidth={1.6} className="card-item-svg" />
            : <Shuffle strokeWidth={1.6} className="card-item-svg" />
          }
          <span className="card-item-label">
            {typeId === ITEM_TIME_ID ? '+5s' : 'SHUFFLE'}
          </span>
        </div>
      ) : (
        /* 캐릭터 카드: 이미지 */
        <img
          src={def.image}
          alt={def.name}
          className="card-img"
          draggable={false}
        />
      )}
    </div>
  );
}
