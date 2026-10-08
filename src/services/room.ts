import {
  child, connectDatabaseEmulator, get, getDatabase, onDisconnect, onValue, ref, remove, runTransaction,
  serverTimestamp, set, update,
} from 'firebase/database';
import type { Database } from 'firebase/database';
import {
  generateRoomCode, MAX_PLAYERS, START_DELAY_MS,
} from '../game/roomLogic';
import type { Room, RoomMeta, RoomPlayer, RoomStatus } from '../game/roomLogic';
import { app } from './firebase';

// ── 멀티 방 — Realtime Database 입출력 ──
// 구조: rooms/{code}/meta, rooms/{code}/players/{playerId}  (규칙: database.rules.json)

const DATABASE_URL: string | undefined = import.meta.env.VITE_FIREBASE_DATABASE_URL;
// 로컬 개발용: `firebase emulators:start --only database` 에 붙는다
const EMULATOR_PORT: string | undefined = import.meta.env.DEV ? import.meta.env.VITE_DATABASE_EMULATOR_PORT : undefined;

/** DB 주소가 설정되지 않은 환경에서는 멀티플레이 진입점을 숨긴다 */
export const isMultiplayerAvailable = Boolean(DATABASE_URL || EMULATOR_PORT);

export type RoomErrorCode = 'not-found' | 'in-progress' | 'full' | 'unavailable';

export class RoomError extends Error {
  code: RoomErrorCode;
  constructor(code: RoomErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface PlayerProfile {
  name: string;
  soopId: string | null;
  profileImage: string | null;
}

let db: Database | null = null;
let serverTimeOffset = 0;

function database(): Database {
  if (db) return db;
  db = DATABASE_URL ? getDatabase(app, DATABASE_URL) : getDatabase(app);
  if (EMULATOR_PORT) connectDatabaseEmulator(db, '127.0.0.1', Number(EMULATOR_PORT));
  onValue(ref(db, '.info/serverTimeOffset'), snap => { serverTimeOffset = Number(snap.val()) || 0; });
  return db;
}

const roomRef = (code: string) => ref(database(), `rooms/${code}`);
const playerRef = (code: string, playerId: string) => ref(database(), `rooms/${code}/players/${playerId}`);

/** 서버 시각 추정값(ms) — 전원의 시작·종료 시각을 맞추는 기준 */
export function serverNow(): number {
  return Date.now() + serverTimeOffset;
}

function newPlayerId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function newPlayerData(profile: PlayerProfile) {
  return {
    name: profile.name,
    // RTDB는 null을 저장하지 않으므로 값이 있을 때만 넣는다
    ...(profile.soopId ? { soopId: profile.soopId } : {}),
    ...(profile.profileImage ? { profileImage: profile.profileImage } : {}),
    joinedAt: serverTimestamp(),
    connected: true,
    score: 0,
    progress: 0,
    scoredAt: serverTimestamp(),
    finished: false,
  };
}

interface RawPlayer extends Partial<Omit<RoomPlayer, 'id'>> {}
interface RawRoom {
  meta?: Partial<RoomMeta>;
  players?: Record<string, RawPlayer>;
}

function parseRoom(code: string, raw: RawRoom | null): Room | null {
  if (!raw?.meta) return null;
  const { meta } = raw;
  const players: RoomPlayer[] = Object.entries(raw.players ?? {}).map(([id, p]) => ({
    id,
    name: p.name ?? '',
    soopId: p.soopId ?? null,
    profileImage: p.profileImage ?? null,
    joinedAt: p.joinedAt ?? 0,
    connected: p.connected ?? false,
    score: p.score ?? 0,
    progress: p.progress ?? 0,
    scoredAt: p.scoredAt ?? 0,
    finished: p.finished ?? false,
  }));
  return {
    code,
    meta: {
      hostId: meta.hostId ?? '',
      status: (meta.status ?? 'lobby') as RoomStatus,
      seed: meta.seed ?? 0,
      startAt: meta.startAt ?? 0,
      round: meta.round ?? 0,
      createdAt: meta.createdAt ?? 0,
    },
    players,
  };
}

export async function createRoom(profile: PlayerProfile): Promise<{ code: string; playerId: string }> {
  const playerId = newPlayerId();
  // 코드가 겹치면 다시 뽑는다 — 트랜잭션으로 빈 자리에만 만든다
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const result = await runTransaction(roomRef(code), current => {
      if (current !== null) return undefined;
      return {
        meta: { hostId: playerId, status: 'lobby', seed: 0, startAt: 0, round: 0, createdAt: serverTimestamp() },
        players: { [playerId]: newPlayerData(profile) },
      };
    });
    if (result.committed) return { code, playerId };
  }
  throw new RoomError('unavailable');
}

export async function joinRoom(code: string, profile: PlayerProfile): Promise<{ playerId: string }> {
  const room = parseRoom(code, (await get(roomRef(code))).val());
  if (!room) throw new RoomError('not-found');
  if (room.meta.status !== 'lobby') throw new RoomError('in-progress');
  if (room.players.length >= MAX_PLAYERS) throw new RoomError('full');
  const playerId = newPlayerId();
  await set(playerRef(code, playerId), newPlayerData(profile));
  return { playerId };
}

export function subscribeRoom(code: string, onChange: (room: Room | null) => void): () => void {
  return onValue(roomRef(code), snap => onChange(parseRoom(code, snap.val())));
}

/** 방에서 나간다. 마지막 사람이면 방도 지운다 */
export async function leaveRoom(code: string, playerId: string): Promise<void> {
  const me = playerRef(code, playerId);
  await onDisconnect(me).cancel();
  await remove(me);
  const rest = await get(child(roomRef(code), 'players'));
  if (!rest.exists()) await remove(roomRef(code));
}

/**
 * 접속이 끊겼을 때의 처리를 서버에 등록한다. (재접속할 때마다 다시 등록)
 * - 대기실: 내 항목을 지운다
 * - 플레이 중: connected=false만 남겨 순위표에 점수를 유지한다
 */
export function watchPresence(code: string, playerId: string, status: RoomStatus): () => void {
  const me = playerRef(code, playerId);
  return onValue(ref(database(), '.info/connected'), snap => {
    if (snap.val() !== true) return;
    void (async () => {
      try {
        await onDisconnect(me).cancel();
        if (status === 'lobby') await onDisconnect(me).remove();
        else await onDisconnect(child(me, 'connected')).set(false);
        // 내 항목이 이미 지워졌다면 규칙이 이 쓰기를 거부한다 (필수 필드 없음)
        await update(me, { connected: true });
      } catch { /* 방에서 빠진 상태 — useRoom이 감지해 입장 화면으로 돌려보낸다 */ }
    })();
  });
}

/** 방장: 새 판 시작 — 시드·시작 시각을 정하고 전원의 점수를 초기화한다 */
export async function startRound(room: Room): Promise<void> {
  const changes: Record<string, unknown> = {
    'meta/status': 'playing',
    'meta/seed': Math.floor(Math.random() * 0x100000000),
    'meta/startAt': serverNow() + START_DELAY_MS,
    'meta/round': room.meta.round + 1,
  };
  for (const p of room.players) {
    changes[`players/${p.id}/score`] = 0;
    changes[`players/${p.id}/progress`] = 0;
    changes[`players/${p.id}/finished`] = false;
    changes[`players/${p.id}/scoredAt`] = serverTimestamp();
  }
  await update(roomRef(room.code), changes);
}

/** 방장: 대기실로 — 끊긴 사람의 항목은 지운다 */
export async function returnToLobby(room: Room): Promise<void> {
  const changes: Record<string, unknown> = { 'meta/status': 'lobby' };
  for (const p of room.players) {
    if (!p.connected) changes[`players/${p.id}`] = null;
  }
  await update(roomRef(room.code), changes);
}

/** 내 점수 보고. scoredAt은 점수가 바뀔 때만 갱신한다 (동점 순위 기준) */
export async function reportScore(
  code: string,
  playerId: string,
  report: { score: number; progress: number; finished: boolean },
  scoreChanged: boolean,
): Promise<void> {
  try {
    await update(playerRef(code, playerId), {
      ...report,
      ...(scoreChanged ? { scoredAt: serverTimestamp() } : {}),
    });
  } catch { /* 방에서 빠진 뒤의 늦은 보고는 규칙이 거부한다 */ }
}

/** 방장 승계 — 여러 명이 동시에 시도해도 한 명만 성공한다 */
export async function claimHost(code: string, playerId: string, previousHostId: string): Promise<void> {
  await runTransaction(child(roomRef(code), 'meta/hostId'), current =>
    (current === previousHostId ? playerId : undefined));
}
