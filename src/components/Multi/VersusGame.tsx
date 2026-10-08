import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { createInitialState, gameReducer, selectBoardView } from '../../game/gameReducer';
import { isRoundOver, rankPlayers } from '../../game/roomLogic';
import type { Room, RoomPlayer } from '../../game/roomLogic';
import { stopBGM } from '../../game/sounds';
import { VERSUS_TIME_LIMIT, versusProgress } from '../../game/versus';
import { useGameEvents } from '../../hooks/useGameEvents';
import { useGameScheduler } from '../../hooks/useGameScheduler';
import { reportScore, serverNow } from '../../services/room';
import Board from '../Board';
import CountdownOverlay from '../CountdownOverlay';
import Hud from '../Hud';
import Leaderboard from './Leaderboard';
import '../Game.css';

const CLOCK_INTERVAL_MS = 200;
const COUNTDOWN_FROM = 3;
const noop = () => {};

interface Props {
  room: Room;
  me: RoomPlayer;
  onReturnToLobby: () => void;
  onLeave: () => void;
}

// 대전 한 판. 게임 규칙은 싱글과 같은 reducer가 처리하고, 여기서는 시작 시각 맞추기와 점수 보고만 한다.
export default function VersusGame({ room, me, onReturnToLobby, onLeave }: Props) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [now, setNow] = useState(serverNow);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useGameScheduler(state, dispatch);
  const itemMsg = useGameEvents(state);
  const { pathCells, matchedCells, currentPath } = useMemo(
    () => selectBoardView(state.pendingMatches),
    [state.pendingMatches],
  );

  const { code } = room;
  const { seed, startAt } = room.meta;
  const started = state.phase !== 'title';
  const finished = state.phase === 'gameover' || state.phase === 'cleared';

  // 플레이 도중 나가도 BGM이 남지 않게
  useEffect(() => () => stopBGM(), []);

  // 카운트다운과 판 종료 판정에 쓰는 시계
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), CLOCK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // 방의 시작 시각에 출발. 제한 시간은 종료 시각에서 거꾸로 계산해 전원이 같은 시각에 끝나게 한다
  useEffect(() => {
    if (started) return;
    const timer = setTimeout(() => {
      const timeLimitMs = Math.max(1000, startAt + VERSUS_TIME_LIMIT * 1000 - serverNow());
      dispatch({ type: 'START', seed, versus: true, timeLimitMs });
    }, Math.max(0, startAt - serverNow()));
    return () => clearTimeout(timer);
  }, [started, seed, startAt]);

  // 점수·진행률이 바뀔 때마다 방에 보고
  const score = finished ? state.finalScore : state.score;
  const progress = versusProgress(state.board);
  const lastScoreRef = useRef(0);
  useEffect(() => {
    if (!started) return;
    const scoreChanged = score !== lastScoreRef.current;
    lastScoreRef.current = score;
    void reportScore(code, me.id, { score, progress, finished }, scoreChanged);
  }, [started, score, progress, finished, code, me.id]);

  const handleCellClick = useCallback((r: number, c: number) => dispatch({ type: 'CLICK', r, c }), []);

  const isHost = room.meta.hostId === me.id;
  const roundOver = isRoundOver(room, now);
  const myRank = rankPlayers(room.players).findIndex(p => p.id === me.id) + 1;
  const secondsToStart = Math.ceil((startAt - now) / 1000);

  return (
    <div className="game-wrap">
      {!started && (
        <CountdownOverlay countdown={Math.min(COUNTDOWN_FROM, Math.max(1, secondsToStart))} />
      )}

      <div className="versus-layout">
        <div className="game-content">
          <Hud
            stage={1}
            score={score}
            combo={0}
            possiblePairs={state.possiblePairs}
            timeLeftMs={started ? state.timeLeftMs : VERSUS_TIME_LIMIT * 1000}
            isPaused={false}
            shuffleCharge={state.shuffleCharge}
            versus={{ timeLimit: VERSUS_TIME_LIMIT, progress, breakCharge: state.breakCharge }}
            onHome={() => setConfirmLeave(true)}
            onTogglePause={noop}
            onShuffle={() => dispatch({ type: 'MANUAL_SHUFFLE' })}
            onShowRanking={noop}
            onRestart={noop}
          />
          <div className="board-wrap">
            {started && (
              <Board
                board={state.board}
                selected={state.selected}
                pathCells={pathCells}
                matchedCells={matchedCells}
                currentPath={currentPath}
                onCellClick={handleCellClick}
                canBreak={state.breakCharge > 0}
              />
            )}
          </div>
        </div>
        <Leaderboard players={room.players} meId={me.id} title="실시간 순위" showFinished />
      </div>

      {finished && (
        <div className={`overlay ${state.phase === 'cleared' ? 'overlay-clear' : 'overlay-timeout'}`}>
          <div className="result-card result-card-timeout versus-result">
            <h2 className="result-title">
              {roundOver ? '최종 결과' : state.phase === 'cleared' ? '클리어!' : '시간 종료'}
            </h2>
            <p className="result-sub">
              {roundOver
                ? `${room.players.length}명 중 ${myRank}위 · ${score.toLocaleString()}점`
                : '다른 참가자의 결과를 기다리는 중'}
            </p>
            {state.phase === 'cleared' && (
              <p className="versus-result-bonus">
                클리어 +{state.clearStats.clearBonus} · 잔여 시간 +{state.clearStats.timeBonus}
              </p>
            )}
            <Leaderboard players={room.players} meId={me.id} title={roundOver ? '순위' : '집계 중'} showFinished={!roundOver} />
            <div className="result-btns">
              {isHost ? (
                <button className="btn btn-primary" onClick={onReturnToLobby} disabled={!roundOver}>
                  <RefreshCw size={14} /> 한 판 더 (대기실로)
                </button>
              ) : (
                <p className="versus-result-wait">방장이 다음 판을 준비하면 대기실로 이동합니다</p>
              )}
              <button className="btn btn-ghost" onClick={onLeave}>
                <LogOut size={14} /> 방 나가기
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLeave && !finished && (
        <div className="pause-overlay">
          <div className="pause-card">
            <div className="pause-icon pause-icon-warn"><AlertTriangle size={36} /></div>
            <div className="pause-title">방에서 나갈까요?</div>
            <p className="pause-confirm-desc">게임은 멈추지 않습니다. 나가면 이번 판은 기권 처리됩니다.</p>
            <button className="btn btn-danger" onClick={onLeave}>나가기</button>
            <button className="btn btn-secondary" onClick={() => setConfirmLeave(false)}>계속하기</button>
          </div>
        </div>
      )}

      {itemMsg && <div className="item-msg">{itemMsg}</div>}
    </div>
  );
}
