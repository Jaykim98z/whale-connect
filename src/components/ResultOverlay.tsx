import { Clock, Home, RefreshCw, Star, Trophy } from 'lucide-react';
import type { ClearStats } from '../game/gameReducer';
import { MAX_STAGE } from '../game/stages';

interface Props {
  variant: 'gameover' | 'cleared';
  finalScore: number;
  clearStats: ClearStats;
  onRegister: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export default function ResultOverlay({ variant, finalScore, clearStats, onRegister, onRestart, onTitle }: Props) {
  const buttons = (
    <div className="result-btns">
      <button className="btn btn-gold" onClick={onRegister}>
        <Trophy size={14} /> 랭킹 등록
      </button>
      <button className="btn btn-primary" onClick={onRestart}>
        <RefreshCw size={14} /> 다시 시작
      </button>
      <button className="btn btn-ghost" onClick={onTitle}>
        <Home size={14} /> 타이틀로
      </button>
    </div>
  );

  if (variant === 'gameover') {
    return (
      <div className="overlay overlay-timeout">
        <div className="result-card result-card-timeout">
          <div className="result-icon-wrap result-icon-timeout">
            <Clock size={44} strokeWidth={1.5} />
          </div>
          <h2 className="result-title">시간 종료</h2>
          <div className="result-divider" />
          <div className="result-score-block">
            <span className="result-score-label">최종 점수</span>
            <span className="result-score">{finalScore.toLocaleString()}<small>점</small></span>
          </div>
          <div className="result-divider" />
          {buttons}
        </div>
      </div>
    );
  }

  return (
    <div className="overlay overlay-clear">
      <div className="result-card result-card-clear">
        {/* 트로피 아이콘 + 빛살 (같은 래퍼 → 트로피 중심 기준 회전) */}
        <div className="result-icon-area">
          <div className="result-rays" />
          <div className="result-icon-wrap result-icon-clear">
            <Trophy size={44} strokeWidth={1.5} />
          </div>
        </div>

        <h2 className="result-title result-title-clear">CLEAR!</h2>
        <p className="result-sub">
          <Star size={12} fill="currentColor" style={{ verticalAlign: '-2px' }} /> {MAX_STAGE}스테이지 전 클리어 달성! <Star size={12} fill="currentColor" style={{ verticalAlign: '-2px' }} />
        </p>

        <div className="result-divider" />

        <div className="result-breakdown">
          <div className="result-breakdown-row">
            <span>매칭 점수</span>
            <span>{clearStats.matchScore.toLocaleString()}점</span>
          </div>
          <div className="result-breakdown-row result-breakdown-bonus">
            <span>스테이지 클리어 ×{MAX_STAGE}</span>
            <span>+{clearStats.clearBonus.toLocaleString()}점</span>
          </div>
          <div className="result-breakdown-row result-breakdown-bonus">
            <span>잔여 시간 보너스</span>
            <span>+{clearStats.timeBonus.toLocaleString()}점</span>
          </div>
        </div>

        <div className="result-score-block">
          <span className="result-score-label">최종 점수</span>
          <span className="result-score result-score-clear">
            {finalScore.toLocaleString()}<small>점</small>
          </span>
        </div>

        <div className="result-divider" />
        {buttons}
      </div>
    </div>
  );
}
