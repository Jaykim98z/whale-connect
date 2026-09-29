import { Home, Pause, Play } from 'lucide-react';
import { formatTime } from '../game/format';

interface Props {
  showHomeConfirm: boolean;
  timeLeftMs: number;
  score: number;
  onResume: () => void;
  onHome: () => void;
  onCancelHome: () => void;
}

export default function PauseOverlay({ showHomeConfirm, timeLeftMs, score, onResume, onHome, onCancelHome }: Props) {
  return (
    <div className="pause-overlay">
      <div className="pause-card">
        {showHomeConfirm ? (
          /* ── 홈 확인 다이얼로그 ── */
          <>
            <div className="pause-icon pause-icon-warn">
              <Home size={40} strokeWidth={1.4} />
            </div>
            <h2 className="pause-title" style={{ fontSize: '20px' }}>게임을 종료할까요?</h2>
            <p className="pause-confirm-desc">진행 중인 게임이 사라집니다</p>
            <button className="btn btn-danger" onClick={onHome}>
              <Home size={15} /> 나가기
            </button>
            <button className="btn btn-primary" onClick={onCancelHome}>
              <Play size={15} /> 계속하기
            </button>
          </>
        ) : (
          /* ── 일반 일시정지 ── */
          <>
            <div className="pause-icon"><Pause size={44} strokeWidth={1.4} /></div>
            <h2 className="pause-title">일시정지</h2>
            <div className="pause-info">
              <span>{formatTime(timeLeftMs)}</span>
              <span>·</span>
              <span>{score.toLocaleString()}점</span>
            </div>
            <button className="btn btn-primary" onClick={onResume}>
              <Play size={15} /> 계속하기
            </button>
            <button className="btn btn-secondary" onClick={onHome}>
              <Home size={15} /> 타이틀로
            </button>
          </>
        )}
      </div>
    </div>
  );
}
