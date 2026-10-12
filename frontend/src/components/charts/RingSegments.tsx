import React from 'react';

interface SegmentItem {
  label: string;
  count: number;
  color: string;
}

interface RingSegmentsProps {
  segments: SegmentItem[];
  centerValue?: string | number;
  centerCaption?: string;
  size?: number;
}

export const RingSegments: React.FC<RingSegmentsProps> = ({
  segments,
  centerValue = '100',
  centerCaption = 'Total Incidents',
  size = 170
}) => {
  const numTicks = 72;
  const radius = size / 2;
  const tickLength = 12;
  const outerR = radius - 6;
  const innerR = outerR - tickLength;
  const center = radius;

  const total = segments.reduce((acc, s) => acc + s.count, 0) || 1;

  // Assign ticks to segments based on share
  const ticksWithColor: string[] = [];
  segments.forEach((seg) => {
    const ticksForSeg = Math.round((seg.count / total) * numTicks);
    for (let i = 0; i < ticksForSeg; i++) {
      if (ticksWithColor.length < numTicks) {
        ticksWithColor.push(seg.color);
      }
    }
  });

  // Fill any remaining ticks with the last color or fallback
  while (ticksWithColor.length < numTicks) {
    ticksWithColor.push(segments[segments.length - 1]?.color || '#7F95FF');
  }

  const ticks = ticksWithColor.map((col, i) => {
    const angle = (i / numTicks) * 2 * Math.PI - Math.PI / 2;
    const x1 = center + innerR * Math.cos(angle);
    const y1 = center + innerR * Math.sin(angle);
    const x2 = center + outerR * Math.cos(angle);
    const y2 = center + outerR * Math.sin(angle);
    return { x1, y1, x2, y2, color: col };
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
            stroke={t.color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>
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
        <div style={{ fontSize: '26px', fontWeight: 800, color: '#EDEDF2', lineHeight: 1 }}>{centerValue}</div>
        <div style={{ fontSize: '11px', color: '#8B8B98', marginTop: '4px', fontWeight: 600 }}>{centerCaption}</div>
      </div>
    </div>
  );
};
