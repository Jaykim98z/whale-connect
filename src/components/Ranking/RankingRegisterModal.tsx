import { useState, useEffect, useRef } from 'react';
import { Trophy, X, Sparkles, User, Check } from 'lucide-react';
import { fetchSoopUser } from '../../services/soopAPI';
import type { SoopUserInfo } from '../../services/soopAPI';
import { saveScore, checkRankingEligibility } from '../../services/firebase';
import './RankingModal.css';

interface Props {
  score: number;
  onClose: () => void;
  onSuccess: (rank: number, soopId: string) => void;
}

type Phase = 'input' | 'submitting' | 'done' | 'error';

export default function RankingRegisterModal({ score, onClose, onSuccess }: Props) {
  const [soopId, setSoopId] = useState('');
  const [userInfo, setUserInfo] = useState<SoopUserInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('input');
  const [errorMsg, setErrorMsg] = useState('');
  const [eligibility, setEligibility] = useState<{
    eligible: boolean; estimatedRank: number; currentCount: number; minScore: number;
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setUserInfo(null);
    if (soopId.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setValidating(true);
      const info = await fetchSoopUser(soopId.trim());
      setValidating(false);
      if (info.isValid) setUserInfo(info);
    }, 500);
  }, [soopId]);

  useEffect(() => {
    checkRankingEligibility(score).then(setEligibility);
  }, [score]);

  const handleRegister = async () => {
    if (!userInfo) return;
    setPhase('submitting');
    const result = await saveScore(score, userInfo.soopId, userInfo.nickname, userInfo.profileImage);
    if (result.success && result.rank !== undefined) {
      setPhase('done');
      setTimeout(() => { onSuccess(result.rank!, userInfo.soopId); onClose(); }, 1800);
    } else {
      setPhase('error');
      if (result.error === 'LOWER_THAN_EXISTING') {
        setErrorMsg(`이미 더 높은 점수(${result.existingBest?.toLocaleString()}점)가 등록되어 있습니다.`);
      } else if (result.error === 'TOP_100_REQUIRED') {
        setErrorMsg(result.message ?? 'TOP 100 진입 불가');
      } else {
        setErrorMsg('등록 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  const rankLabel = eligibility
    ? eligibility.eligible ? `예상 순위 ${eligibility.estimatedRank}위` : `TOP 100 진입 불가 (100위: ${eligibility.minScore.toLocaleString()}점)`
    : '순위 계산 중...';

  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={e => e.stopPropagation()}>
        <div className="rm-header">
          <span className="rm-title"><Trophy size={16} /> 랭킹 등록</span>
          <button className="rm-close-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="rm-score-row">
          <span className="rm-score-label">최종 점수</span>
          <span className="rm-score-value">{score.toLocaleString()}</span>
        </div>

        <div className={`rm-eligibility ${eligibility && !eligibility.eligible ? 'rm-ineligible' : ''}`}>
          {rankLabel}
        </div>

        {phase === 'done' ? (
          <div className="rm-done">
            <div className="rm-done-icon"><Sparkles size={40} color="#ffd166" /></div>
            <div className="rm-done-text">등록 완료!</div>
            <div className="rm-done-rank">{eligibility?.estimatedRank ?? '?'}위</div>
          </div>
        ) : phase === 'error' ? (
          <div className="rm-error-box">
            <div className="rm-error-msg">{errorMsg}</div>
            <button className="rm-btn rm-btn-secondary" onClick={() => { setPhase('input'); setErrorMsg(''); }}>
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <div className="rm-field">
              <label className="rm-field-label">SOOP 아이디 <span className="rm-required">*필수</span></label>
              <div className="rm-input-wrap">
                <input
                  className="rm-input"
                  type="text"
                  placeholder="SOOP 아이디를 입력하세요"
                  value={soopId}
                  onChange={e => setSoopId(e.target.value)}
                  disabled={phase === 'submitting'}
                  autoComplete="off"
                  autoFocus
                />
                {validating && <span className="rm-checking">확인 중…</span>}
              </div>
              <p className="rm-field-hint">※ SOOP 아이디로만 등록 가능합니다</p>
            </div>

            {userInfo && (
              <div className="rm-profile-preview">
                <div className="rm-profile-img-wrap">
                  {userInfo.profileImage
                    ? <img src={userInfo.profileImage} alt="프로필" className="rm-profile-img" />
                    : <div className="rm-profile-placeholder"><User size={22} /></div>}
                </div>
                <div className="rm-profile-info">
                  <span className="rm-profile-nick">{userInfo.nickname}</span>
                  <span className="rm-profile-id">@{userInfo.soopId}</span>
                </div>
                <span className="rm-profile-check"><Check size={18} /></span>
              </div>
            )}

            <button
              className="rm-btn rm-btn-primary"
              disabled={!userInfo || phase === 'submitting' || (eligibility !== null && !eligibility.eligible)}
              onClick={handleRegister}
            >
              {phase === 'submitting' ? '등록 중…' : '랭킹 등록하기'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
