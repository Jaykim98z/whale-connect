import { useState } from 'react';
import { Flame, Hammer, Home, Pause, Play, RefreshCw, Shuffle, Trophy, Volume2, VolumeX } from 'lucide-react';
import { TIME_LIMIT } from '../game/constants';
import { formatTime, toSeconds } from '../game/format';
import { getBGMVolume, getMuted, setBGMVolume, setMuted } from '../game/sounds';

// 대전 모드 전용 표시 — 넘기면 스테이지·일시정지·랭킹·새 게임 버튼 대신 진행률·장애물 부수기를 보여준다
export interface VersusHud {
  timeLimit: number;   // 타이머 막대 기준(초)
  progress: number;    // 지운 카드 비율(%)
  breakCharge: number; // 장애물 부수기 남은 횟수
}

interface Props {
  stage: number;
  score: number;
  combo: number;
  possiblePairs: number;
  timeLeftMs: number;
  isPaused: boolean;
  shuffleCharge: number;
  versus?: VersusHud;
  onHome: () => void;
  onTogglePause: () => void;
  onShuffle: () => void;
  onShowRanking: () => void;
  onRestart: () => void;
}

export default function Hud({
  stage, score, combo, possiblePairs, timeLeftMs, isPaused, shuffleCharge, versus,
  onHome, onTogglePause, onShuffle, onShowRanking, onRestart,
}: Props) {
  const [isMuted, setIsMuted] = useState(() => getMuted());
  const [bgmVolume, setBgmVolume] = useState(() => getBGMVolume());

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    setMuted(next);
  };

  // 볼륨 0 ↔ 음소거 연동
  const handleVolumeChange = (val: number) => {
    setBgmVolume(val);
    setBGMVolume(val);
    if (val === 0 && !isMuted) { setIsMuted(true); setMuted(true); }
    else if (val > 0 && isMuted) { setIsMuted(false); setMuted(false); }
  };

  const timeRatio = Math.min(toSeconds(timeLeftMs) / (versus?.timeLimit ?? TIME_LIMIT), 1);
  const timerColor = timeRatio > 0.4 ? '#4ecdc4' : timeRatio > 0.2 ? '#ffd166' : '#ef4444';
  const canShuffle = shuffleCharge >= 1;

  return (
    <div className="hud">
      {versus ? (
        <div className="hud-stage">
          <span className="hud-stage-label">진행</span>
          <span className="hud-stage-num">{versus.progress}<small className="hud-stage-unit">%</small></span>
        </div>
      ) : (
        <div className="hud-stage">
          <span className="hud-stage-label">STAGE</span>
          <span className="hud-stage-num">{stage}</span>
        </div>
      )}
      <div className="hud-left">
        <div className="hud-score">
          {score.toLocaleString()}점
          {combo > 0 && <span className="hud-combo" key={combo}><Flame size={11} strokeWidth={2.5} />{combo} COMBO</span>}
        </div>
        <div className="hud-pairs">
          <span className="hud-pairs-dot" style={{ background: possiblePairs === 0 ? '#ef4444' : possiblePairs <= 3 ? '#ffd166' : '#4ecdc4' }} />
          {possiblePairs}쌍
        </div>
      </div>
      <div className="hud-center">
        <div className="timer-text" style={{ color: timerColor }}>
          <span className={`timer-digits ${timeRatio <= 0.2 ? 'timer-digits-urgent' : ''}`}>{formatTime(timeLeftMs)}</span>
        </div>
        <div className="timer-bar-wrap">
          <div className="timer-bar" style={{ width: `${timeRatio * 100}%`, background: timerColor }} />
          <div className="timer-bar-shine" />
        </div>
      </div>
      <div className="hud-right">
        <button className="hud-btn" title={versus ? '방 나가기' : '홈'} onClick={onHome}>
          <Home size={16} />
        </button>
        {!versus && (
          <button className="hud-btn" title={isPaused ? '계속하기' : '일시정지'} onClick={onTogglePause}>
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
          </button>
        )}
        <button
          className={`hud-btn hud-btn-shuffle ${canShuffle ? 'hud-btn-charged' : ''}`}
          title={`셔플 (${shuffleCharge}회 보유)`}
          onClick={onShuffle}
          disabled={!canShuffle}
        >
          <Shuffle size={16} />
          {shuffleCharge > 0 && (
            <span className="hud-btn-badge hud-btn-badge-ready">{shuffleCharge}</span>
          )}
        </button>
        {versus && (
          <div
            className={`hud-btn hud-btn-shuffle hud-break ${versus.breakCharge > 0 ? 'hud-btn-charged' : 'hud-break-empty'}`}
            title={`장애물 부수기 (${versus.breakCharge}회 보유) — 장애물을 클릭하면 사용`}
          >
            <Hammer size={16} />
            {versus.breakCharge > 0 && (
              <span className="hud-btn-badge hud-btn-badge-ready">{versus.breakCharge}</span>
            )}
          </div>
        )}
        <div className="hud-volume-wrap">
          <button
            className={`hud-btn ${isMuted ? 'hud-btn-muted' : ''}`}
            title={isMuted ? '소리 켜기' : '소리 끄기'}
            onClick={handleToggleMute}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="hud-volume-popup">
            <input
              type="range"
              className="hud-volume-slider"
              min={0} max={1} step={0.05}
              value={bgmVolume}
              onChange={e => handleVolumeChange(Number(e.target.value))}
            />
          </div>
        </div>
        {!versus && (
          <>
            <button className="hud-btn" title="랭킹" onClick={onShowRanking}>
              <Trophy size={16} />
            </button>
            <button className="hud-btn" title="새 게임" onClick={onRestart}>
              <RefreshCw size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
