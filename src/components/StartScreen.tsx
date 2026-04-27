import { useState } from 'react';
import { Play, Link2, Clock, Trophy, Shuffle, Shield } from 'lucide-react';
import { CARD_DEFS } from '../game/constants';
import RankingModal from './Ranking/RankingModal';
import Footer from './Footer/Footer';
import './StartScreen.css';

interface Props {
  onStart: () => void;
  onPreviewEnding?: () => void;
}

export default function StartScreen({ onStart, onPreviewEnding }: Props) {
  const [showRanking, setShowRanking] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="ss-screen">
      <div className="ss-content">
        <div className="ss-card">
          {/* 상단 바 */}
          <div className="ss-top-bar" />
          <p className="ss-patch-date">Whale Connect v1.0</p>

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
              <p className="ss-help-row"><Clock size={11} className="ss-help-row-icon" /> 시간추가 카드 매칭 시 +5초</p>
              <p className="ss-help-row"><Shuffle size={11} className="ss-help-row-icon" /> 셔플 카드 매칭 시 셔플 1회 충전</p>
              <p className="ss-help-row"><Shield size={11} className="ss-help-row-icon" /> 빗금 카드는 제거 불가 — 경로를 막습니다</p>
              <p className="ss-help-row">판을 클리어하면 +60초 &amp; 다음 스테이지로!</p>
              <p className="ss-help-row">시간이 다 되면 게임 종료 — 최고 점수에 도전!</p>
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
            <div className="ss-feature">
              <div className="ss-feat-icon-wrap"><Clock size={18} /></div>
              <div className="ss-feat-title">5단계 스테이지</div>
              <div className="ss-feat-desc">판 클리어마다 보드 확장 +60초</div>
            </div>
            <div className="ss-feature">
              <div className="ss-feat-icon-wrap"><Trophy size={18} /></div>
              <div className="ss-feat-title">랭킹 도전</div>
              <div className="ss-feat-desc">최고 점수로 순위에 도전!</div>
            </div>
          </div>

          {/* 시작 버튼 */}
          <button className="ss-btn-start" onClick={onStart}>
            <Play size={18} fill="white" />
            게임 시작하기
          </button>

          {/* 랭킹 버튼 */}
          <button className="ss-btn-ranking" onClick={() => setShowRanking(true)}>
            <Trophy size={15} />
            랭킹 보기
          </button>

          {/* 엔딩 미리보기 (개발/확인용) */}
          {onPreviewEnding && (
            <button className="ss-btn-preview" onClick={onPreviewEnding}>
              🎬 엔딩 화면 미리보기
            </button>
          )}
        </div>
      </div>

      <Footer />

      {showRanking && <RankingModal onClose={() => setShowRanking(false)} />}
    </div>
  );
}
