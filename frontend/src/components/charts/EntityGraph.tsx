import React from 'react';
import type { GraphDrawVM } from '../../api/campaigns';

interface EntityGraphProps {
  graph: GraphDrawVM;
  showAttackPath?: boolean;
  showForecast?: boolean;
  showLabels?: boolean;
  onSelectNode?: (node: any) => void;
  selectedNodeId?: string;
}

export const EntityGraph: React.FC<EntityGraphProps> = ({
  graph,
  showAttackPath = true,
  showForecast = true,
  showLabels = true,
  onSelectNode,
  selectedNodeId
}) => {
  const { brandNode, nodes, edges } = graph;
  const viewBoxWidth = 900;
  const viewBoxHeight = 520;
  const PAD = 24;

  // Filter nodes if forecast is toggled off
  const filteredNodes = nodes.filter((n) => showForecast || n.type !== 'ghost');

  // Filter edges
  const filteredEdges = edges.filter((e) => {
    if (!showForecast) {
      const targetNode = nodes.find((n) => n.id === e.to);
      if (targetNode?.type === 'ghost') return false;
    }
    return true;
  });

  const getNodeColor = (node: any) => {
    if (node.type === 'ghost') return '#8B8B98';
    if (node.risk === 'critical') return '#FF5C5C';
    if (node.risk === 'high') return '#FF9A4D';
    if (node.risk === 'medium') return '#F5C542';
    return '#5AA9FF';
  };

  const renderNodeShape = (node: any) => {
    const isSelected = selectedNodeId === node.id;
    const color = getNodeColor(node);

    let shape = null;
    const size = node.type === 'identifier' || node.type === 'website' ? 18 : 16;

    if (node.type === 'social') {
      shape = (
        <circle
          cx={node.x}
          cy={node.y}
          r={size / 2}
          fill="#131318"
          stroke={color}
          strokeWidth={isSelected ? 3 : 2}
        />
      );
    } else if (node.type === 'website') {
      shape = (
        <rect
          x={node.x - size / 2}
          y={node.y - size / 2}
          width={size}
          height={size}
          rx={4}
          fill="#131318"
          stroke={color}
          strokeWidth={isSelected ? 3 : 2}
        />
      );
    } else if (node.type === 'app') {
      // Triangle
      const h = size * 1.1;
      const pts = `${node.x},${node.y - h / 2} ${node.x - size / 2},${node.y + h / 2} ${node.x + size / 2},${node.y + h / 2}`;
      shape = (
        <polygon
          points={pts}
          fill="#131318"
          stroke={color}
          strokeWidth={isSelected ? 3 : 2}
        />
      );
    } else if (node.type === 'identifier') {
      // Diamond
      const pts = `${node.x},${node.y - size / 1.3} ${node.x + size / 1.3},${node.y} ${node.x},${node.y + size / 1.3} ${node.x - size / 1.3},${node.y}`;
      shape = (
        <polygon
          points={pts}
          fill="#131318"
          stroke={color}
          strokeWidth={isSelected ? 3 : 2}
        />
      );
    } else if (node.type === 'ghost') {
      // Ghost dashed node
      shape = (
        <circle
          cx={node.x}
          cy={node.y}
          r={size / 2}
          fill="rgba(255, 255, 255, 0.04)"
          stroke="#8B8B98"
          strokeWidth={1.6}
          strokeDasharray="3 3"
        />
      );
    }

    return (
      <g
        key={node.id}
        onClick={() => onSelectNode && onSelectNode(node)}
        style={{ cursor: 'pointer' }}
      >
        {/* Glow halo behind node */}
        <circle cx={node.x} cy={node.y} r={size * 1.2} fill={color} opacity={isSelected ? 0.35 : 0.12} />
        {shape}
        {/* Node Center Dot */}
        {node.type !== 'ghost' && (
          <circle cx={node.x} cy={node.y} r={3} fill={color} />
        )}
        {/* Label */}
        {showLabels && (
          <text
            x={node.x}
            y={node.y + size + 6}
            textAnchor="middle"
            fill={node.type === 'ghost' ? '#8B8B98' : '#EDEDF2'}
            fontSize={node.type === 'ghost' ? '10' : '11'}
            fontWeight={isSelected ? '700' : '500'}
            fontFamily="Manrope"
            stroke="#070709"
            strokeWidth={2}
            paintOrder="stroke"
          >
            {node.label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div style={{ width: '100%', position: 'relative', overflow: 'hidden', borderRadius: '16px', background: '#0A0A0E', border: '1px solid rgba(255,255,255,0.06)' }}>
      <svg
        viewBox={`${-PAD} ${-PAD} ${viewBoxWidth + PAD * 2} ${viewBoxHeight + PAD * 2}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          {/* Dotted grid pattern */}
          <pattern id="dot-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="rgba(255, 255, 255, 0.08)" />
          </pattern>
        </defs>

        {/* Dotted grid background */}
        <rect x={-PAD} y={-PAD} width={viewBoxWidth + PAD * 2} height={viewBoxHeight + PAD * 2} fill="url(#dot-grid)" />

        {/* Edges */}
        {filteredEdges.map((edge, idx) => {
          const fromNode = edge.from === brandNode.id ? brandNode : nodes.find((n) => n.id === edge.from);
          const toNode = nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          const isAttack = showAttackPath && edge.attackPath;
          const isDashed = edge.dashed;

          return (
            <line
              key={`edge-${idx}`}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke={isAttack ? '#FF5C5C' : 'rgba(255, 255, 255, 0.18)'}
              strokeWidth={isAttack ? 3 : 1.2}
              strokeDasharray={isDashed ? '4 4' : 'none'}
              strokeOpacity={isAttack ? 0.95 : 0.7}
            />
          );
        })}

        {/* Brand Node (Official) at (450, 55) */}
        <g style={{ cursor: 'pointer' }}>
          <circle cx={brandNode.x} cy={brandNode.y} r={28} fill="rgba(108, 134, 255, 0.18)" />
          <circle cx={brandNode.x} cy={brandNode.y} r={18} fill="#131318" stroke="#6C86FF" strokeWidth={2.4} />
          <text
            x={brandNode.x}
            y={brandNode.y + 5}
            textAnchor="middle"
            fill="#C6D1FF"
            fontSize="14"
            fontWeight="800"
            fontFamily="Manrope"
          >
            {brandNode.label.charAt(0).toUpperCase() || 'A'}
          </text>
          {showLabels && (
            <text
              x={brandNode.x}
              y={brandNode.y + 32}
              textAnchor="middle"
              fill="#EDEDF2"
              fontSize="12"
              fontWeight="700"
              fontFamily="Manrope"
              stroke="#070709"
              strokeWidth={2}
              paintOrder="stroke"
            >
              {brandNode.label}
            </text>
          )}
        </g>

        {/* Other Nodes */}
        {filteredNodes.map((n) => renderNodeShape(n))}
      </svg>
    </div>
  );
};
