import { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, RefreshCw, Shuffle, Pause, Play, Home, Clock, Volume2, VolumeX } from 'lucide-react';
import { generateBoardWithObstacles, shuffleBoard, countPossiblePairs, isBoardClear } from '../game/boardLogic';
import type { Board as BoardState } from '../game/boardLogic';
import { findPath } from '../game/connectLogic';
import {
  TIME_LIMIT, TIME_CLEAR_BONUS, SCORE_PER_MATCH,
  TIME_ADD_SECONDS, BOARD_CLEAR_BONUS, ITEM_TIME_ID, ITEM_SHUFFLE_ID, OBSTACLE_ID
} from '../game/constants';
import { playCardSelect, playMatchSuccess, playMatchFail, setMuted, getMuted } from '../game/sounds';
import Board from './Board';
import StartScreen from './StartScreen';
import RankingModal from './Ranking/RankingModal';
import RankingRegisterModal from './Ranking/RankingRegisterModal';
import './Game.css';

type GamePhase = 'title' | 'playing' | 'gameover';

const PATH_SHOW_MS = 200;
const MATCH_ANIM_MS = 220;
const AUTO_SHUFFLE_DELAY_MS = 1200;
const SHUFFLE_CHARGE_THRESHOLD = 1; // 셔플 아이템 1쌍 제거 시 셔플 1회 충전

// 스테이지별 보드 설정
// counts 배열: [id0..id17]=캐릭터, [id18]=시간추가, [id19]=셔플  (짝수만 가능)
// counts 합계 = rows*cols - obstacleCount 이어야 함
//
// S1: 8×10=80,  장애물 0개 → 카드 80장  캐릭(16×4+2×6)+시간×2+셔플×2    아이템 각 1쌍
// S2: 8×12=96,  장애물 4개 → 카드 92장  캐릭(10×4+8×6)+시간×2+셔플×2    아이템 각 1쌍
// S3: 8×14=112, 장애물 6개 → 카드106장  캐릭(5×4+13×6)+시간×4+셔플×4    아이템 각 2쌍
// S4: 8×16=128, 장애물 8개 → 카드120장  캐릭(16×6+2×8)+시간×4+셔플×4    아이템 각 2쌍
// S5: 8×18=144, 장애물10개 → 카드134장  캐릭(11×6+7×8)+시간×6+셔플×6    아이템 각 3쌍
function getBoardConfig(stage: number) {
  const s = Math.min(stage, 5);
  const configs = [
    { rows: 8, cols: 10, obstacleCount:  0, counts: [...Array<number>(16).fill(4), ...Array<number>(2).fill(6),  2, 2] },
    { rows: 8, cols: 12, obstacleCount:  4, counts: [...Array<number>(10).fill(4), ...Array<number>(8).fill(6),  2, 2] },
    { rows: 8, cols: 14, obstacleCount:  6, counts: [...Array<number>(5).fill(4),  ...Array<number>(13).fill(6), 4, 4] },
    { rows: 8, cols: 16, obstacleCount:  8, counts: [...Array<number>(16).fill(6), ...Array<number>(2).fill(8),  4, 4] },
    { rows: 8, cols: 18, obstacleCount: 10, counts: [...Array<number>(11).fill(6), ...Array<number>(7).fill(8),  6, 6] },
  ];
  return configs[s - 1];
}

export default function Game() {
  const [phase, setPhase] = useState<GamePhase>('title');
  const [stage, setStage] = useState(1);
  const [board, setBoard] = useState<BoardState>(() => generateBoardWithObstacles(8, 10, [...Array<number>(16).fill(4), ...Array<number>(2).fill(6), 2, 2], 0));
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [pathCells, setPathCells] = useState<Set<string>>(new Set());
  const [matchedCells, setMatchedCells] = useState<Set<string>>(new Set());
  const [currentPath, setCurrentPath] = useState<[number, number][] | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [score, setScore] = useState(0);
  const [possiblePairs, setPossiblePairs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const [itemMsg, setItemMsg] = useState<string | null>(null);
  const [shuffleCharge, setShuffleCharge] = useState(0);
  const [isMuted, setIsMuted] = useState(() => getMuted());
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef      = useRef<Set<string>>(new Set());
  const scoreRef        = useRef(0);
  const timeRef         = useRef(TIME_LIMIT);
  const itemMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        const next = t - 1;
        timeRef.current = next;
        if (next <= 0) {
          stopTimer();
          setFinalScore(scoreRef.current);
          setPhase('gameover');
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [stopTimer]);

  // 타이머: phase + isPaused 에 따라 제어
  useEffect(() => {
    if (phase === 'playing' && !isPaused) startTimer();
    else stopTimer();
    return stopTimer;
  }, [phase, isPaused, startTimer, stopTimer]);

  // 가능한 쌍 계산 + 0이면 자동 셔플
  useEffect(() => {
    if (phase !== 'playing') return;
    const pairs = countPossiblePairs(board);
    setPossiblePairs(pairs);
    if (pairs === 0 && !isBoardClear(board)) {
      const t = setTimeout(() => {
        setBoard(prev => {
          const shuffled = shuffleBoard(prev);
          setPossiblePairs(countPossiblePairs(shuffled));
          return shuffled;
        });
        setSelected(null);
        showItemMsg('이동 불가 — 자동 셔플');
      }, AUTO_SHUFFLE_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [board, phase]);

  const startGame = () => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(1);
    const b = generateBoardWithObstacles(rows, cols, counts, obstacleCount);
    scoreRef.current = 0;
    timeRef.current = TIME_LIMIT;
    setStage(1);
    setBoard(b);
    setSelected(null);
    setPathCells(new Set());
    setMatchedCells(new Set());
    setCurrentPath(null);
    setTimeLeft(TIME_LIMIT);
    setScore(0);
    setFinalScore(0);
    setShuffleCharge(0);
    setIsPaused(false);
    pendingRef.current.clear();
    setPhase('playing');
  };

  // 이전 타이머를 취소하고 새 메시지로 교체 — 연속 호출 시 타이머 누수 방지
  const showItemMsg = (msg: string) => {
    if (itemMsgTimerRef.current) clearTimeout(itemMsgTimerRef.current);
    setItemMsg(msg);
    itemMsgTimerRef.current = setTimeout(() => setItemMsg(null), 1800);
  };

  // HUD 홈 버튼 — 게임 중 실수 클릭 방지: 일시정지 + 확인 다이얼로그
  const handleHomeClick = () => {
    setIsPaused(true);
    setShowHomeConfirm(true);
  };

  // 확인 후 실제 홈으로 이동
  const handleHome = () => {
    stopTimer();
    if (itemMsgTimerRef.current) clearTimeout(itemMsgTimerRef.current);
    pendingRef.current.clear();
    setShuffleCharge(0);
    setShowHomeConfirm(false);
    setPhase('title');
    setIsPaused(false);
  };

  // 홈 확인 취소 — 게임 재개
  const handleCancelHome = () => {
    setShowHomeConfirm(false);
    setIsPaused(false);
  };

  // 음소거 토글
  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    setMuted(next);
  };

  const handleManualShuffle = () => {
    if (phase !== 'playing' || pendingRef.current.size > 0 || isPaused) return;
    if (shuffleCharge < SHUFFLE_CHARGE_THRESHOLD) return;
    setBoard(prev => shuffleBoard(prev));
    setSelected(null);
    setShuffleCharge(prev => prev - 1);
    showItemMsg('셔플 발동!');
  };

  const handleCellClick = useCallback((r: number, c: number) => {
    if (phase !== 'playing' || isPaused) return;
    if (board[r][c] === null || board[r][c] === OBSTACLE_ID) return;

    const clickedKey = `${r},${c}`;
    if (pendingRef.current.has(clickedKey)) return;

    const activeSelected = (selected && !pendingRef.current.has(`${selected[0]},${selected[1]}`))
      ? selected
      : null;

    if (activeSelected === null) {
      playCardSelect();
      setSelected([r, c]);
      return;
    }

    const [sr, sc] = activeSelected;

    if (sr === r && sc === c) {
      setSelected(null);
      return;
    }

    if (board[sr][sc] !== board[r][c]) {
      playMatchFail();
      setSelected([r, c]);
      return;
    }

    const path = findPath(board, sr, sc, r, c);
    if (path === null) {
      playMatchFail();
      setSelected([r, c]);
      return;
    }

    // ── 매칭 성공 ──
    playMatchSuccess();
    setSelected(null);

    const typeId = board[sr][sc]!;
    const keyA = `${sr},${sc}`;
    const keyB = `${r},${c}`;
    pendingRef.current.add(keyA);
    pendingRef.current.add(keyB);

    // ── 시간 아이템: 매칭 확정 즉시 시간 추가 ──
    if (typeId === ITEM_TIME_ID) {
      setTimeLeft(t => {
        const added = t + TIME_ADD_SECONDS;
        timeRef.current = added;
        return added;
      });
      showItemMsg(`+${TIME_ADD_SECONDS}초 추가!`);
    }

    const pathSet = new Set(path.map(([pr, pc]) => `${pr},${pc}`));
    setPathCells(pathSet);
    setCurrentPath(path);

    setTimeout(() => {
      setPathCells(new Set());
      setCurrentPath(null);

      setMatchedCells(prev => new Set([...prev, keyA, keyB]));

      setTimeout(() => {
        setMatchedCells(prev => {
          const next = new Set(prev);
          next.delete(keyA);
          next.delete(keyB);
          return next;
        });

        // 셔플 아이템 충전
        if (typeId === ITEM_SHUFFLE_ID) {
          setShuffleCharge(prev => prev + 1);
          showItemMsg('셔플 충전!');
        }

        scoreRef.current += SCORE_PER_MATCH;
        setScore(scoreRef.current);

        // 판 클리어 여부 사전 계산 (setBoard updater 밖에서 처리)
        const tempBoard = board.map(row => [...row]);
        tempBoard[sr][sc] = null;
        tempBoard[r][c] = null;
        const willClear = isBoardClear(tempBoard);

        // 클리어 시 새 보드를 updater 밖에서 미리 생성
        // → updater 이중 호출(StrictMode) 시 두 번 생성되는 것을 방지
        let nextBoard: ReturnType<typeof generateBoardWithObstacles> | null = null;
        if (willClear) {
          scoreRef.current += BOARD_CLEAR_BONUS;
          setScore(scoreRef.current);
          timeRef.current = timeRef.current + TIME_CLEAR_BONUS;
          setTimeLeft(t => t + TIME_CLEAR_BONUS);
          showItemMsg(`판 클리어! +${BOARD_CLEAR_BONUS}`);
          setStage(prev => prev + 1);
          // stage state는 비동기이므로 직접 계산
          const nextStage = stage + 1;
          const { rows, cols, counts, obstacleCount } = getBoardConfig(nextStage);
          nextBoard = generateBoardWithObstacles(rows, cols, counts, obstacleCount);
        }

        // ── pending 해제: 업데이터 밖에서 처리 (순수 함수 원칙) ──
        pendingRef.current.delete(keyA);
        pendingRef.current.delete(keyB);

        // ── 보드 업데이트 (순수 함수만 — 외부 ref 뮤테이션 없음) ──
        setBoard(prev => {
          const next = prev.map(row => [...row]);
          next[sr][sc] = null;
          next[r][c] = null;
          return nextBoard ?? next;
        });
      }, MATCH_ANIM_MS);
    }, PATH_SHOW_MS);
  }, [phase, board, selected, isPaused]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const timeRatio = Math.min(timeLeft / TIME_LIMIT, 1);
  const timerColor = timeRatio > 0.4 ? '#4ecdc4' : timeRatio > 0.2 ? '#ffd166' : '#ef4444';

  if (phase === 'title') {
    return <StartScreen onStart={startGame} />;
  }

  return (
    <div className="game-wrap">

      {/* 게임 오버 */}
      {phase === 'gameover' && (
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
            <div className="result-btns">
              <button className="btn btn-gold" onClick={() => setShowRegister(true)}>
                <Trophy size={14} /> 랭킹 등록
              </button>
              <button className="btn btn-primary" onClick={startGame}><RefreshCw size={14} /> 다시 시작</button>
              <button className="btn btn-ghost" onClick={() => setPhase('title')}><Home size={14} /> 타이틀로</button>
            </div>
          </div>
        </div>
      )}

      {/* HUD + 보드 */}
      {phase === 'playing' && (
        <div className={`game-content ${isPaused ? 'game-content-paused' : ''}`}>

          {/* HUD */}
          <div className="hud">
            <div className="hud-stage">
              <span className="hud-stage-label">STAGE</span>
              <span className="hud-stage-num">{Math.min(stage, 5)}</span>
            </div>
            <div className="hud-left">
              <div className="hud-score">{score.toLocaleString()}점</div>
              <div className="hud-pairs">
                <span className="hud-pairs-dot" style={{ background: possiblePairs === 0 ? '#ef4444' : possiblePairs <= 3 ? '#ffd166' : '#4ecdc4' }} />
                {possiblePairs}쌍
              </div>
            </div>
            <div className="hud-center">
              <div className="timer-text" style={{ color: timerColor }}>
                <span className={`timer-digits ${timeRatio <= 0.2 ? 'timer-digits-urgent' : ''}`}>{formatTime(timeLeft)}</span>
              </div>
              <div className="timer-bar-wrap">
                <div className="timer-bar" style={{ width: `${timeRatio * 100}%`, background: timerColor }} />
                <div className="timer-bar-shine" />
              </div>
            </div>
            <div className="hud-right">
              <button className="hud-btn" title="홈" onClick={handleHomeClick}>
                <Home size={16} />
              </button>
              <button className="hud-btn" title={isPaused ? '계속하기' : '일시정지'} onClick={() => setIsPaused(p => !p)}>
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button
                className={`hud-btn hud-btn-shuffle ${shuffleCharge >= SHUFFLE_CHARGE_THRESHOLD ? 'hud-btn-charged' : ''}`}
                title={`셔플 (${shuffleCharge}회 보유)`}
                onClick={handleManualShuffle}
                disabled={shuffleCharge < SHUFFLE_CHARGE_THRESHOLD}
              >
                <Shuffle size={16} />
                {shuffleCharge > 0 && (
                  <span className="hud-btn-badge hud-btn-badge-ready">
                    {shuffleCharge}
                  </span>
                )}
              </button>
              <button
                className={`hud-btn ${isMuted ? 'hud-btn-muted' : ''}`}
                title={isMuted ? '소리 켜기' : '소리 끄기'}
                onClick={handleToggleMute}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button className="hud-btn" title="랭킹" onClick={() => setShowRanking(true)}>
                <Trophy size={16} />
              </button>
              <button className="hud-btn" title="새 게임" onClick={startGame}>
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* 보드 */}
          <div className="board-wrap">
            <Board
              board={board}
              selected={selected}
              pathCells={pathCells}
              matchedCells={matchedCells}
              currentPath={currentPath}
              onCellClick={handleCellClick}
            />
          </div>

        </div>
      )}

      {/* 일시정지 오버레이 */}
      {isPaused && phase === 'playing' && (
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
                <button className="btn btn-danger" onClick={handleHome}>
                  <Home size={15} /> 나가기
                </button>
                <button className="btn btn-primary" onClick={handleCancelHome}>
                  <Play size={15} /> 계속하기
                </button>
              </>
            ) : (
              /* ── 일반 일시정지 ── */
              <>
                <div className="pause-icon"><Pause size={44} strokeWidth={1.4} /></div>
                <h2 className="pause-title">일시정지</h2>
                <div className="pause-info">
                  <span>{formatTime(timeLeft)}</span>
                  <span>·</span>
                  <span>{score.toLocaleString()}점</span>
                </div>
                <button className="btn btn-primary" onClick={() => setIsPaused(false)}>
                  <Play size={15} /> 계속하기
                </button>
                <button className="btn btn-secondary" onClick={handleHome}>
                  <Home size={15} /> 타이틀로
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 아이템 메시지 */}
      {itemMsg && <div className="item-msg">{itemMsg}</div>}

      {showRanking && (
        <RankingModal onClose={() => setShowRanking(false)} highlightSoopId={highlightId} />
      )}
      {showRegister && (
        <RankingRegisterModal
          score={finalScore}
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
