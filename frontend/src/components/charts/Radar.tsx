import React from 'react';

interface RadarAxis {
  axis: string;
  current: number; // 0..1
  baseline?: number; // 0..1
}

interface RadarProps {
  axes: RadarAxis[];
  size?: number;
}

export const Radar: React.FC<RadarProps> = ({
  axes,
  size = 300
}) => {
  const center = size / 2;
  const radius = size * 0.38;
  const numAxes = axes.length;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const getCoordinates = (index: number, value: number) => {
    // 6 axes evenly distributed, starting at top (-PI/2)
    const angle = (index / numAxes) * 2 * Math.PI - Math.PI / 2;
    const x = center + radius * value * Math.cos(angle);
    const y = center + radius * value * Math.sin(angle);
    return { x, y };
  };

  // Build grid rings polygons
  const gridPolygons = rings.map((r) => {
    return Array.from({ length: numAxes })
      .map((_, i) => {
        const { x, y } = getCoordinates(i, r);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  // Current series polygon
  const currentPoints = axes
    .map((item, i) => {
      const { x, y } = getCoordinates(i, item.current);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Baseline comparison polygon
  const baselinePoints = axes
    .map((item, i) => {
      const { x, y } = getCoordinates(i, item.baseline || 0.5);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        {/* Grid rings */}
        {gridPolygons.map((pts, idx) => (
          <polygon
            key={`ring-${idx}`}
            points={pts}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={1}
          />
        ))}

        {/* 6 Radial Axes */}
        {axes.map((_, i) => {
          const { x, y } = getCoordinates(i, 1.0);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={1}
            />
          );
        })}

        {/* Comparison dashed polygon (violet #A78BFA) */}
        <polygon
          points={baselinePoints}
          fill="none"
          stroke="#A78BFA"
          strokeWidth={1.8}
          strokeDasharray="4 3"
        />

        {/* Current campaign filled polygon (#6C86FF 25% opacity) */}
        <polygon
          points={currentPoints}
          fill="rgba(108, 134, 255, 0.25)"
          stroke="#6C86FF"
          strokeWidth={2.4}
        />

        {/* Current point dots */}
        {axes.map((item, i) => {
          const { x, y } = getCoordinates(i, item.current);
          return (
            <circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={4}
              fill="#7F95FF"
              stroke="#0E0E12"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Axis labels with offset */}
        {axes.map((item, i) => {
          const angle = (i / numAxes) * 2 * Math.PI - Math.PI / 2;
          const labelDist = radius + 22;
          const lx = center + labelDist * Math.cos(angle);
          const ly = center + labelDist * Math.sin(angle);
          let textAnchor: 'middle' | 'start' | 'end' = 'middle';
          if (Math.cos(angle) > 0.3) textAnchor = 'start';
          if (Math.cos(angle) < -0.3) textAnchor = 'end';

          return (
            <text
              key={`label-${i}`}
              x={lx}
              y={ly + 4}
              textAnchor={textAnchor}
              fill="#A4A4B0"
              fontSize="11.5"
              fontWeight="600"
              fontFamily="Manrope"
            >
              {item.axis} ({Math.round(item.current * 100)}%)
            </text>
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '3px', background: '#6C86FF', borderRadius: '2px' }}></span>
          <span style={{ color: '#EDEDF2' }}>This campaign (C-1)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '0px', borderTop: '2px dashed #A78BFA' }}></span>
          <span style={{ color: '#A4A4B0' }}>Closest known playbook</span>
        </div>
      </div>
    </div>
  );
};
