interface Props {
  countdown: number;
}

export default function CountdownOverlay({ countdown }: Props) {
  return (
    <div className="countdown-overlay">
      <div className="countdown-number" key={countdown}>
        {countdown === 0 ? 'GO!' : countdown}
      </div>
    </div>
  );
}
