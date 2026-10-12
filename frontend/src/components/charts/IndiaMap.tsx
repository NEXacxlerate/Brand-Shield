import React, { useEffect, useState, useMemo } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';

interface Hotspot {
  name: string;
  coords: [number, number]; // [lon, lat]
  color: string;
  isHigh: boolean;
}

const HOTSPOTS: Hotspot[] = [
  { name: 'Maharashtra', coords: [75.7139, 19.7515], color: '#FF3B4E', isHigh: true },
  { name: 'Uttar Pradesh', coords: [80.9462, 26.8467], color: '#FF3B4E', isHigh: true },
  { name: 'Delhi', coords: [77.1025, 28.7041], color: '#FF3B4E', isHigh: true },
  { name: 'Karnataka', coords: [75.7139, 15.3173], color: '#FF7A88', isHigh: false }
];

export const IndiaMap: React.FC = () => {
  const [geoData, setGeoData] = useState<any>(null);
  const mapWidth = 210;
  const mapHeight = 240;

  useEffect(() => {
    fetch('/states.geojson')
      .then((res) => res.json())
      .then((data) => setGeoData(data))
      .catch((err) => console.error('Error loading states.geojson:', err));
  }, []);

  const { pathGenerator, projection } = useMemo(() => {
    if (!geoData) return { pathGenerator: null, projection: null };

    // Equirectangular projection fit to mapWidth x mapHeight
    const proj = geoEquirectangular()
      .fitSize([mapWidth, mapHeight], geoData);

    const pathGen = geoPath().projection(proj);
    return { pathGenerator: pathGen, projection: proj };
  }, [geoData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={mapWidth}
        height={mapHeight}
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {geoData && pathGenerator && (
          <g>
            {/* States */}
            {geoData.features.map((feature: any, idx: number) => {
              const stateName = feature.properties?.ST_NM || feature.properties?.name || '';
              const isMaharashtra = stateName.toLowerCase().includes('maharashtra');
              const fillColor = isMaharashtra ? '#1F55D6' : '#6E9AF0';
              const pathD = pathGenerator(feature);

              return (
                <path
                  key={idx}
                  d={pathD || ''}
                  fill={fillColor}
                  stroke="#121217"
                  strokeWidth="0.8"
                />
              );
            })}

            {/* Hotspots */}
            {projection &&
              HOTSPOTS.map((spot, idx) => {
                const projected = projection(spot.coords);
                if (!projected) return null;
                const [cx, cy] = projected;

                return (
                  <g key={`spot-${idx}`}>
                    {/* Outer ring (30% opacity) */}
                    <circle cx={cx} cy={cy} r={11} fill={spot.color} opacity={0.3} />
                    {/* Inner solid ring */}
                    <circle cx={cx} cy={cy} r={6} fill={spot.color} />
                    {/* 3px white centre */}
                    <circle cx={cx} cy={cy} r={2} fill="#FFFFFF" />
                  </g>
                );
              })}
          </g>
        )}
      </svg>
      {/* Legend below map */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          marginTop: '10px',
          fontSize: '11px',
          color: '#8B8B98'
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF2E45' }} /> High
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF7A88' }} /> Medium
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6E9AF0' }} /> Low
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#8B8B98', marginTop: '6px', textAlign: 'center' }}>
        Map data: DataMeet India community, CC BY 4.0
      </div>
    </div>
  );
};
