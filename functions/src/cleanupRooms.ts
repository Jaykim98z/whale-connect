import type { Database } from 'firebase-admin/database';

export const STALE_ROOM_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/**
 * 만든 지 오래된 멀티플레이 방을 지운다.
 * 방은 마지막 사람이 "방 나가기"로 나갈 때만 지워지므로, 탭을 닫거나 접속이 끊겨 남은 방이 쌓인다.
 * meta/createdAt 색인(database.rules.json)으로 오래된 방만 골라 BATCH_SIZE개씩 지운다.
 * 반환값: 지운 방 수
 */
export async function deleteStaleRooms(db: Database, cutoff: number): Promise<number> {
  const rooms = db.ref('rooms');
  let deleted = 0;
  for (;;) {
    const snap = await rooms.orderByChild('meta/createdAt').endAt(cutoff).limitToFirst(BATCH_SIZE).get();
    const removals: Record<string, null> = {};
    snap.forEach(room => {
      if (room.key) removals[room.key] = null;
    });
    const count = Object.keys(removals).length;
    if (count === 0) return deleted;
    await rooms.update(removals);
    deleted += count;
    if (count < BATCH_SIZE) return deleted;
  }
}
