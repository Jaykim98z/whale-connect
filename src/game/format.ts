export function toSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatTime(ms: number): string {
  const sec = toSeconds(ms);
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
