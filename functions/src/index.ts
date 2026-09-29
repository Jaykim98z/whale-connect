import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const RANKINGS = 'wc-rankings';
const WC_RANKINGS = 'wc-rankings-wc';
const TOP_N = 100;
const MIN_SCORE = 1;
const MAX_SCORE = 99_999;
const MAX_STAGE = 7;

// ── 고래상사 멤버 목록 — 멤버 여부 판정의 기준 (클라이언트 목록은 안내 표시용) ──
const WC_MEMBER_IDS = [
  'xpdpfv2', 'kimmaren77', 'melodingding', 'bach023', 'gyeonjahee',
  'nlov555jij', 'doki0818', 'joaras2', 'ducke77',
  'gatgdf', 'soyoung6056', 'chae1hana', 'poippoi52',
  'sellkey', 'peuhaha', 'nororo',
];

interface SaveRankingRequest {
  soopId: unknown;
  score: unknown;
  stageReached: unknown;
  cleared: unknown;
}

interface SaveRankingResult {
  success: true;
  rank: number;
  isNewRecord: boolean;
  isWC: boolean;
  wcOnly: boolean; // 멤버이고 전체 TOP 100 미진입 → 멤버 랭킹에만 등록됨
}

interface SoopProfile {
  nickname: string;
  profileImage: string | null;
}

interface SoopStationResponse {
  user_nick?: string;
  profile_image?: string;
  station?: { user_nick?: string; profile_image?: string };
}

// SOOP 방송국 API로 닉네임·프로필을 서버에서 직접 조회 (클라이언트 값은 신뢰하지 않음)
async function fetchSoopProfile(soopId: string): Promise<SoopProfile | null> {
  try {
    const res = await fetch(`https://bjapi.afreecatv.com/api/${encodeURIComponent(soopId)}/station`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (WhaleConnect ranking)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SoopStationResponse;
    const nickname = (data.user_nick || data.station?.user_nick || '').trim().slice(0, 50);
    if (!nickname) return null;
    const raw = data.profile_image || data.station?.profile_image || '';
    const profileImage = raw.startsWith('//') ? `https:${raw}` : /^https?:\/\//.test(raw) ? raw : null;
    return { nickname, profileImage };
  } catch {
    return null;
  }
}

// 전체 랭킹 TOP_N 밖으로 밀려난 문서 정리 (멤버 랭킹은 인원이 적어 정리하지 않음)
async function trimRankings(): Promise<void> {
  const overflow = await db.collection(RANKINGS).orderBy('score', 'desc').offset(TOP_N).get();
  if (overflow.empty) return;
  const batch = db.batch();
  overflow.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

/**
 * saveRanking — 랭킹 저장의 유일한 경로
 * 클라이언트 쓰기는 firestore.rules에서 전면 차단되어 있고, Admin SDK는 규칙을 우회한다.
 *
 * 등록 규칙:
 * - 아이디당 최고 점수 1개 (두 랭킹 중 더 높은 기록보다 높아야 갱신)
 * - 일반 사용자: 전체 TOP 100에 들 때만 등록
 * - 고래상사 멤버: 멤버 랭킹에는 항상 등록, 전체 랭킹은 TOP 100에 들 때만
 */
export const saveRanking = onCall<SaveRankingRequest, Promise<SaveRankingResult>>(
  // invoker: 'public' — 브라우저에서 호출하는 callable이므로 Cloud Run 공개 호출 권한 필요
  { region: 'asia-northeast3', invoker: 'public' },
  async (request) => {
    const { soopId, score, stageReached, cleared } = request.data;

    if (typeof soopId !== 'string' || typeof score !== 'number'
      || typeof stageReached !== 'number' || typeof cleared !== 'boolean') {
      throw new HttpsError('invalid-argument', '잘못된 데이터 형식입니다.');
    }
    if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
      throw new HttpsError('invalid-argument', `점수는 ${MIN_SCORE}~${MAX_SCORE} 사이 정수여야 합니다.`);
    }
    if (!Number.isInteger(stageReached) || stageReached < 1 || stageReached > MAX_STAGE) {
      throw new HttpsError('invalid-argument', `도달 스테이지는 1~${MAX_STAGE} 사이 정수여야 합니다.`);
    }
    const id = soopId.toLowerCase().trim();
    if (id.length < 1 || id.length > 50) {
      throw new HttpsError('invalid-argument', 'SOOP 아이디가 유효하지 않습니다.');
    }

    const profile = await fetchSoopProfile(id);
    if (!profile) {
      throw new HttpsError('not-found', 'SOOP 아이디를 확인할 수 없습니다.');
    }

    const isWC = WC_MEMBER_IDS.includes(id);

    const result = await db.runTransaction(async (tx) => {
      // 트랜잭션: 모든 읽기를 쓰기 전에 수행
      const existingSnap = await tx.get(db.collection(RANKINGS).where('soopId', '==', id));
      const wcExistingSnap = await tx.get(db.collection(WC_RANKINGS).where('soopId', '==', id));
      const topSnap = await tx.get(db.collection(RANKINGS).orderBy('score', 'desc').limit(TOP_N));

      const previous = [...existingSnap.docs, ...wcExistingSnap.docs];
      if (previous.length > 0) {
        const existingBest = Math.max(...previous.map(d => d.get('score') as number));
        if (score <= existingBest) {
          throw new HttpsError('already-exists', `이미 더 높은 점수(${existingBest})가 등록되어 있습니다.`, { existingBest });
        }
      }

      // 내 기존 기록을 제외한 TOP 100 기준으로 진입 여부 판정
      const others = topSnap.docs.filter(d => d.get('soopId') !== id);
      const minScore = others.length >= TOP_N ? (others[others.length - 1].get('score') as number) : 0;
      const eligible = others.length < TOP_N || score > minScore;
      if (!eligible && !isWC) {
        throw new HttpsError('failed-precondition', `TOP ${TOP_N} 진입을 위해 ${minScore + 1}점 이상이 필요합니다.`, { minScore });
      }

      previous.forEach(d => tx.delete(d.ref));

      const data = {
        score,
        playerName: profile.nickname,
        soopId: id,
        profileImage: profile.profileImage,
        isWC,
        stageReached,
        cleared,
        timestamp: FieldValue.serverTimestamp(),
        createdAt: new Date().toISOString(),
      };
      if (eligible) tx.set(db.collection(RANKINGS).doc(), data);
      if (isWC) tx.set(db.collection(WC_RANKINGS).doc(), data);

      return {
        rank: others.filter(d => (d.get('score') as number) > score).length + 1,
        isNewRecord: previous.length > 0,
        wcOnly: !eligible,
      };
    });

    // 정리는 부가 작업 — 실패해도 등록 결과에는 영향 없음
    await trimRankings().catch(() => {});

    return { success: true, isWC, ...result };
  },
);
