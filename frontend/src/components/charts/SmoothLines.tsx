import React from 'react';

export interface DataPoint {
  label: string;
  observed?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
  series2?: number;
  series3?: number;
}

interface SmoothLinesProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  forecastSplitIndex?: number; // index where vertical 'forecast (estimate)' marker sits
  showBand?: boolean;
  solidColor?: string;
  forecastColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
  yMax?: number;
}

export const SmoothLines: React.FC<SmoothLinesProps> = ({
  data,
  width = 620,
  height = 220,
  forecastSplitIndex = 6,
  showBand = true,
  solidColor = '#FF5C5C',
  forecastColor = '#A78BFA',
  secondaryColor = '#5AA9FF',
  tertiaryColor = '#34D399',
  yMax = 24
}) => {
  const padLeft = 40;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 35;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (idx: number) => padLeft + (idx / (data.length - 1)) * chartW;
  const getY = (val: number) => padTop + chartH - (val / yMax) * chartH;

  // Horizontal dashed grid lines
  const gridSteps = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  // Helper for Catmull-Rom or cubic Bezier
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return '';
    let p = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      p += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return p;
  };

  // Observed points (up to forecastSplitIndex)
  const observedPts: { x: number; y: number }[] = [];
  data.forEach((d, i) => {
    if (d.observed !== undefined && i <= forecastSplitIndex) {
      observedPts.push({ x: getX(i), y: getY(d.observed) });
    }
  });

  // Forecast points (from forecastSplitIndex to end)
  const forecastPts: { x: number; y: number }[] = [];
  data.forEach((d, i) => {
    if (i >= forecastSplitIndex && (d.forecast !== undefined || d.observed !== undefined)) {
      const val = d.forecast !== undefined ? d.forecast : d.observed!;
      forecastPts.push({ x: getX(i), y: getY(val) });
    }
  });

  // Shaded confidence band (upper & lower)
  let bandPath = '';
  if (showBand) {
    const upperPts: { x: number; y: number }[] = [];
    const lowerPts: { x: number; y: number }[] = [];
    data.forEach((d, i) => {
      if (i >= forecastSplitIndex && d.upper !== undefined && d.lower !== undefined) {
        upperPts.push({ x: getX(i), y: getY(d.upper) });
        lowerPts.push({ x: getX(i), y: getY(d.lower) });
      }
    });
    if (upperPts.length > 1 && lowerPts.length > 1) {
      const topPath = createSmoothPath(upperPts);
      const bottomRev = [...lowerPts].reverse();
      let bottomPath = '';
      bottomRev.forEach((pt) => {
        bottomPath += ` L ${pt.x},${pt.y}`;
      });
      bandPath = `${topPath} ${bottomPath} Z`;
    }
  }

  // Hatch pattern ID
  const patternId = `hatch-${Math.random().toString(36).substring(2, 9)}`;

  // Observed area for vertical hatch fill
  let hatchAreaPath = '';
  if (observedPts.length > 1) {
    const lineP = createSmoothPath(observedPts);
    hatchAreaPath = `${lineP} L ${observedPts[observedPts.length - 1].x},${padTop + chartH} L ${observedPts[0].x},${padTop + chartH} Z`;
  }

  // Split x position
  const splitX = getX(forecastSplitIndex);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', maxHeight: `${height}px`, display: 'block' }}
      >
        <defs>
          <pattern id={patternId} width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255, 92, 92, 0.22)" strokeWidth="1.2" />
          </pattern>
        </defs>

        {/* Dashed horizontal grid */}
        {gridSteps.map((val, idx) => (
          <g key={`grid-${idx}`}>
            <line
              x1={padLeft}
              y1={getY(val)}
              x2={width - padRight}
              y2={getY(val)}
              stroke="rgba(255, 255, 255, 0.08)"
              strokeDasharray="4 4"
            />
            <text
              x={padLeft - 8}
              y={getY(val) + 4}
              textAnchor="end"
              fill="#8B8B98"
              fontSize="11"
              fontFamily="Manrope"
            >
              {Math.round(val)}
            </text>
          </g>
        ))}

        {/* Shaded confidence band */}
        {bandPath && (
          <path d={bandPath} fill="rgba(167, 139, 250, 0.12)" />
        )}

        {/* Vertical hatch fill under solid observed line */}
        {hatchAreaPath && (
          <path d={hatchAreaPath} fill={`url(#${patternId})`} />
        )}

        {/* Forecast vertical marker */}
        {forecastSplitIndex > 0 && forecastSplitIndex < data.length - 1 && (
          <g>
            <line
              x1={splitX}
              y1={padTop}
              x2={splitX}
              y2={padTop + chartH}
              stroke="#A78BFA"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <text
              x={splitX}
              y={padTop - 6}
              textAnchor="middle"
              fill="#A78BFA"
              fontSize="10.5"
              fontWeight="600"
              fontFamily="Manrope"
            >
              forecast (estimate)
            </text>
          </g>
        )}

        {/* Solid observed series */}
        {observedPts.length > 1 && (
          <path
            d={createSmoothPath(observedPts)}
            fill="none"
            stroke={solidColor}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}

        {/* Observed dots */}
        {observedPts.map((pt, i) => (
          <circle
            key={`obs-dot-${i}`}
            cx={pt.x}
            cy={pt.y}
            r="3.5"
            fill={solidColor}
            stroke="#0E0E12"
            strokeWidth="1.5"
          />
        ))}

        {/* Dashed forecast series */}
        {forecastPts.length > 1 && (
          <path
            d={createSmoothPath(forecastPts)}
            fill="none"
            stroke={forecastColor}
            strokeWidth="2.2"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}

        {/* Forecast dots */}
        {forecastPts.map((pt, i) => (
          <circle
            key={`fc-dot-${i}`}
            cx={pt.x}
            cy={pt.y}
            r="3"
            fill="#0E0E12"
            stroke={forecastColor}
            strokeWidth="2"
          />
        ))}

        {/* Secondary and tertiary series if provided */}
        {data.some((d) => d.series2 !== undefined) && (
          <path
            d={createSmoothPath(
              data.filter((d) => d.series2 !== undefined).map((d, i) => ({ x: getX(i), y: getY(d.series2!) }))
            )}
            fill="none"
            stroke={secondaryColor}
            strokeWidth="2.2"
          />
        )}

        {data.some((d) => d.series3 !== undefined) && (
          <path
            d={createSmoothPath(
              data.filter((d) => d.series3 !== undefined).map((d, i) => ({ x: getX(i), y: getY(d.series3!) }))
            )}
            fill="none"
            stroke={tertiaryColor}
            strokeWidth="2.2"
          />
        )}

        {/* X axis labels */}
        {data.map((d, i) => (
          <text
            key={`x-label-${i}`}
            x={getX(i)}
            y={padTop + chartH + 18}
            textAnchor="middle"
            fill="#8B8B98"
            fontSize="10.5"
            fontFamily="Manrope"
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
};
