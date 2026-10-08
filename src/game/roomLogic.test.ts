import { describe, expect, it } from 'vitest';
import {
  generateRoomCode, isRoundOver, needsNewHost, normalizeRoomCode, pickHost, rankPlayers, ROOM_CODE_LENGTH,
  ROUND_END_GRACE_MS, roundEndAt,
} from './roomLogic';
import type { Room, RoomPlayer } from './roomLogic';
import { createRng } from './rng';
import { VERSUS_TIME_LIMIT } from './versus';

function player(id: string, overrides: Partial<RoomPlayer> = {}): RoomPlayer {
  return {
    id, name: id, soopId: null, profileImage: null, joinedAt: 0, connected: true,
    score: 0, progress: 0, scoredAt: 0, finished: false, ...overrides,
  };
}

function room(players: RoomPlayer[], overrides: Partial<Room['meta']> = {}): Room {
  return {
    code: 'ABCDEF',
    meta: { hostId: players[0]?.id ?? '', status: 'playing', seed: 1, startAt: 1000, round: 1, createdAt: 0, ...overrides },
    players,
  };
}

describe('방 코드', () => {
  it('정해진 길이의 코드를 만들고, 그 코드는 정규화를 통과한다', () => {
    const rng = createRng(7).next;
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });

  it('소문자와 앞뒤 공백을 정리한다', () => {
    expect(normalizeRoomCode('  abc234 ')).toBe('ABC234');
  });

  it('길이가 다르거나 쓰지 않는 글자가 있으면 null', () => {
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('ABC2345')).toBeNull();
    expect(normalizeRoomCode('ABCDE0')).toBeNull(); // 0은 O와 헷갈려 제외
    expect(normalizeRoomCode('ABC-DE')).toBeNull();
  });
});

describe('rankPlayers', () => {
  it('점수가 높은 순', () => {
    const ranked = rankPlayers([player('a', { score: 10 }), player('b', { score: 30 }), player('c', { score: 20 })]);
    expect(ranked.map(p => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('동점이면 그 점수에 먼저 도달한 사람이 위', () => {
    const ranked = rankPlayers([
      player('late', { score: 50, scoredAt: 2000 }),
      player('early', { score: 50, scoredAt: 1500 }),
    ]);
    expect(ranked.map(p => p.id)).toEqual(['early', 'late']);
  });

  it('점수와 도달 시각이 같으면 먼저 입장한 사람이 위', () => {
    const ranked = rankPlayers([player('second', { joinedAt: 20 }), player('first', { joinedAt: 10 })]);
    expect(ranked.map(p => p.id)).toEqual(['first', 'second']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const players = [player('a', { score: 1 }), player('b', { score: 2 })];
    rankPlayers(players);
    expect(players.map(p => p.id)).toEqual(['a', 'b']);
  });
});

describe('방장 승계', () => {
  it('접속 중인 사람 가운데 가장 먼저 들어온 사람을 고른다', () => {
    const players = [
      player('gone', { joinedAt: 1, connected: false }),
      player('third', { joinedAt: 30 }),
      player('second', { joinedAt: 20 }),
    ];
    expect(pickHost(players)).toBe('second');
  });

  it('접속 중인 사람이 없으면 null', () => {
    expect(pickHost([player('a', { connected: false })])).toBeNull();
  });

  it('방장이 접속 중이면 승계가 필요 없다', () => {
    expect(needsNewHost(room([player('host'), player('b')]))).toBe(false);
  });

  it('방장이 끊겼거나 목록에 없으면 승계가 필요하다', () => {
    expect(needsNewHost(room([player('host', { connected: false }), player('b')]))).toBe(true);
    expect(needsNewHost(room([player('b')], { hostId: 'host' }))).toBe(true);
  });
});

describe('isRoundOver', () => {
  const endAt = 1000 + VERSUS_TIME_LIMIT * 1000;

  it('종료 시각은 시작 시각 + 제한 시간', () => {
    expect(roundEndAt(room([player('a')]).meta)).toBe(endAt);
  });

  it('접속 중인 전원이 끝내면 종료', () => {
    const r = room([player('a', { finished: true }), player('b', { finished: true })]);
    expect(isRoundOver(r, 5000)).toBe(true);
  });

  it('한 명이라도 진행 중이면 종료가 아니다', () => {
    const r = room([player('a', { finished: true }), player('b')]);
    expect(isRoundOver(r, 5000)).toBe(false);
  });

  it('끊긴 사람은 기다리지 않는다', () => {
    const r = room([player('a', { finished: true }), player('b', { connected: false })]);
    expect(isRoundOver(r, 5000)).toBe(true);
  });

  it('종료 시각에서 여유 시간이 지나면 보고가 없어도 종료', () => {
    const r = room([player('a'), player('b')]);
    expect(isRoundOver(r, endAt + ROUND_END_GRACE_MS - 1)).toBe(false);
    expect(isRoundOver(r, endAt + ROUND_END_GRACE_MS)).toBe(true);
  });

  it('대기실 상태에서는 종료가 아니다', () => {
    const r = room([player('a', { finished: true })], { status: 'lobby' });
    expect(isRoundOver(r, endAt + 99999)).toBe(false);
  });
});
