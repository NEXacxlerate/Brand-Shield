import React from 'react';

interface TickRingProps {
  value: number;
  total?: number;
  color?: string;
  size?: number;
  label?: string;
}

export const TickRing: React.FC<TickRingProps> = ({
  value,
  total = 10,
  color = '#7F95FF',
  size = 110,
  label = 'Entities'
}) => {
  const numTicks = 64;
  const radius = size / 2;
  const tickLength = 9;
  const outerR = radius - 4;
  const innerR = outerR - tickLength;
  const center = radius;

  // Active ticks proportional to value / total
  const activeRatio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const activeTicks = value === 0 ? 0 : Math.max(2, Math.round(activeRatio * numTicks));

  const ticks = Array.from({ length: numTicks }).map((_, i) => {
    // start from top (-90 degrees)
    const angle = (i / numTicks) * 2 * Math.PI - Math.PI / 2;
    const x1 = center + innerR * Math.cos(angle);
    const y1 = center + innerR * Math.sin(angle);
    const x2 = center + outerR * Math.cos(angle);
    const y2 = center + outerR * Math.sin(angle);
    const isActive = i < activeTicks;

    return { x1, y1, x2, y2, isActive };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {ticks.map((t, idx) => (
          <line
            key={idx}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.isActive ? color : 'rgba(255,255,255,0.14)'}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        ))}
      </svg>
      {/* Centre big number + Entities */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        <div style={{ fontSize: '22px', fontWeight: 800, color: '#EDEDF2', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '10.5px', color: '#8B8B98', marginTop: '2px', fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
};
