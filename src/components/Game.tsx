import { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, RefreshCw, Shuffle, Pause, Play, Home, Clock, Volume2, VolumeX } from 'lucide-react';
import { generateBoardWithObstacles, shuffleBoard, countPossiblePairs, isBoardClear } from '../game/boardLogic';
import type { Board as BoardState } from '../game/boardLogic';
import { findPath } from '../game/connectLogic';
import {
  TIME_LIMIT, TIME_CLEAR_BONUS, SCORE_PER_MATCH,
  TIME_ADD_SECONDS, BOARD_CLEAR_BONUS, TIME_BONUS_MULTIPLIER, ITEM_TIME_ID, ITEM_SHUFFLE_ID, OBSTACLE_ID
} from '../game/constants';
import { playCardSelect, playMatchSuccess, playMatchFail, playBGM, pauseBGM, stopBGM, playGameOver, setMuted, getMuted, setBGMVolume, getBGMVolume } from '../game/sounds';
import Board from './Board';
import StartScreen from './StartScreen';
import RankingModal from './Ranking/RankingModal';
import RankingRegisterModal from './Ranking/RankingRegisterModal';
import './Game.css';

type GamePhase = 'title' | 'playing' | 'gameover' | 'cleared';

const PATH_SHOW_MS = 200;
const MATCH_ANIM_MS = 220;
const AUTO_SHUFFLE_DELAY_MS = 1200;
const SHUFFLE_CHARGE_THRESHOLD = 1; // 셔플 아이템 1쌍 제거 시 셔플 1회 충전

// 스테이지별 보드 설정
// counts 배열: [id0..id15]=캐릭터(16종), [id16]=시간추가, [id17]=셔플  (짝수만 가능)
// counts 합계 = rows*cols - obstacleCount 이어야 함
//
// S1: 8×10=80,  장애물 0개 → 카드 80장  캐릭(10×4+6×6)+시간×2+셔플×2    아이템 각 1쌍
// S2: 8×12=96,  장애물 4개 → 카드 92장  캐릭(4×4+12×6)+시간×2+셔플×2    아이템 각 1쌍
// counts 인덱스: id0..id15=캐릭터16종, id16=올챙구, id17=시간추가, id18=셔플
// 새우(id8): S1·S2 미등장 → 올챙구로 대체 (합계 동일, 18종 유지)
// S1: 8×10=80,  장애물 0개 → 카드 80장  18종 (새우✗ 올챙구✓)
// S2: 8×12=96,  장애물 4개 → 카드 92장  18종 (새우✗ 올챙구✓)
// S3: 8×14=112, 장애물 6개 → 카드106장  19종 (전부)
// S4: 8×16=128, 장애물 8개 → 카드120장  19종 (전부)
// S5: 8×18=144, 장애물10개 → 카드134장  19종 (전부)
function getBoardConfig(stage: number) {
  const s = Math.min(stage, 5);
  const configs = [
    // S1: id8(새우)=0, id16(올챙구)=4 → 새우 자리를 올챙구로 대체
    { rows: 8, cols: 10, obstacleCount:  0, counts: [...Array<number>(8).fill(4), 0, ...Array<number>(1).fill(4), ...Array<number>(6).fill(6), 4, 2, 2] },
    // S2: id8(새우)=0, id16(올챙구)=6 → 새우 자리를 올챙구로 대체
    { rows: 8, cols: 12, obstacleCount:  4, counts: [...Array<number>(4).fill(4), ...Array<number>(4).fill(6), 0, ...Array<number>(7).fill(6), 6, 2, 2] },
    { rows: 8, cols: 14, obstacleCount:  6, counts: [...Array<number>(15).fill(6), 4,                            4, 4, 4] },
    { rows: 8, cols: 16, obstacleCount:  8, counts: [...Array<number>(11).fill(6), ...Array<number>(5).fill(8),  6, 4, 4] },
    { rows: 8, cols: 18, obstacleCount: 10, counts: [...Array<number>(3).fill(4),  ...Array<number>(13).fill(8), 6, 6, 6] },
  ];
  return configs[s - 1];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Game() {
  const [phase, setPhase] = useState<GamePhase>('title');
  const [stage, setStage] = useState(1);
  const [board, setBoard] = useState<BoardState>(() => {
    const { rows, cols, counts, obstacleCount } = getBoardConfig(1);
    return generateBoardWithObstacles(rows, cols, counts, obstacleCount);
  });
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
  const [bgmVolume, setBgmVolume] = useState(() => getBGMVolume());
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [clearStats, setClearStats] = useState({ matchScore: 0, clearBonus: 0, timeBonus: 0 });
  const [countdown, setCountdown] = useState<number | null>(null);

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef      = useRef<Set<string>>(new Set());
  const scoreRef        = useRef(0);
  const nextBoardRef    = useRef<ReturnType<typeof generateBoardWithObstacles> | null>(null);
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

  // 이전 타이머를 취소하고 새 메시지로 교체 — 연속 호출 시 타이머 누수 방지
  const showItemMsg = useCallback((msg: string) => {
    if (itemMsgTimerRef.current) clearTimeout(itemMsgTimerRef.current);
    setItemMsg(msg);
    itemMsgTimerRef.current = setTimeout(() => setItemMsg(null), 1800);
  }, []);

  // 타이머: phase + isPaused + countdown 에 따라 제어
  useEffect(() => {
    if (phase === 'playing' && !isPaused && countdown === null) startTimer();
    else stopTimer();
    return stopTimer;
  }, [phase, isPaused, countdown, startTimer, stopTimer]);

  // BGM: phase + isPaused 에 따라 재생/일시정지/정지
  useEffect(() => {
    if (phase === 'playing' && !isPaused) playBGM();
    else if (phase === 'playing' && isPaused) pauseBGM();
    else stopBGM();
  }, [phase, isPaused]);

  // 게임 오버 사운드
  useEffect(() => {
    if (phase === 'gameover') playGameOver();
  }, [phase]);

  // 스테이지 전환 카운트다운 (3→2→1→0: 보드 교체 후 재개)
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      if (nextBoardRef.current) {
        setBoard(nextBoardRef.current);
        nextBoardRef.current = null;
      }
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null && c > 0) ? c - 1 : null), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

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
  }, [board, phase, showItemMsg]);

  // ── 판 클리어 감지 ──
  // handleCellClick 클로저 안에서 willClear를 계산하면, 마지막 두 쌍을
  // 빠르게 연속 매칭할 때 두 클로저가 같은 stale board를 캡처해
  // "아직 카드 남음"으로 오판하는 버그가 발생한다.
  // 이 useEffect는 실제 board 상태 커밋 후 반응하므로 항상 정확하다.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (countdown !== null) return;       // 이미 카운트다운 중
    if (!isBoardClear(board)) return;     // 아직 카드 있음

    // 판 클리어 확정
    scoreRef.current += BOARD_CLEAR_BONUS;
    setScore(scoreRef.current);

    if (stage >= 5) {
      // 🎉 전 스테이지 클리어!
      const timeBonus  = timeRef.current * TIME_BONUS_MULTIPLIER;
      const totalClear = 5 * BOARD_CLEAR_BONUS;
      const matchScore = scoreRef.current - totalClear;
      scoreRef.current += timeBonus;
      setScore(scoreRef.current);
      setFinalScore(scoreRef.current);
      setClearStats({ matchScore, clearBonus: totalClear, timeBonus });
      setTimeout(() => {
        stopTimer();
        setPhase('cleared');
      }, 420);
    } else {
      timeRef.current += TIME_CLEAR_BONUS;
      setTimeLeft(t => t + TIME_CLEAR_BONUS);
      showItemMsg(`판 클리어! +${BOARD_CLEAR_BONUS}`);
      setStage(prev => prev + 1);
      const nextStage = stage + 1;
      const { rows, cols, counts, obstacleCount } = getBoardConfig(nextStage);
      nextBoardRef.current = generateBoardWithObstacles(rows, cols, counts, obstacleCount);
      setCountdown(3);
    }
  }, [board, phase, stage, countdown, stopTimer, showItemMsg]);

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

  // BGM 볼륨 조절
  const handleVolumeChange = (val: number) => {
    setBgmVolume(val);
    setBGMVolume(val);
    if (val === 0 && !isMuted) { setIsMuted(true); setMuted(true); }
    else if (val > 0 && isMuted) { setIsMuted(false); setMuted(false); }
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
      scoreRef.current = Math.max(0, scoreRef.current - 5);
      setScore(scoreRef.current);
      setSelected([r, c]);
      return;
    }

    const path = findPath(board, sr, sc, r, c);
    if (path === null) {
      playMatchFail();
      scoreRef.current = Math.max(0, scoreRef.current - 5);
      setScore(scoreRef.current);
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

        // ── pending 해제: 업데이터 밖에서 처리 (순수 함수 원칙) ──
        pendingRef.current.delete(keyA);
        pendingRef.current.delete(keyB);

        // ── 보드 업데이트 (순수 함수만) ──
        // 판 클리어 판정은 이 아래 useEffect에서 실제 board 상태로 처리.
        // 여기서 closured board 로 willClear를 계산하면, 두 쌍이 빠르게
        // 연속 매칭될 때 두 클로저 모두 stale board를 캡처해서 판정 실패함.
        setBoard(prev => {
          const next = prev.map(row => [...row]);
          next[sr][sc] = null;
          next[r][c] = null;
          return next;
        });
      }, MATCH_ANIM_MS);
    }, PATH_SHOW_MS);
  }, [phase, board, selected, isPaused, stage, stopTimer, showItemMsg]);

  const timeRatio = Math.min(timeLeft / TIME_LIMIT, 1);
  const timerColor = timeRatio > 0.4 ? '#4ecdc4' : timeRatio > 0.2 ? '#ffd166' : '#ef4444';

  if (phase === 'title') {
    return <StartScreen onStart={startGame} />;
  }

  return (
    <div className="game-wrap">

      {/* 스테이지 전환 카운트다운 오버레이 */}
      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-number" key={countdown}>
            {countdown === 0 ? 'GO!' : countdown}
          </div>
        </div>
      )}

      {/* 전 스테이지 클리어 엔딩 */}
      {phase === 'cleared' && (
        <div className="overlay overlay-clear">
          <div className="result-card result-card-clear">

            {/* 트로피 아이콘 + 빛살 (같은 래퍼 → 트로피 중심 기준 회전) */}
            <div className="result-icon-area">
              <div className="result-rays" />
              <div className="result-icon-wrap result-icon-clear">
                <Trophy size={44} strokeWidth={1.5} />
              </div>
            </div>

            {/* 타이틀 */}
            <h2 className="result-title result-title-clear">CLEAR!</h2>
            <p className="result-sub">⭐ 5스테이지 전 클리어 달성! ⭐</p>

            <div className="result-divider" />

            {/* 점수 Breakdown */}
            <div className="result-breakdown">
              <div className="result-breakdown-row">
                <span>매칭 점수</span>
                <span>{clearStats.matchScore.toLocaleString()}점</span>
              </div>
              <div className="result-breakdown-row result-breakdown-bonus">
                <span>스테이지 클리어 ×5</span>
                <span>+{clearStats.clearBonus.toLocaleString()}점</span>
              </div>
              <div className="result-breakdown-row result-breakdown-bonus">
                <span>잔여 시간 보너스</span>
                <span>+{clearStats.timeBonus.toLocaleString()}점</span>
              </div>
            </div>

            {/* 최종 점수 */}
            <div className="result-score-block">
              <span className="result-score-label">최종 점수</span>
              <span className="result-score result-score-clear">
                {finalScore.toLocaleString()}<small>점</small>
              </span>
            </div>

            <div className="result-divider" />

            {/* 버튼 */}
            <div className="result-btns">
              <button className="btn btn-gold" onClick={() => setShowRegister(true)}>
                <Trophy size={14} /> 랭킹 등록
              </button>
              <button className="btn btn-primary" onClick={startGame}>
                <RefreshCw size={14} /> 다시 시작
              </button>
              <button className="btn btn-ghost" onClick={() => setPhase('title')}>
                <Home size={14} /> 타이틀로
              </button>
            </div>
          </div>
        </div>
      )}

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
