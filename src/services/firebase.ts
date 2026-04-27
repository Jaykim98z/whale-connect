import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc,
  query, orderBy, limit, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';

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
export const WC_MEMBER_IDS = [
  'xpdpfv2', 'kimmaren77', 'melodingding', 'bach023', 'gyeonjahee',
  'akdma9692', 'nlov555jij', 'doki0818', 'joaras2', 'ducke77',
  'gatgdf', 'soyoung6056', 'chae1hana', 'eunpp0', 'poippoi52', 'himuru',
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
  timestamp: Timestamp | null;
  createdAt: string;
}

export interface SaveScoreResult {
  success: boolean;
  rank?: number;
  error?: string;
  message?: string;
  isNewRecord?: boolean;
  existingBest?: number;
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

// ── 점수 저장 ──
export async function saveScore(
  score: number, soopId: string, playerName: string, profileImage: string | null
): Promise<SaveScoreResult> {
  try {
    const normalizedId = soopId.toLowerCase().trim();
    const isWC = isWCMember(normalizedId);

    // 기존 기록 확인
    const existingQ = query(collection(db, 'wc-rankings'), where('soopId', '==', normalizedId));
    const existingSnap = await getDocs(existingQ);

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingScore = existingDoc.data().score as number;
      if (score <= existingScore) {
        return { success: false, error: 'LOWER_THAN_EXISTING', message: '이미 더 높은 점수가 등록되어 있습니다.', existingBest: existingScore };
      }
      await deleteDoc(doc(db, 'wc-rankings', existingDoc.id));
      if (isWC) {
        const wcQ = query(collection(db, 'wc-rankings-wc'), where('soopId', '==', normalizedId));
        const wcSnap = await getDocs(wcQ);
        for (const d of wcSnap.docs) await deleteDoc(doc(db, 'wc-rankings-wc', d.id));
      }
    }

    const eligibility = await checkRankingEligibility(score);
    if (!eligibility.eligible) {
      return { success: false, error: 'TOP_100_REQUIRED', message: `TOP 100 진입을 위해 ${eligibility.minScore + 1}점 이상이 필요합니다.` };
    }

    const data = { score, playerName, soopId: normalizedId, profileImage, isWC, timestamp: serverTimestamp(), createdAt: new Date().toISOString() };
    await addDoc(collection(db, 'wc-rankings'), data);
    if (isWC) await addDoc(collection(db, 'wc-rankings-wc'), data);

    await cleanupOldRankings();
    trackEvent('ranking_register', { score, rank: eligibility.estimatedRank, is_wc: isWC, is_update: !existingSnap.empty });

    return { success: true, rank: eligibility.estimatedRank, isNewRecord: !existingSnap.empty };
  } catch (e) {
    return { success: false, error: 'UNKNOWN', message: String(e) };
  }
}

async function cleanupOldRankings() {
  try {
    const q = query(collection(db, 'wc-rankings'), orderBy('score', 'desc'));
    const snap = await getDocs(q);
    if (snap.docs.length > 100) {
      for (const d of snap.docs.slice(100)) await deleteDoc(doc(db, 'wc-rankings', d.id));
    }
  } catch { /* ignore */ }
}
