import { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, RefreshCw, Shuffle, Pause, Play, Home, Clock, Volume2, VolumeX, Flame, Star } from 'lucide-react';
import { generateBoardWithObstacles, shuffleBoard, shuffleBoardWithObstacles, countPossiblePairs, isBoardClear } from '../game/boardLogic';
import type { Board as BoardState } from '../game/boardLogic';
import { findPath } from '../game/connectLogic';
import {
  TIME_LIMIT, SCORE_PER_MATCH,
  TIME_ADD_SECONDS, BOARD_CLEAR_BONUS, TIME_BONUS_MULTIPLIER, ITEM_TIME_ID, ITEM_SHUFFLE_ID, OBSTACLE_ID,
  CARD_DEFS, COMBO_WINDOW_MS, COMBO_POINT, COMBO_MAX, stageTimeBonus,
} from '../game/constants';
import { playCardSelect, playMatchSuccess, playMatchFail, playBGM, pauseBGM, stopBGM, playGameOver, setMuted, getMuted, setBGMVolume, getBGMVolume } from '../game/sounds';
import Board from './Board';
import StartScreen from './StartScreen';
import BoardSizePanel from './BoardSizePanel';
import RankingModal from './Ranking/RankingModal';
import RankingRegisterModal from './Ranking/RankingRegisterModal';
import './Game.css';

type GamePhase = 'title' | 'playing' | 'gameover' | 'cleared';

const PATH_SHOW_MS = 200;
const MATCH_ANIM_MS = 220;
const AUTO_SHUFFLE_DELAY_MS = 1200;
const SHUFFLE_CHARGE_THRESHOLD = 1; // 셔플 아이템 1쌍 제거 시 셔플 1회 충전

export const MAX_STAGE = 7;

// ── 스테이지별 보드 설정 (7스테이지) ──
// 멤버 15명 전원 항상 등장 + 팬캐릭 랜덤 선발 + 아이템 2종
// 가로:  S1=10 S2=12 S3=12 S4=14 S5=14 S6=16 S7=16 (세로 8 고정)
// 장애물: 0 / 2 / 4 / 8 / 10 / 14 / 16
// 팬캐릭: 1 / 1 / 2 / 3 / 4 / 5 / 6
// 아이템쌍(종류당): 1 / 1 / 1 / 2 / 2 / 3 / 3  (후반 여유 ↑)
//
// ※ 프하 제외로 멤버가 16→15명이 되면서, 빈 자리를 팬캐릭 랜덤 1종으로 대체(전 스테이지 +1).
//   총 캐릭터 종류 = 멤버15 + 팬캐릭 = 16/16/17/18/19/20/21 → 프하 제외 전과 완전히 동일.
//   보드는 종류 개수만 따지므로 난이도(점수 획득 곡선)가 기존과 완전히 동일하게 유지됨.
const STAGE_DATA = [
  { cols: 10, obstacleCount:  0, fanchars: 1, itemPairs: 1 },
  { cols: 12, obstacleCount:  2, fanchars: 1, itemPairs: 1 },
  { cols: 12, obstacleCount:  4, fanchars: 2, itemPairs: 1 },
  { cols: 14, obstacleCount:  8, fanchars: 3, itemPairs: 2 },
  { cols: 14, obstacleCount: 10, fanchars: 4, itemPairs: 2 },
  { cols: 16, obstacleCount: 14, fanchars: 5, itemPairs: 3 },
  { cols: 16, obstacleCount: 16, fanchars: 6, itemPairs: 3 },
] as const;

// 스테이지별 팬캐릭 랜덤 선발 (등장 종류 수는 STAGE_DATA.fanchars)
function pickFanchars(stage: number): number[] {
  const count = STAGE_DATA[Math.min(stage, MAX_STAGE) - 1].fanchars;
  const allIds = CARD_DEFS.filter(d => d.isFanchar).map(d => d.id);
  const arr = [...allIds];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, allIds.length));
}

// charCards = totalCells - 아이템카드, base = floor(charCards/charCount) (짝수로 내림)
// 나머지는 앞 charId부터 +2 페어로 분배 → 멤버 확장 시에도 공식만으로 자동 재분배
function getBoardConfig(stage: number, fancharIds: number[]) {
  const { cols, obstacleCount, itemPairs } = STAGE_DATA[Math.min(stage, MAX_STAGE) - 1];
  const rows = 8;
  const totalCells   = rows * cols - obstacleCount;
  const memberIds    = CARD_DEFS.filter(d => !d.isItem && !d.isFanchar).map(d => d.id);
  const charIds      = [...memberIds, ...fancharIds];
  const itemCardsEach = itemPairs * 2;
  const charCards    = totalCells - 2 * itemCardsEach;
  let base = Math.floor(charCards / charIds.length);
  if (base % 2 !== 0) base -= 1;
  const extra      = charCards - base * charIds.length;
  const extraPairs = extra / 2;
  const counts     = new Array(CARD_DEFS.length).fill(0);
  charIds.forEach((id, i) => { counts[id] = base + (i < extraPairs ? 2 : 0); });
  counts[ITEM_TIME_ID]    = itemCardsEach;
  counts[ITEM_SHUFFLE_ID] = itemCardsEach;
  return { rows, cols, obstacleCount, counts };
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
    const fancharIds = pickFanchars(1);
    const { rows, cols, counts, obstacleCount } = getBoardConfig(1, fancharIds);
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
  const [combo, setCombo] = useState(0);
  const [boardScale, setBoardScale] = useState<number>(() =>
    Number(localStorage.getItem('wc-board-scale') ?? 1.0)
  );

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef      = useRef<Set<string>>(new Set());
  const scoreRef        = useRef(0);
  const nextBoardRef    = useRef<ReturnType<typeof generateBoardWithObstacles> | null>(null);
  const timeRef         = useRef(TIME_LIMIT);
  const itemMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboRef        = useRef(0);                                   // 현재 콤보
  const comboTimeRef    = useRef(0);                                   // 직전 매칭 시각(ms)
  const comboResetRef   = useRef<ReturnType<typeof setTimeout> | null>(null); // 콤보 만료 타이머

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const handleScaleChange = (delta: number) => {
    setBoardScale(prev => {
      const next = Math.round(Math.max(0.6, Math.min(1.6, prev + delta)) * 10) / 10;
      localStorage.setItem('wc-board-scale', String(next));
      return next;
    });
  };

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
          // 장애물까지 함께 재배치 — 마지막 쌍이 장애물에 갇히는 교착 방지
          const shuffled = shuffleBoardWithObstacles(prev);
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

    if (stage >= MAX_STAGE) {
      // 🎉 전 스테이지 클리어!
      const timeBonus  = timeRef.current * TIME_BONUS_MULTIPLIER;
      const totalClear = MAX_STAGE * BOARD_CLEAR_BONUS;
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
      const nextStage = stage + 1;
      const addTime = stageTimeBonus(nextStage);   // 2R:60 3R:70 ... 6R:100
      timeRef.current += addTime;
      setTimeLeft(t => t + addTime);
      showItemMsg(`판 클리어! +${BOARD_CLEAR_BONUS}점 · +${addTime}초`);
      setStage(prev => prev + 1);
      const fancharIds = pickFanchars(nextStage);
      const { rows, cols, counts, obstacleCount } = getBoardConfig(nextStage, fancharIds);
      nextBoardRef.current = generateBoardWithObstacles(rows, cols, counts, obstacleCount);
      setCountdown(3);
    }
  }, [board, phase, stage, countdown, stopTimer, showItemMsg]);

  const startGame = () => {
    const fancharIds = pickFanchars(1);
    const { rows, cols, counts, obstacleCount } = getBoardConfig(1, fancharIds);
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
    comboRef.current = 0;
    comboTimeRef.current = 0;
    if (comboResetRef.current) clearTimeout(comboResetRef.current);
    setCombo(0);
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

        // ── 콤보 계산: 직전 매칭 후 COMBO_WINDOW_MS 이내면 콤보 +1 (최대 COMBO_MAX) ──
        const now = Date.now();
        if (now - comboTimeRef.current <= COMBO_WINDOW_MS) {
          comboRef.current = Math.min(comboRef.current + 1, COMBO_MAX);
        } else {
          comboRef.current = 0;
        }
        comboTimeRef.current = now;
        setCombo(comboRef.current);

        // 콤보 만료 타이머 — 3초 동안 매칭 없으면 콤보 리셋
        if (comboResetRef.current) clearTimeout(comboResetRef.current);
        comboResetRef.current = setTimeout(() => {
          comboRef.current = 0;
          setCombo(0);
        }, COMBO_WINDOW_MS);

        // 매칭 점수 = 기본 + 콤보 보너스(콤보 1당 COMBO_POINT)
        const gained = SCORE_PER_MATCH + comboRef.current * COMBO_POINT;
        scoreRef.current += gained;
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
  }, [phase, board, selected, isPaused, showItemMsg]);

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
            <p className="result-sub">
              <Star size={12} fill="currentColor" style={{ verticalAlign: '-2px' }} /> {MAX_STAGE}스테이지 전 클리어 달성! <Star size={12} fill="currentColor" style={{ verticalAlign: '-2px' }} />
            </p>

            <div className="result-divider" />

            {/* 점수 Breakdown */}
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

      {/* 보드 크기 조절 패널 */}
      {phase === 'playing' && (
        <BoardSizePanel
          scale={boardScale}
          onIncrease={() => handleScaleChange(0.1)}
          onDecrease={() => handleScaleChange(-0.1)}
          disabled={isPaused || countdown !== null}
        />
      )}

      {/* HUD + 보드 */}
      {phase === 'playing' && (
        <div className={`game-content ${isPaused ? 'game-content-paused' : ''}`}>

          {/* HUD */}
          <div className="hud">
            <div className="hud-stage">
              <span className="hud-stage-label">STAGE</span>
              <span className="hud-stage-num">{Math.min(stage, MAX_STAGE)}</span>
            </div>
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
            <div style={{ transform: `scale(${boardScale})`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }}>
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
          stageReached={Math.min(stage, MAX_STAGE)}
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
