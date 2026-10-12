import React from 'react';

interface BarSparkProps {
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const BarSpark: React.FC<BarSparkProps> = ({
  data = [4, 7, 5, 8, 9, 12, 10, 14, 15],
  color = '#7F95FF',
  width = 96,
  height = 36
}) => {
  // Ensure exactly 9 bars
  const bars = data.slice(0, 9);
  while (bars.length < 9) {
    bars.push(Math.round(Math.random() * 10 + 5));
  }

  const max = Math.max(...bars, 1);
  const gap = 3;
  const barWidth = (width - gap * (bars.length - 1)) / bars.length;
  const filterId = `bar-blur-${Math.random().toString(36).substring(2, 9)}`;
  const gradId = `bar-grad-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Blurred background copy for glow at 50% */}
      <g filter={`url(#${filterId})`} opacity="0.5">
        {bars.map((v, i) => {
          const h = Math.max(4, (v / max) * (height - 4));
          const x = i * (barWidth + gap);
          const y = height - h;
          return (
            <rect
              key={`blur-${i}`}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={barWidth / 2}
              fill={color}
            />
          );
        })}
      </g>

      {/* Main sharp bars */}
      <g>
        {bars.map((v, i) => {
          const h = Math.max(4, (v / max) * (height - 4));
          const x = i * (barWidth + gap);
          const y = height - h;
          return (
            <rect
              key={`main-${i}`}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={barWidth / 2}
              fill={`url(#${gradId})`}
            />
          );
        })}
      </g>
    </svg>
  );
};
