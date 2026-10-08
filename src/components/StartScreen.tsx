import { useState } from 'react';
import { Play, Link2, Clock, Trophy, Shuffle, Shield, Flame, Hammer, Users } from 'lucide-react';
import { CARD_DEFS } from '../game/constants';
import { MAX_PLAYERS } from '../game/roomLogic';
import { VERSUS_BREAK_CHARGES, VERSUS_TIME_LIMIT } from '../game/versus';
import RankingModal from './Ranking/RankingModal';
import Footer from './Footer/Footer';
import './StartScreen.css';

interface Props {
  onStart: () => void;
  onMulti?: () => void;
}

export default function StartScreen({ onStart, onMulti }: Props) {
  const [showRanking, setShowRanking] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="ss-screen">
      <div className="ss-content">
        <div className="ss-card">
          {/* 상단 바 */}
          <div className="ss-top-bar" />
          <p className="ss-patch-date">Whale Connect v2.0</p>

          {/* 도움말 버튼 */}
          <div className="ss-help-wrap">
            <button
              className="ss-help-btn"
              type="button"
              onClick={() => setShowHelp(v => !v)}
              aria-label="게임 방법"
            >?</button>
            <div className={`ss-help-tooltip ${showHelp ? 'ss-help-tooltip-open' : ''}`}>
              <p className="ss-help-ttl">게임 방법</p>
              <p className="ss-help-row">같은 카드를 2번 이하의 꺾임으로 연결하세요</p>
              <p className="ss-help-row">연결 경로는 빈 칸을 통해야 합니다</p>
              <p className="ss-help-row"><span>매칭 성공 시 <strong>+10점</strong> (실패해도 감점 없음)</span></p>
              <p className="ss-help-row"><Shuffle size={11} className="ss-help-row-icon" /> 셔플 카드 매칭 시 셔플 1회 충전</p>
              <p className="ss-help-row"><Shield size={11} className="ss-help-row-icon" /> 빗금 카드는 경로를 막는 장애물입니다</p>

              <p className="ss-help-ttl ss-help-ttl-sub">솔로플레이</p>
              <p className="ss-help-row"><Flame size={11} className="ss-help-row-icon" /><span>콤보! 3초 안에 연속 매칭 시 콤보당 <strong>+2점</strong> (최대 5콤보)</span></p>
              <p className="ss-help-row"><Clock size={11} className="ss-help-row-icon" /> 시간추가 카드 매칭 시 +5초</p>
              <p className="ss-help-row">판을 클리어하면 +60초 &amp; +100점, 3·2·1 카운트 후 다음 스테이지</p>
              <p className="ss-help-row">시간이 다 되면 게임 종료 — 최고 점수로 랭킹에 도전!</p>

              {onMulti && (
                <>
                  <p className="ss-help-ttl ss-help-ttl-sub">멀티플레이</p>
                  <p className="ss-help-row"><Users size={11} className="ss-help-row-icon" /> 방 코드로 최대 {MAX_PLAYERS}명 — 모두 같은 보드로 동시에 시작</p>
                  <p className="ss-help-row"><Clock size={11} className="ss-help-row-icon" /> {VERSUS_TIME_LIMIT}초 고정, 일시정지·콤보·시간추가 카드 없음</p>
                  <p className="ss-help-row"><Hammer size={11} className="ss-help-row-icon" /> 장애물 부수기 {VERSUS_BREAK_CHARGES}회 — 장애물을 클릭해 제거</p>
                  <p className="ss-help-row">보드를 다 지우면 +100점 &amp; 남은 초 × 10점</p>
                  <p className="ss-help-row">점수가 같으면 먼저 도달한 사람이 위</p>
                </>
              )}
            </div>
          </div>

          {/* 로고 */}
          <img
            src="/logo.png"
            alt="고래사천성 Whale Connect"
            className="ss-logo"
            onError={e => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
            }}
          />
          <div className="ss-logo-fallback" style={{ display: 'none' }}>
            <span className="ss-logo-text">고래사천성</span>
          </div>

          {/* 부제 */}
          <p className="ss-subtitle">
            고래상사 사원들을 연결해&nbsp;<strong>모두 제거</strong>하세요!
          </p>

          {/* 캐릭터 퍼레이드 */}
          <div className="ss-chars-wrap">
            <div className="ss-chars">
              {[...CARD_DEFS.filter(d => !d.isItem), ...CARD_DEFS.filter(d => !d.isItem)].map((def, i) => (
                <div
                  key={i}
                  className="ss-char"
                  title={def.name}
                  style={{ background: def.color }}
                >
                  <img src={def.image} alt={def.name} className="ss-char-img" draggable={false} />
                </div>
              ))}
            </div>
          </div>

          {/* 피처 카드 */}
          <div className="ss-features">
            <div className="ss-feature">
              <div className="ss-feat-icon-wrap"><Link2 size={18} /></div>
              <div className="ss-feat-title">경로 연결</div>
              <div className="ss-feat-desc">2번 꺾임으로 같은 카드 연결</div>
            </div>
            {onMulti ? (
              <>
                <div className="ss-feature">
                  <div className="ss-feat-icon-wrap"><Trophy size={18} /></div>
                  <div className="ss-feat-title">솔로 랭킹</div>
                  <div className="ss-feat-desc">7스테이지 콤보로 TOP 100 도전</div>
                </div>
                <div className="ss-feature">
                  <div className="ss-feat-icon-wrap"><Users size={18} /></div>
                  <div className="ss-feat-title">멀티 대전</div>
                  <div className="ss-feat-desc">같은 보드로 친구와 실시간 경쟁</div>
                </div>
              </>
            ) : (
              <>
                <div className="ss-feature">
                  <div className="ss-feat-icon-wrap"><Flame size={18} /></div>
                  <div className="ss-feat-title">콤보 시스템</div>
                  <div className="ss-feat-desc">빠르게 연속 매칭해 콤보 점수!</div>
                </div>
                <div className="ss-feature">
                  <div className="ss-feat-icon-wrap"><Trophy size={18} /></div>
                  <div className="ss-feat-title">랭킹 도전</div>
                  <div className="ss-feat-desc">최고 점수로 순위에 도전!</div>
                </div>
              </>
            )}
          </div>

          {/* 시작 버튼 */}
          {onMulti ? (
            /* 솔로 · 멀티를 같은 비중으로 나란히 */
            <div className="ss-play-row">
              <button className="ss-btn-start ss-btn-mode" onClick={onStart}>
                <Play size={17} fill="white" /> 솔로플레이
              </button>
              <button className="ss-btn-start ss-btn-mode" onClick={onMulti}>
                <Users size={17} /> 멀티플레이
              </button>
            </div>
          ) : (
            <button className="ss-btn-start" onClick={onStart}>
              <Play size={18} fill="white" />
              게임 시작하기
            </button>
          )}

          {/* 랭킹 버튼 */}
          <button className="ss-btn-ranking" onClick={() => setShowRanking(true)}>
            <Trophy size={15} />
            랭킹 보기
          </button>

        </div>
      </div>

      <Footer />

      {showRanking && <RankingModal onClose={() => setShowRanking(false)} />}
    </div>
  );
}
