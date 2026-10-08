import { VERSUS_TIME_LIMIT } from './versus';

// ── 멀티 방 규칙 (순수 함수) — DB 입출력은 services/room.ts ──

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_START = 2;
export const ROOM_CODE_LENGTH = 6;
export const NAME_MAX_LENGTH = 12;
export const START_DELAY_MS = 4000;      // 시작 버튼 → 출발까지 (3·2·1 카운트다운)
export const ROUND_END_GRACE_MS = 3000;  // 종료 시각 이후 마지막 점수 보고를 기다리는 여유

// 헷갈리는 글자(0/O, 1/I/L)를 뺀 방 코드 문자
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type RoomStatus = 'lobby' | 'playing';

export interface RoomMeta {
  hostId: string;
  status: RoomStatus;
  seed: number;
  startAt: number; // 서버 시각(ms) — 이 시각에 전원이 출발
  round: number;
  createdAt: number;
}

export interface RoomPlayer {
  id: string;
  name: string;
  soopId: string | null;
  profileImage: string | null;
  joinedAt: number;
  connected: boolean;
  score: number;
  progress: number; // 0~100
  scoredAt: number; // 마지막으로 점수가 바뀐 서버 시각 — 동점 순위용
  finished: boolean;
}

export interface Room {
  code: string;
  meta: RoomMeta;
  players: RoomPlayer[];
}

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)];
  return code;
}

/** 입력값을 방 코드 형식으로 정리. 형식이 맞지 않으면 null */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every(ch => CODE_CHARS.includes(ch)) ? code : null;
}

/** 순위: 점수 높은 순 → 그 점수에 먼저 도달한 순 → 먼저 입장한 순 */
export function rankPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) =>
    b.score - a.score || a.scoredAt - b.scoredAt || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

/** 방장이 될 사람: 접속 중인 사람 가운데 가장 먼저 들어온 사람 */
export function pickHost(players: RoomPlayer[]): string | null {
  const candidates = players.filter(p => p.connected).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  return candidates[0]?.id ?? null;
}

/** 방장이 없거나 끊겨서 승계가 필요한지 */
export function needsNewHost(room: Room): boolean {
  const host = room.players.find(p => p.id === room.meta.hostId);
  return !host || !host.connected;
}

export function roundEndAt(meta: RoomMeta): number {
  return meta.startAt + VERSUS_TIME_LIMIT * 1000;
}

/** 판이 끝났는지: 접속 중인 전원이 끝냈거나, 종료 시각에서 여유 시간이 지났을 때 */
export function isRoundOver(room: Room, now: number): boolean {
  if (room.meta.status !== 'playing') return false;
  if (now >= roundEndAt(room.meta) + ROUND_END_GRACE_MS) return true;
  const active = room.players.filter(p => p.connected);
  return active.length > 0 && active.every(p => p.finished);
}
