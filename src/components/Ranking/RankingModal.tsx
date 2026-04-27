import { useState, useEffect } from 'react';
import { Trophy, X, User, Award, Anchor } from 'lucide-react';
import { getTopRankings, getWCRankings } from '../../services/firebase';
import type { RankingEntry } from '../../services/firebase';
import './RankingModal.css';

interface Props {
  onClose: () => void;
  highlightSoopId?: string;
}

type Tab = 'all' | 'wc';

export default function RankingModal({ onClose, highlightSoopId }: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const [allRankings, setAllRankings] = useState<RankingEntry[]>([]);
  const [wcRankings, setWcRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTopRankings(100), getWCRankings(100)]).then(([all, wc]) => {
      setAllRankings(all);
      setWcRankings(wc);
      setLoading(false);
    });
  }, []);

  const currentList = tab === 'all' ? allRankings : wcRankings;

  const rankMedal = (rank: number) => {
    if (rank === 1) return <Award size={18} style={{ color: '#FFD700' }} />;
    if (rank === 2) return <Award size={18} style={{ color: '#C0C0C0' }} />;
    if (rank === 3) return <Award size={18} style={{ color: '#CD7F32' }} />;
    return <span>{rank}</span>;
  };

  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal rm-ranking-modal" onClick={e => e.stopPropagation()}>
        <div className="rm-header">
          <span className="rm-title"><Trophy size={16} /> 랭킹</span>
          <button className="rm-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="rm-tabs">
          <button className={`rm-tab ${tab === 'all' ? 'rm-tab-active' : ''}`} onClick={() => setTab('all')}>
            전체
          </button>
          <button className={`rm-tab rm-tab-wc ${tab === 'wc' ? 'rm-tab-active rm-tab-wc-active' : ''}`} onClick={() => setTab('wc')}>
            <Anchor size={13} /> 고래상사
          </button>
        </div>

        <div className="rm-list">
          {loading ? (
            <div className="rm-loading">불러오는 중…</div>
          ) : currentList.length === 0 ? (
            <div className="rm-empty">{tab === 'wc' ? '고래상사 멤버 기록이 없습니다' : '등록된 기록이 없습니다'}</div>
          ) : (
            currentList.map(entry => {
              const isHighlight = highlightSoopId && entry.soopId.toLowerCase() === highlightSoopId.toLowerCase();
              return (
                <div key={entry.id} className={`rm-row ${isHighlight ? 'rm-row-highlight' : ''} ${entry.isWC ? 'rm-row-wc' : ''}`}>
                  <div className="rm-row-rank">{rankMedal(entry.rank)}</div>
                  <div className="rm-row-avatar">
                    {entry.profileImage
                      ? <img src={entry.profileImage} alt="" className="rm-avatar-img" />
                      : <div className="rm-avatar-placeholder"><User size={16} /></div>}
                  </div>
                  <div className="rm-row-name">
                    <span className="rm-row-nick">{entry.playerName}</span>
                  </div>
                  {entry.isWC && <div className="rm-wc-badge"><Anchor size={13} /></div>}
                  <div className="rm-row-score">{entry.score.toLocaleString()}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
