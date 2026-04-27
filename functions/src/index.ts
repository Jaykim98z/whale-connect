import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

const db = getFirestore();

// ── 고래상사 멤버 목록 (firebase.ts와 동기화 유지) ──
const WC_MEMBER_IDS = [
  'xpdpfv2', 'kimmaren77', 'melodingding', 'bach023', 'gyeonjahee',
  'akdma9692', 'nlov555jij', 'doki0818', 'joaras2', 'ducke77',
  'gatgdf', 'soyoung6056', 'chae1hana', 'eunpp0', 'poippoi52', 'himuru',
];

// 이론적 최대 점수:
//   전 스테이지 페어 합계: (40+46+53+60+67) × 10 = 2,660점
//   클리어 보너스:  5 × 100 = 500점
//   시간 보너스: 넉넉하게 6,000점 (최대 600초 × 10)
//   합계 ≈ 9,160점 → 10,000점을 상한으로, 여유분 포함 99,999 허용
const MAX_SCORE = 99_999;
const MIN_SCORE = 1;

interface SaveScoreRequest {
  score: unknown;
  soopId: unknown;
  playerName: unknown;
  profileImage: unknown;
}

interface SaveScoreResult {
  success: boolean;
  rank: number;
  isNewRecord: boolean;
}

/**
 * saveRanking — 점수 저장 Cloud Function
 *
 * 클라이언트가 직접 Firestore에 쓰지 않고 이 함수를 통해서만 저장합니다.
 * Admin SDK는 Firestore 보안 규칙을 우회하므로,
 * 규칙에서 클라이언트 직접 쓰기를 차단해도 이 함수는 정상 동작합니다.
 */
export const saveRanking = onCall<SaveScoreRequest, Promise<SaveScoreResult>>(
  { region: 'asia-northeast3' }, // 서울 리전
  async (request) => {
    const { score, soopId, playerName, profileImage } = request.data;

    // ── 1. 기본 타입 검증 ──
    if (typeof score !== 'number' || typeof soopId !== 'string' || typeof playerName !== 'string') {
      throw new HttpsError('invalid-argument', '잘못된 데이터 형식입니다.');
    }

    // ── 2. 점수 범위 검증 ──
    if (!Number.isFinite(score) || !Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
      throw new HttpsError('invalid-argument', `점수는 ${MIN_SCORE}~${MAX_SCORE} 사이 정수여야 합니다.`);
    }

    // ── 3. soopId 검증 ──
    const normalizedId = soopId.toLowerCase().trim();
    if (normalizedId.length < 1 || normalizedId.length > 50) {
      throw new HttpsError('invalid-argument', 'SOOP ID가 유효하지 않습니다.');
    }

    // ── 4. playerName 검증 ──
    const trimmedName = playerName.trim().slice(0, 50);
    if (!trimmedName) {
      throw new HttpsError('invalid-argument', '닉네임이 유효하지 않습니다.');
    }

    // ── 5. profileImage 정제 (http/https URL만 허용, 그 외 null) ──
    const safeProfileImage =
      typeof profileImage === 'string' && /^https?:\/\/.+/.test(profileImage)
        ? profileImage
        : null;

    const isWC = WC_MEMBER_IDS.includes(normalizedId);

    // ── 6. 기존 기록 조회 ──
    const existingSnap = await db
      .collection('wc-rankings')
      .where('soopId', '==', normalizedId)
      .get();

    let isNewRecord = false;

    if (!existingSnap.empty) {
      const existingScore = existingSnap.docs[0].data().score as number;

      if (score <= existingScore) {
        throw new HttpsError(
          'already-exists',
          `이미 더 높은 점수(${existingScore})가 등록되어 있습니다.`,
        );
      }

      // 기존 기록 삭제 (더 높은 점수로 갱신)
      await existingSnap.docs[0].ref.delete();

      if (isWC) {
        const wcSnap = await db
          .collection('wc-rankings-wc')
          .where('soopId', '==', normalizedId)
          .get();
        if (!wcSnap.empty) {
          const batch = db.batch();
          wcSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      isNewRecord = true;
    }

    // ── 7. TOP 100 진입 가능 여부 ──
    const top100Snap = await db
      .collection('wc-rankings')
      .orderBy('score', 'desc')
      .limit(100)
      .get();

    const currentCount = top100Snap.size;
    let estimatedRank = 1;

    if (currentCount > 0) {
      estimatedRank = top100Snap.docs.filter(d => (d.data().score as number) > score).length + 1;

      if (currentCount >= 100) {
        const minScore = top100Snap.docs[currentCount - 1].data().score as number;
        if (score <= minScore) {
          throw new HttpsError(
            'failed-precondition',
            `TOP 100 진입을 위해 ${minScore + 1}점 이상이 필요합니다.`,
          );
        }
      }
    }

    // ── 8. 저장 ──
    const data = {
      score,
      playerName: trimmedName,
      soopId: normalizedId,
      profileImage: safeProfileImage,
      isWC,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(),
    };

    await db.collection('wc-rankings').add(data);
    if (isWC) await db.collection('wc-rankings-wc').add(data);

    // ── 9. TOP 100 초과 문서 정리 (WriteBatch) ──
    const allSnap = await db.collection('wc-rankings').orderBy('score', 'desc').get();
    if (allSnap.size > 100) {
      const batch = db.batch();
      allSnap.docs.slice(100).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    return { success: true, rank: estimatedRank, isNewRecord };
  },
);
