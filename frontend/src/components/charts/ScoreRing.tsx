import React from 'react';

interface ScoreRingProps {
  /** The real risk score, 0 to 100: the arc covers score/100 of the circle. */
  score: number;
  band?: string;
  size?: number;
  /** override the centre text (default: the score) */
  text?: string;
  /** small caption under the number (default "Risk"; pass '' for none) */
  caption?: string;
  /** override the arc colour (default: by risk band) */
  color?: string;
  stroke?: number;
  testId?: string;
}

const BAND_COLOR: Record<string, string> = { high: '#f0566a', medium: '#f59e55', low: '#4f9dff' };

/** Circular score badge of the design: a progress arc plus the number and a "Risk" label. */
export const ScoreRing: React.FC<ScoreRingProps> = ({ score, band = 'high', size = 76, text, caption = 'Risk', color: colorOverride, stroke = 7, testId }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, score / 100));
  const color = colorOverride ?? BAND_COLOR[band] ?? BAND_COLOR.high;
  return (
    <div className="score-ring" style={{ width: size, height: size }} role="img" aria-label={caption ? `${caption} score ${score} of 100` : `${score} percent`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-text">
        <span className="score-ring-num" data-testid={testId}>{text ?? score}</span>
        {caption && <span className="score-ring-lbl">{caption}</span>}
      </div>
    </div>
  );
};
