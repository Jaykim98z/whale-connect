import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  getFirestore, collection, getDocs, query, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FunctionsError } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);

export function trackEvent(name: string, params?: Record<string, unknown>) {
  try { logEvent(analytics, name, params); } catch { /* ignore */ }
}

// ── 고래상사 멤버 목록 ──
// 등록 창의 안내 문구 표시용. 실제 멤버 판정은 saveRanking(functions/src/index.ts)의 목록이 기준 — 두 목록을 함께 수정할 것
export const WC_MEMBER_IDS = [
  'xpdpfv2', 'kimmaren77', 'melodingding', 'bach023', 'gyeonjahee',
  'nlov555jij', 'doki0818', 'joaras2', 'ducke77',
  'gatgdf', 'soyoung6056', 'chae1hana', 'poippoi52',
  'sellkey', 'peuhaha', 'nororo',
];

export const isWCMember = (soopId: string | null | undefined): boolean => {
  if (!soopId) return false;
  return WC_MEMBER_IDS.includes(soopId.toLowerCase().trim());
};

// ── 타입 정의 ──
export interface RankingEntry {
  id: string;
  rank: number;
  playerName: string;
  soopId: string;
  profileImage: string | null;
  score: number;
  isWC: boolean;
  stageReached?: number;  // 도달한 스테이지 (저장용, 랭킹 표시 X)
  cleared?: boolean;      // 전 스테이지 클리어 여부 (왕관 표시용)
  timestamp: Timestamp | null;
  createdAt: string;
}

export interface SaveScoreResult {
  success: boolean;
  rank?: number;
  error?: 'LOWER_THAN_EXISTING' | 'TOP_100_REQUIRED' | 'NOT_FOUND' | 'UNKNOWN';
  message?: string;
  isNewRecord?: boolean;
  existingBest?: number;
  wcOnly?: boolean;  // WC 멤버이고 일반 TOP 100 미진입 (멤버 랭킹에만 등록됨)
}

// ── 랭킹 조회 ──
export async function getTopRankings(limitCount = 100): Promise<RankingEntry[]> {
  try {
    const q = query(collection(db, 'wc-rankings'), orderBy('score', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...(d.data() as Omit<RankingEntry, 'id' | 'rank'>) }));
  } catch { return []; }
}

export async function getWCRankings(limitCount = 100): Promise<RankingEntry[]> {
  try {
    const q = query(collection(db, 'wc-rankings-wc'), orderBy('score', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...(d.data() as Omit<RankingEntry, 'id' | 'rank'>) }));
  } catch { return []; }
}

// ── 랭킹 진입 가능 여부 ──
export async function checkRankingEligibility(score: number): Promise<{
  eligible: boolean; estimatedRank: number; currentCount: number; minScore: number;
}> {
  try {
    const q = query(collection(db, 'wc-rankings'), orderBy('score', 'desc'), limit(100));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const currentCount = docs.length;
    const higherCount = docs.filter(d => (d.data().score as number) > score).length;
    const estimatedRank = higherCount + 1;
    const minScore = currentCount >= 100 ? ((docs[docs.length - 1]?.data().score as number) ?? 0) : 0;
    const eligible = currentCount < 100 || score > minScore;
    return { eligible, estimatedRank, currentCount, minScore };
  } catch {
    return { eligible: true, estimatedRank: 1, currentCount: 0, minScore: 0 };
  }
}

// ── 점수 저장 (Cloud Function 경유 — 닉네임·프로필·멤버 여부는 서버가 결정) ──
const functions = getFunctions(app, 'asia-northeast3');

interface SaveRankingResponse {
  success: true;
  rank: number;
  isNewRecord: boolean;
  isWC: boolean;
  wcOnly: boolean;
}

const saveRankingFn = httpsCallable<
  { soopId: string; score: number; stageReached: number; cleared: boolean },
  SaveRankingResponse
>(functions, 'saveRanking');

export async function saveScore(
  score: number, soopId: string, stageReached: number, cleared: boolean,
): Promise<SaveScoreResult> {
  try {
    const { data } = await saveRankingFn({ soopId, score, stageReached, cleared });
    trackEvent('ranking_register', {
      score, rank: data.rank, is_wc: data.isWC, wc_only: data.wcOnly, is_update: data.isNewRecord,
    });
    return { success: true, rank: data.rank, isNewRecord: data.isNewRecord, wcOnly: data.wcOnly };
  } catch (e) {
    const err = e as FunctionsError;
    const details = (err.details ?? {}) as { existingBest?: number };
    switch (err.code) {
      case 'functions/already-exists':
        return { success: false, error: 'LOWER_THAN_EXISTING', message: err.message, existingBest: details.existingBest };
      case 'functions/failed-precondition':
        return { success: false, error: 'TOP_100_REQUIRED', message: err.message };
      case 'functions/not-found':
        return { success: false, error: 'NOT_FOUND', message: err.message };
      default:
        return { success: false, error: 'UNKNOWN', message: String(e) };
    }
  }
}
