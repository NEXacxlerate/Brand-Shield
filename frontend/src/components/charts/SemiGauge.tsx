import React from 'react';

interface SemiGaugeProps {
  value: number; // 0 to 100
  label?: string; // e.g. "High Risk"
  sublabel?: string;
  size?: number;
}

export const SemiGauge: React.FC<SemiGaugeProps> = ({
  value = 78,
  label = 'High Risk',
  sublabel = 'Sum of weighted signals, capped at 100.',
  size = 260
}) => {
  const width = size;
  const height = size * 0.65;
  const cx = width / 2;
  const cy = height - 20;
  const radius = width * 0.38;
  const strokeWidth = 26;

  // 180 degree arc from 180deg (left, PI) to 0deg (right, 0)
  // angle for value: normalized 0..1 -> PI to 0
  const clamped = Math.max(0, Math.min(100, value));
  const needleAngle = Math.PI - (clamped / 100) * Math.PI; // in radians

  // Points for full background semicircle
  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius;
  const endY = cy;

  const bgPath = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;

  // Needle tip
  const needleLength = radius - 4;
  const needleX = cx + needleLength * Math.cos(needleAngle);
  const needleY = cy - needleLength * Math.sin(needleAngle);

  // Ticks at 0, 25, 50, 75, 100
  const tickAngles = [0, 0.25, 0.5, 0.75, 1];
  const ticks = tickAngles.map((pct) => {
    const ang = Math.PI - pct * Math.PI;
    const r1 = radius + strokeWidth / 2 + 4;
    const r2 = radius + strokeWidth / 2 + 10;
    return {
      x1: cx + r1 * Math.cos(ang),
      y1: cy - r1 * Math.sin(ang),
      x2: cx + r2 * Math.cos(ang),
      y2: cy - r2 * Math.sin(ang),
      pct
    };
  });

  const gradId = `gauge-grad-${Math.random().toString(36).substring(2, 9)}`;
  const blurId = `gauge-glow-${Math.random().toString(36).substring(2, 9)}`;

  // Color for pivot
  const pivotColor = clamped > 75 ? '#FF5C5C' : clamped > 50 ? '#FF9A4D' : clamped > 25 ? '#F5C542' : '#34D399';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="50%" stopColor="#F5C542" />
            <stop offset="100%" stopColor="#FF5C5C" />
          </linearGradient>
          <filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        {/* Track background */}
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Blurred colored glow arc behind */}
        <path
          d={bgPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#${blurId})`}
          opacity="0.6"
        />

        {/* Sharp colored arc */}
        <path
          d={bgPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Ticks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

        {/* Needle line */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="#FFFFFF"
          strokeWidth={2.8}
          strokeLinecap="round"
        />

        {/* Needle base circle */}
        <circle cx={cx} cy={cy} r={8} fill={pivotColor} stroke="#FFFFFF" strokeWidth={2} />
      </svg>

      {/* Value "78/100" and label below */}
      <div style={{ textAlign: 'center', marginTop: '-4px' }}>
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#EDEDF2' }}>
          {value}<span style={{ fontSize: '16px', color: '#8B8B98', fontWeight: 600 }}>/100</span>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: pivotColor, marginTop: '2px' }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: '11.5px', color: '#8B8B98', marginTop: '4px', maxWidth: '240px' }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
};
