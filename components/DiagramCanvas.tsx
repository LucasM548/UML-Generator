import React, { useState, useRef, useEffect } from 'react';
import { Entity, Association } from '../types';
import { EntityBox } from './EntityBox';
import { AssociationNode } from './AssociationNode';
import { getCenter, getIntersection, getPolygonIntersection, getAssociationShapePoints, getLabelPosition } from '../utils/geometry';
import { useTheme } from './ThemeContext';

interface DiagramCanvasProps {
  entities: Entity[];
  associations: Association[];
  onMove: (id: string, x: number, y: number, type: 'entity' | 'association') => void;
  onMoveEntityBox: (id: string, x: number, y: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null, type: 'entity' | 'association' | null) => void;
  onCreateEntityAtPosition?: (x: number, y: number) => void;
  onQuickConnect?: (sourceId: string, sourceType: 'entity' | 'association', targetEntityId: string) => void;
}

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  entities,
  associations,
  onMove,
  onMoveEntityBox,
  selectedId,
  onSelect,
  onCreateEntityAtPosition,
  onQuickConnect,
}) => {
  const { theme } = useTheme();
  const [dragging, setDragging] = useState<{ id: string; type: 'entity' | 'association' | 'entityBox' } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Connection mode state for Ctrl+Drag linking
  const [connectionMode, setConnectionMode] = useState<{
    sourceId: string;
    sourceType: 'entity' | 'association';
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Cancel connection mode with Escape key or when Ctrl is released
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connectionMode) {
        setConnectionMode(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      // Cancel connection mode if Ctrl is released
      if ((e.key === 'Control' || e.key === 'Meta') && connectionMode) {
        setConnectionMode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [connectionMode]);

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'entity' | 'association') => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection

    // Find the object
    const obj = type === 'entity'
      ? entities.find(e => e.id === id)
      : associations.find(a => a.id === id);

    if (!obj || !svgRef.current) return;

    // Handle Ctrl+Drag for connection mode - start dragging to connect
    if (e.ctrlKey || e.metaKey) {
      // Start connection mode from entity or association
      if (type === 'entity') {
        setConnectionMode({ sourceId: id, sourceType: 'entity' });
        onSelect(id, type);
        return;
      } else if (type === 'association') {
        const assoc = obj as import('../types').Association;
        // Only allow adding connections to n-ary associations (not binary locked)
        if (assoc.connections.length >= 2) {
          setConnectionMode({ sourceId: id, sourceType: 'association' });
          onSelect(id, type);
          return;
        }
      }
    }

    // Always select the item
    onSelect(id, type);

    // For binary associations, check if label is movable
    if (type === 'association') {
      const assoc = obj as import('../types').Association;
      // Binary associations are locked by default (isLabelMovable = false)
      if (assoc.connections.length === 2 && !assoc.isLabelMovable) {
        return; // Don't allow dragging
      }
    }

    // For entities, x/y is top-left. For associations, x/y is center.
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setOffset({
      x: mouseX - obj.x,
      y: mouseY - obj.y,
    });
    setDragging({ id, type });
  };

  // Handler for dragging the entity box of an association
  const handleEntityBoxMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    const assoc = associations.find(a => a.id === id);
    if (!assoc || !svgRef.current) return;

    // Select the association
    onSelect(id, 'association');

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Get current entity box position (or calculate default)
    const isBinary = assoc.connections.length <= 2;
    const defaultBoxX = assoc.x;
    const defaultBoxY = assoc.y + (isBinary ? 30 : 60);

    const boxX = assoc.entityBoxX !== undefined ? assoc.entityBoxX : defaultBoxX;
    const boxY = assoc.entityBoxY !== undefined ? assoc.entityBoxY : defaultBoxY;

    setOffset({
      x: mouseX - boxX,
      y: mouseY - boxY,
    });
    setDragging({ id, type: 'entityBox' });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Always track mouse position for connection mode
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }

    if (!dragging || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - offset.x;
    const y = e.clientY - rect.top - offset.y;

    const snap = 10;
    const snappedX = Math.round(x / snap) * snap;
    const snappedY = Math.round(y / snap) * snap;

    if (dragging.type === 'entityBox') {
      onMoveEntityBox(dragging.id, snappedX, snappedY);
    } else {
      onMove(dragging.id, snappedX, snappedY, dragging.type);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // If in connection mode, check if we're over an entity to complete the connection
    if (connectionMode && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Find entity under mouse position
      const targetEntity = entities.find(entity => {
        // Calculate entity dimensions (same as EntityBox component)
        const headerHeight = 30;
        const rowHeight = 24;
        const padding = 10;
        const charWidth = 8;
        const entityNameWidth = entity.name.length * charWidth + 20;
        const maxAttrWidth = entity.attributes.reduce((max, attr) => {
          const attrText = (attr.isPk ? 'PK ' : '') + attr.name;
          return Math.max(max, attrText.length * charWidth + 20);
        }, 0);
        const width = Math.max(entity.width, entityNameWidth, maxAttrWidth, 120);
        const height = Math.max(entity.height, headerHeight + (entity.attributes.length * rowHeight) + padding);

        return mouseX >= entity.x && mouseX <= entity.x + width &&
          mouseY >= entity.y && mouseY <= entity.y + height;
      });

      if (targetEntity && targetEntity.id !== connectionMode.sourceId) {
        // Complete the connection
        if (onQuickConnect) {
          onQuickConnect(connectionMode.sourceId, connectionMode.sourceType, targetEntity.id);
        }
      }
      setConnectionMode(null);
    }

    setDragging(null);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    onSelect(null, null);
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (!svgRef.current || !onCreateEntityAtPosition) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Snap to grid
    const snap = 10;
    const snappedX = Math.round(x / snap) * snap;
    const snappedY = Math.round(y / snap) * snap;

    onCreateEntityAtPosition(snappedX, snappedY);
  };

  // Get the center position of the source for connection line rendering
  const getSourceCenter = () => {
    if (!connectionMode) return null;

    if (connectionMode.sourceType === 'entity') {
      const entity = entities.find(e => e.id === connectionMode.sourceId);
      if (!entity) return null;
      return getCenter(entity);
    } else {
      const assoc = associations.find(a => a.id === connectionMode.sourceId);
      if (!assoc) return null;
      return { x: assoc.x, y: assoc.y };
    }
  };

  // Render a connection between an Association (Source) and an Entity (Target)
  const renderConnection = (assoc: Association, connIndex: number) => {
    const conn = assoc.connections[connIndex];
    const entity = entities.find(e => e.id === conn.entityId);
    if (!entity) return null;

    // For binary associations that are locked, we'll render a direct line between entities
    // The label will be rendered separately at the center
    const isBinaryLocked = assoc.connections.length === 2 && !assoc.isLabelMovable;

    if (isBinaryLocked) {
      // Get both entities
      const entity1 = entities.find(e => e.id === assoc.connections[0].entityId);
      const entity2 = entities.find(e => e.id === assoc.connections[1].entityId);

      if (!entity1 || !entity2) return null;

      // Only render the line once (on the first connection)
      if (connIndex !== 0) return null;

      // Find all locked binary associations between the same pair of entities
      const pairKey = [entity1.id, entity2.id].sort().join('-');
      const sameEntityPairAssocs = associations.filter(a => {
        if (a.connections.length !== 2 || a.isLabelMovable) return false;
        const ids = [a.connections[0].entityId, a.connections[1].entityId].sort().join('-');
        return ids === pairKey;
      });

      // Find the index of current association among those with the same entity pair
      const assocIndex = sameEntityPairAssocs.findIndex(a => a.id === assoc.id);
      const totalSame = sameEntityPairAssocs.length;

      const center1 = getCenter(entity1);
      const center2 = getCenter(entity2);

      // Calculate perpendicular offset for multiple associations
      const dx = center2.x - center1.x;
      const dy = center2.y - center1.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular unit vector
      const perpX = len > 0 ? -dy / len : 0;
      const perpY = len > 0 ? dx / len : 1;

      // Offset each association: center them around 0
      const offsetSpacing = 25; // pixels between each line
      const offsetAmount = (assocIndex - (totalSame - 1) / 2) * offsetSpacing;
      const offsetX = perpX * offsetAmount;
      const offsetY = perpY * offsetAmount;

      // Apply offset to centers for intersection calculation
      const offsetCenter1 = { x: center1.x + offsetX, y: center1.y + offsetY };
      const offsetCenter2 = { x: center2.x + offsetX, y: center2.y + offsetY };

      const border1 = getIntersection(center1, offsetCenter2, entity1);
      const border2 = getIntersection(center2, offsetCenter1, entity2);

      // Apply offset to border points
      const finalBorder1 = { x: border1.x + offsetX, y: border1.y + offsetY };
      const finalBorder2 = { x: border2.x + offsetX, y: border2.y + offsetY };

      // Label position at the middle of the line
      const midX = (finalBorder1.x + finalBorder2.x) / 2;
      const midY = (finalBorder1.y + finalBorder2.y) / 2;

      // Cardinality positions near each entity
      const card1Pos = getLabelPosition(finalBorder1, finalBorder2, 15);
      const card2Pos = getLabelPosition(finalBorder2, finalBorder1, 15);
      const isSelected = selectedId === assoc.id;

      return (
        <g
          key={`${assoc.id}-binary`}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            // Handle Ctrl+Drag to add connection to this binary association
            if (e.ctrlKey || e.metaKey) {
              setConnectionMode({ sourceId: assoc.id, sourceType: 'association' });
              onSelect(assoc.id, 'association');
              return;
            }
            onSelect(assoc.id, 'association');
          }}
          style={{ cursor: 'pointer' }}
        >
          {/* Wider invisible line for easier clicking */}
          <line
            x1={finalBorder1.x}
            y1={finalBorder1.y}
            x2={finalBorder2.x}
            y2={finalBorder2.y}
            stroke="transparent"
            strokeWidth="15"
          />
          {/* Visible line */}
          <line
            x1={finalBorder1.x}
            y1={finalBorder1.y}
            x2={finalBorder2.x}
            y2={finalBorder2.y}
            stroke={isSelected ? "#3b82f6" : (theme === 'dark' ? '#94a3b8' : 'black')}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />
          {/* Selection highlight behind label */}
          {isSelected && (
            <rect
              x={midX - 40}
              y={midY - 18}
              width={80}
              height={24}
              fill="#dbeafe"
              stroke="#3b82f6"
              strokeWidth={2}
              rx={4}
            />
          )}
          {/* Label at center */}
          <text
            x={midX}
            y={midY - 2}
            textAnchor="middle"
            style={{
              paintOrder: 'stroke',
              stroke: theme === 'dark' ? '#1e293b' : 'white',
              strokeWidth: '4px',
              fill: isSelected ? '#3b82f6' : (theme === 'dark' ? '#f1f5f9' : 'black'),
              fontSize: '13px',
              fontWeight: 'bold',
            }}
          >
            {assoc.label}
          </text>
          {/* Cardinality 1 */}
          <text
            x={card1Pos.x}
            y={card1Pos.y + 4}
            textAnchor="middle"
            style={{
              paintOrder: 'stroke',
              stroke: theme === 'dark' ? '#1e293b' : 'white',
              strokeWidth: '5px',
              fill: theme === 'dark' ? '#a78bfa' : '#7c3aed',
              fontSize: '13px',
              fontWeight: 'bold',
              pointerEvents: 'none',
              filter: theme === 'dark' ? 'none' : 'drop-shadow(0 0 1px rgba(124, 58, 237, 0.5))',
            }}
          >
            {assoc.connections[0].cardinality}
          </text>
          {/* Cardinality 2 */}
          <text
            x={card2Pos.x}
            y={card2Pos.y + 4}
            textAnchor="middle"
            style={{
              paintOrder: 'stroke',
              stroke: theme === 'dark' ? '#1e293b' : 'white',
              strokeWidth: '5px',
              fill: theme === 'dark' ? '#a78bfa' : '#7c3aed',
              fontSize: '13px',
              fontWeight: 'bold',
              pointerEvents: 'none',
              filter: theme === 'dark' ? 'none' : 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.5))',
            }}
          >
            {assoc.connections[1].cardinality}
          </text>

          {/* Entity Box for associations with attributes */}
          {assoc.attributes.length > 0 && (() => {
            const displayName = assoc.entityName && assoc.entityName.trim() !== ''
              ? assoc.entityName
              : assoc.label;
            const headerHeight = 30;
            const rowHeight = 24;
            const charWidth = 8;
            const nameWidth = displayName.length * charWidth + 20;
            const maxAttrWidth = assoc.attributes.reduce((max, attr) => {
              const attrText = (attr.isPk ? 'PK ' : '') + attr.name;
              return Math.max(max, attrText.length * charWidth + 20);
            }, 0);
            const boxWidth = Math.max(140, nameWidth, maxAttrWidth);
            const boxHeight = Math.max(40, headerHeight + assoc.attributes.length * rowHeight + 5);

            // Default position below the label
            const defaultBoxX = midX - boxWidth / 2;
            const defaultBoxY = midY + 20;
            const boxX = assoc.entityBoxX !== undefined ? assoc.entityBoxX : defaultBoxX;
            const boxY = assoc.entityBoxY !== undefined ? assoc.entityBoxY : defaultBoxY;
            const boxCenterX = boxX + boxWidth / 2;
            const boxCenterY = boxY;

            return (
              <>
                {/* Dashed line connecting label to entity box */}
                <line
                  x1={midX} y1={midY}
                  x2={boxCenterX} y2={boxCenterY}
                  stroke={theme === 'dark' ? '#94a3b8' : 'black'} strokeDasharray="4" strokeWidth="1"
                  className="pointer-events-none"
                />
                <g
                  transform={`translate(${boxX}, ${boxY})`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleEntityBoxMouseDown(e, assoc.id);
                  }}
                  className="cursor-move"
                >
                  <rect
                    width={boxWidth}
                    height={boxHeight}
                    fill={theme === 'dark' ? '#1e293b' : 'white'}
                    stroke={isSelected ? "#3b82f6" : (theme === 'dark' ? '#475569' : '#000')}
                    strokeWidth={1.5}
                    rx={4}
                  />
                  <rect
                    width={boxWidth}
                    height={headerHeight}
                    fill={theme === 'dark' ? '#334155' : '#f3f4f6'}
                    stroke={theme === 'dark' ? '#475569' : '#000'}
                    strokeWidth={1}
                    rx={4}
                  />
                  <rect
                    y={headerHeight - 5}
                    width={boxWidth}
                    height={5}
                    fill={theme === 'dark' ? '#334155' : '#f3f4f6'}
                  />
                  <line x1={0} y1={headerHeight} x2={boxWidth} y2={headerHeight} stroke={theme === 'dark' ? '#475569' : 'black'} strokeWidth={1} />
                  <text x={boxWidth / 2} y={20} textAnchor="middle" className={`font-bold text-sm pointer-events-none ${theme === 'dark' ? 'fill-slate-100' : 'fill-slate-900'}`}>{displayName}</text>
                  {assoc.attributes.map((attr, index) => (
                    <text
                      key={attr.id}
                      x={10}
                      y={headerHeight + 20 + index * rowHeight}
                      className={`text-xs pointer-events-none ${attr.isPk ? 'font-bold underline' : ''} ${theme === 'dark' ? 'fill-slate-200' : 'fill-slate-800'}`}
                    >
                      {attr.name}
                      {attr.isPk && <tspan className="fill-red-500"> PK</tspan>}
                    </text>
                  ))}
                </g>
              </>
            );
          })()}
        </g>
      );
    }

    // Standard rendering for non-binary or movable associations
    // Association Center
    const centerA = { x: assoc.x, y: assoc.y };

    // Entity Center
    const centerE = getCenter(entity);

    // Intersections
    // 1. Line leaving Entity
    const borderE = getIntersection(centerE, centerA, entity);

    // 2. Line entering Association (Polygon)
    const assocPoints = getAssociationShapePoints(assoc);
    const borderA = getPolygonIntersection(centerA, centerE, assocPoints);

    // Cardinality label position (Near Entity)
    const cardPos = getLabelPosition(borderE, centerA, 15);

    return (
      <g key={`${assoc.id}-${conn.id}`}>
        <line
          x1={borderA.x}
          y1={borderA.y}
          x2={borderE.x}
          y2={borderE.y}
          stroke={theme === 'dark' ? '#94a3b8' : 'black'}
          strokeWidth="1.5"
        />
        <text
          x={cardPos.x}
          y={cardPos.y + 4}
          textAnchor="middle"
          style={{
            paintOrder: 'stroke',
            stroke: theme === 'dark' ? '#1e293b' : 'white',
            strokeWidth: '5px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'round',
            fill: theme === 'dark' ? '#a78bfa' : '#7c3aed',
            fontSize: '13px',
            fontWeight: 'bold',
            pointerEvents: 'none',
            filter: theme === 'dark' ? 'none' : 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.5))',
          }}
        >
          {conn.cardinality}
        </text>
      </g>
    );
  };

  const sourceCenter = getSourceCenter();

  return (
    <svg
      ref={svgRef}
      className={`w-full h-full overflow-hidden select-none transition-colors duration-300 ${connectionMode ? 'cursor-crosshair' : 'cursor-default'} ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'}`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {/* Render connection preview line when in connection mode */}
      {connectionMode && sourceCenter && (
        <line
          x1={sourceCenter.x}
          y1={sourceCenter.y}
          x2={mousePos.x}
          y2={mousePos.y}
          stroke="#3b82f6"
          strokeWidth="2"
          strokeDasharray="8 4"
          className="pointer-events-none"
        />
      )}

      {/* Render Connections (Lines) first */}
      {associations.map(assoc =>
        assoc.connections.map((_, idx) => renderConnection(assoc, idx))
      )}

      {/* Render Associations (Nodes) - skip locked binary associations */}
      {associations
        .filter(assoc => !(assoc.connections.length === 2 && !assoc.isLabelMovable))
        .map((assoc) => (
          <AssociationNode
            key={assoc.id}
            association={assoc}
            onMouseDown={(e, id) => handleMouseDown(e, id, 'association')}
            onEntityBoxMouseDown={handleEntityBoxMouseDown}
            isSelected={selectedId === assoc.id}
          />
        ))}

      {/* Render Entities */}
      {entities.map((entity) => (
        <EntityBox
          key={entity.id}
          entity={entity}
          onMouseDown={(e, id) => handleMouseDown(e, id, 'entity')}
          isSelected={selectedId === entity.id}
        />
      ))}
    </svg>
  );
};