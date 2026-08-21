interface Props {
  scale: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
}

export default function BoardSizePanel({ scale, onIncrease, onDecrease, disabled }: Props) {
  return (
    <div className="bsp-panel" aria-label="보드 크기 조절">
      <button
        className="bsp-btn"
        onClick={onIncrease}
        disabled={disabled || scale >= 1.6}
        aria-label="보드 크게"
        title="보드 크게"
      >
        ＋
      </button>
      <span className="bsp-label">{Math.round(scale * 100)}%</span>
      <button
        className="bsp-btn"
        onClick={onDecrease}
        disabled={disabled || scale <= 0.6}
        aria-label="보드 작게"
        title="보드 작게"
      >
        －
      </button>
    </div>
  );
}
