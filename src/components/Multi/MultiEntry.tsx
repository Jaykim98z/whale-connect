import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, LogIn, Plus } from 'lucide-react';
import { NAME_MAX_LENGTH, normalizeRoomCode, ROOM_CODE_LENGTH } from '../../game/roomLogic';
import { createRoom, joinRoom, RoomError } from '../../services/room';
import type { PlayerProfile, RoomErrorCode } from '../../services/room';
import { fetchSoopUser } from '../../services/soopAPI';
import Footer from '../Footer/Footer';
import '../StartScreen.css';

const NAME_KEY = 'wc-mp-name';
const SOOP_KEY = 'wc-mp-soop';
const MODE_KEY = 'wc-mp-identity';

// 참가자 표시 방식 — 둘 중 하나만 쓴다
type IdentityMode = 'name' | 'soop';
const PROFILE_IMAGE_MAX_LENGTH = 300; // database.rules.json의 제한과 같아야 한다

const ROOM_ERRORS: Record<RoomErrorCode, string> = {
  'not-found': '방을 찾을 수 없습니다. 코드를 확인해 주세요.',
  'in-progress': '게임이 진행 중인 방입니다. 판이 끝난 뒤 다시 입장해 주세요.',
  full: '방이 가득 찼습니다.',
  unavailable: '방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
};

function loadSaved(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경 무시 */ }
}

export interface RoomSession {
  code: string;
  playerId: string;
}

interface Props {
  initialCode: string | null;
  notice: string | null;
  onJoined: (session: RoomSession) => void;
  onBack: () => void;
}

export default function MultiEntry({ initialCode, notice, onJoined, onBack }: Props) {
  const [name, setName] = useState(() => loadSaved(NAME_KEY));
  const [soopId, setSoopId] = useState(() => loadSaved(SOOP_KEY));
  const [mode, setMode] = useState<IdentityMode>(() => (loadSaved(MODE_KEY) === 'soop' ? 'soop' : 'name'));
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseMode = (next: IdentityMode) => {
    setMode(next);
    setError(null);
    save(MODE_KEY, next);
  };

  // 선택한 방식(닉네임 또는 SOOP 아이디) 하나로 참가자 정보를 만든다. 문제가 있으면 안내 문구를 띄우고 null
  async function buildProfile(): Promise<PlayerProfile | null> {
    if (mode === 'name') {
      const finalName = [...name.trim()].slice(0, NAME_MAX_LENGTH).join('');
      if (!finalName) {
        setError('닉네임을 입력해 주세요.');
        return null;
      }
      save(NAME_KEY, finalName);
      return { name: finalName, soopId: null, profileImage: null };
    }

    const soop = soopId.trim().toLowerCase();
    if (!/^[a-z0-9_]{1,50}$/.test(soop)) {
      setError(soop ? 'SOOP 아이디 형식이 올바르지 않습니다.' : 'SOOP 아이디를 입력해 주세요.');
      return null;
    }
    const info = await fetchSoopUser(soop);
    if (!info.isValid) {
      setError('SOOP 아이디를 확인할 수 없습니다. 닉네임으로 입장할 수도 있습니다.');
      return null;
    }
    const image = info.profileImage;
    const profileImage = image && image.startsWith('https://') && image.length <= PROFILE_IMAGE_MAX_LENGTH ? image : null;
    save(SOOP_KEY, soop);
    // 순위표 이름은 SOOP 닉네임을 쓴다
    return { name: [...info.nickname].slice(0, NAME_MAX_LENGTH).join(''), soopId: soop, profileImage };
  }

  async function run(action: (profile: PlayerProfile) => Promise<RoomSession>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await buildProfile();
      if (profile) onJoined(await action(profile));
    } catch (e) {
      setError(e instanceof RoomError ? ROOM_ERRORS[e.code] : '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const handleCreate = () => run(profile => createRoom(profile));

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setError(`방 코드는 ${ROOM_CODE_LENGTH}자리입니다.`);
      return;
    }
    void run(async profile => ({ code: normalized, ...(await joinRoom(normalized, profile)) }));
  };

  return (
    <div className="ss-screen">
      <div className="ss-content">
        <div className="ss-card mp-card">
          <div className="ss-top-bar" />
          <button className="mp-back" type="button" onClick={onBack}>
            <ArrowLeft size={15} /> 타이틀로
          </button>

          <h1 className="mp-title">멀티플레이</h1>
          <p className="mp-desc">같은 보드를 각자 풀어 2분 동안 점수를 겨룹니다. 최대 8명.</p>

          {notice && <p className="mp-notice">{notice}</p>}

          <div className="mp-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'name'}
              className={`mp-tab ${mode === 'name' ? 'mp-tab-on' : ''}`}
              onClick={() => chooseMode('name')}
            >닉네임으로</button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'soop'}
              className={`mp-tab ${mode === 'soop' ? 'mp-tab-on' : ''}`}
              onClick={() => chooseMode('soop')}
            >SOOP 아이디로</button>
          </div>

          {mode === 'name' ? (
            <label className="mp-field">
              <span className="mp-label">닉네임</span>
              <input
                className="mp-input"
                value={name}
                maxLength={NAME_MAX_LENGTH}
                placeholder="순위표에 표시될 이름"
                onChange={e => setName(e.target.value)}
              />
            </label>
          ) : (
            <label className="mp-field">
              <span className="mp-label">SOOP 아이디 <small>(SOOP 닉네임과 프로필 사진으로 표시됩니다)</small></span>
              <input
                className="mp-input"
                value={soopId}
                maxLength={50}
                placeholder="SOOP 아이디"
                autoCapitalize="none"
                onChange={e => setSoopId(e.target.value)}
              />
            </label>
          )}

          {error && <p className="mp-error">{error}</p>}

          <button className="ss-btn-start" type="button" onClick={handleCreate} disabled={busy}>
            <Plus size={18} /> 방 만들기
          </button>

          <div className="mp-or">또는 코드로 입장</div>

          <form className="mp-join" onSubmit={handleJoin}>
            <input
              className="mp-input mp-input-code"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="방 코드"
              autoCapitalize="characters"
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
            <button className="mp-join-btn" type="submit" disabled={busy}>
              <LogIn size={16} /> 입장
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
