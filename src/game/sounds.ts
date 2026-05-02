// ── 음소거 상태 (localStorage 영속) ──
let _muted = false;
try { _muted = localStorage.getItem('wc-muted') === 'true'; } catch { /* SSR/보안 환경 무시 */ }

export function setMuted(val: boolean) {
  _muted = val;
  try { localStorage.setItem('wc-muted', String(val)); } catch {}
  if (val) pauseBGM();
  else      playBGM();
}
export function getMuted(): boolean { return _muted; }

// ── BGM ──
let _bgm: HTMLAudioElement | null = null;

function getBGM(): HTMLAudioElement {
  if (!_bgm) {
    _bgm = new Audio('/sounds/bgm.mp3');
    _bgm.loop   = true;
    _bgm.volume = 0.35;
  }
  return _bgm;
}

/** 인게임 BGM 재생 (음소거 중이면 무시) */
export function playBGM() {
  if (_muted) return;
  try { getBGM().play().catch(() => {}); } catch {}
}

/** BGM 일시정지 (위치 유지) */
export function pauseBGM() {
  try { _bgm?.pause(); } catch {}
}

/** BGM 정지 + 처음으로 되감기 */
export function stopBGM() {
  try {
    if (_bgm) { _bgm.pause(); _bgm.currentTime = 0; }
  } catch {}
}

/** BGM 볼륨 설정 (0~1) */
export function setBGMVolume(vol: number) {
  const clamped = Math.max(0, Math.min(1, vol));
  try { getBGM().volume = clamped; } catch {}
}

/** 현재 BGM 볼륨 반환 */
export function getBGMVolume(): number {
  try { return getBGM().volume; } catch { return 0.35; }
}

// ── AudioContext ──
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 매칭 성공음: 밝고 경쾌한 2음 상승 */
export function playMatchSuccess() {
  if (_muted) return;
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    const notes = [523, 784]; // C5 → G5
    notes.forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);

      const t = now + i * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.start(t);
      osc.stop(t + 0.15);
    });
  } catch { /* ignore */ }
}

/** 매칭 실패음: 낮고 둔탁한 단음 */
export function playMatchFail() {
  if (_muted) return;
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.start(now);
    osc.stop(now + 0.18);
  } catch { /* ignore */ }
}

/** 카드 선택음: 짧고 경쾌한 틱 */
export function playCardSelect() {
  if (_muted) return;
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.07);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch { /* ignore */ }
}
