import { useCallback, useMemo, useReducer, useState } from 'react';
import { createInitialState, gameReducer, selectBoardView } from '../game/gameReducer';
import { MAX_STAGE } from '../game/stages';
import { useGameEvents } from '../hooks/useGameEvents';
import { useGameScheduler } from '../hooks/useGameScheduler';
import Board from './Board';
import BoardSizePanel from './BoardSizePanel';
import CountdownOverlay from './CountdownOverlay';
import Hud from './Hud';
import PauseOverlay from './PauseOverlay';
import RankingModal from './Ranking/RankingModal';
import RankingRegisterModal from './Ranking/RankingRegisterModal';
import ResultOverlay from './ResultOverlay';
import StartScreen from './StartScreen';
import './Game.css';

const randomSeed = () => Math.floor(Math.random() * 0x100000000);

const BOARD_SCALE_KEY = 'wc-board-scale';
const BOARD_SCALE_MIN = 0.6;
const BOARD_SCALE_MAX = 1.6;

function loadBoardScale(): number {
  try {
    const saved = Number(localStorage.getItem(BOARD_SCALE_KEY) ?? 1);
    return Number.isFinite(saved) ? Math.min(BOARD_SCALE_MAX, Math.max(BOARD_SCALE_MIN, saved)) : 1;
  } catch {
    return 1;
  }
}

interface Props {
  /** 타이틀의 멀티플레이 버튼 — 멀티를 쓸 수 없는 환경이면 undefined */
  onMulti?: () => void;
}

export default function Game({ onMulti }: Props) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [showRanking, setShowRanking] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const [boardScale, setBoardScale] = useState(loadBoardScale);

  useGameScheduler(state, dispatch);
  const itemMsg = useGameEvents(state);
  const { pathCells, matchedCells, currentPath } = useMemo(
    () => selectBoardView(state.pendingMatches),
    [state.pendingMatches],
  );

  const startGame = useCallback(() => {
    setShowHomeConfirm(false);
    dispatch({ type: 'START', seed: randomSeed() });
  }, []);

  const goTitle = useCallback(() => {
    setShowHomeConfirm(false);
    dispatch({ type: 'GO_TITLE' });
  }, []);

  const handleCellClick = useCallback((r: number, c: number) => dispatch({ type: 'CLICK', r, c }), []);

  // HUD 홈 버튼 — 실수 클릭 방지: 일시정지 + 확인 다이얼로그
  const handleHomeClick = () => {
    dispatch({ type: 'PAUSE' });
    setShowHomeConfirm(true);
  };

  const handleCancelHome = () => {
    setShowHomeConfirm(false);
    dispatch({ type: 'RESUME' });
  };

  // 보드 크기 조절 (60~160%, localStorage 저장)
  const handleScaleChange = (delta: number) => {
    setBoardScale(prev => {
      const next = Math.round(Math.max(BOARD_SCALE_MIN, Math.min(BOARD_SCALE_MAX, prev + delta)) * 10) / 10;
      try { localStorage.setItem(BOARD_SCALE_KEY, String(next)); } catch { /* 저장 불가 환경 무시 */ }
      return next;
    });
  };

  const { phase, isPaused } = state;

  if (phase === 'title') {
    return <StartScreen onStart={startGame} onMulti={onMulti} />;
  }

  return (
    <div className="game-wrap">
      {state.countdown !== null && <CountdownOverlay countdown={state.countdown} />}

      {(phase === 'gameover' || phase === 'cleared') && (
        <ResultOverlay
          variant={phase}
          finalScore={state.finalScore}
          clearStats={state.clearStats}
          onRegister={() => setShowRegister(true)}
          onRestart={startGame}
          onTitle={goTitle}
        />
      )}

      {phase === 'playing' && (
        <BoardSizePanel
          scale={boardScale}
          onIncrease={() => handleScaleChange(0.1)}
          onDecrease={() => handleScaleChange(-0.1)}
          disabled={isPaused || state.countdown !== null}
        />
      )}

      {phase === 'playing' && (
        <div className={`game-content ${isPaused ? 'game-content-paused' : ''}`}>
          <Hud
            stage={state.stage}
            score={state.score}
            combo={state.combo}
            possiblePairs={state.possiblePairs}
            timeLeftMs={state.timeLeftMs}
            isPaused={isPaused}
            shuffleCharge={state.shuffleCharge}
            onHome={handleHomeClick}
            onTogglePause={() => dispatch({ type: isPaused ? 'RESUME' : 'PAUSE' })}
            onShuffle={() => dispatch({ type: 'MANUAL_SHUFFLE' })}
            onShowRanking={() => setShowRanking(true)}
            onRestart={startGame}
          />
          <div className="board-wrap">
            <div style={{ transform: `scale(${boardScale})`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }}>
              <Board
                board={state.board}
                selected={state.selected}
                pathCells={pathCells}
                matchedCells={matchedCells}
                currentPath={currentPath}
                onCellClick={handleCellClick}
              />
            </div>
          </div>
        </div>
      )}

      {isPaused && phase === 'playing' && (
        <PauseOverlay
          showHomeConfirm={showHomeConfirm}
          timeLeftMs={state.timeLeftMs}
          score={state.score}
          onResume={() => dispatch({ type: 'RESUME' })}
          onHome={goTitle}
          onCancelHome={handleCancelHome}
        />
      )}

      {itemMsg && <div className="item-msg">{itemMsg}</div>}

      {showRanking && (
        <RankingModal onClose={() => setShowRanking(false)} highlightSoopId={highlightId} />
      )}
      {showRegister && (
        <RankingRegisterModal
          score={state.finalScore}
          stageReached={Math.min(state.stage, MAX_STAGE)}
          cleared={phase === 'cleared'}
          onClose={() => setShowRegister(false)}
          onSuccess={(_rank, soopId) => {
            setHighlightId(soopId);
            setShowRegister(false);
            setShowRanking(true);
          }}
        />
      )}
    </div>
  );
}
