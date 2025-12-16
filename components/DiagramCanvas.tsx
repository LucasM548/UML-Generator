import React, { useState, useRef } from 'react';
import { Entity, Association } from '../types';
import { EntityBox } from './EntityBox';
import { AssociationNode } from './AssociationNode';
import { getCenter, getIntersection, getPolygonIntersection, getAssociationShapePoints, getLabelPosition } from '../utils/geometry';

interface DiagramCanvasProps {
  entities: Entity[];
  associations: Association[];
  onMove: (id: string, x: number, y: number, type: 'entity' | 'association') => void;
  onMoveEntityBox: (id: string, x: number, y: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null, type: 'entity' | 'association' | null) => void;
}

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  entities,
  associations,
  onMove,
  onMoveEntityBox,
  selectedId,
  onSelect,
}) => {
  const [dragging, setDragging] = useState<{ id: string; type: 'entity' | 'association' | 'entityBox' } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'entity' | 'association') => {
    e.stopPropagation();

    // Find the object
    const obj = type === 'entity'
      ? entities.find(e => e.id === id)
      : associations.find(a => a.id === id);

    if (!obj || !svgRef.current) return;

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

  const handleMouseUp = () => {
    setDragging(null);
  };

  const handleCanvasClick = () => {
    onSelect(null, null);
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
            stroke={isSelected ? "#3b82f6" : "black"}
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
              stroke: 'white',
              strokeWidth: '4px',
              fill: isSelected ? '#1d4ed8' : 'black',
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
              stroke: 'white',
              strokeWidth: '5px',
              fill: '#7c3aed',
              fontSize: '13px',
              fontWeight: 'bold',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 0 1px rgba(124, 58, 237, 0.5))',
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
              stroke: 'white',
              strokeWidth: '5px',
              fill: '#7c3aed',
              fontSize: '13px',
              fontWeight: 'bold',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.5))',
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
                  stroke="black" strokeDasharray="4" strokeWidth="1"
                  className="pointer-events-none"
                />
                {/* Entity Box - draggable */}
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
                    fill="white"
                    stroke={isSelected ? "#3b82f6" : "#000"}
                    strokeWidth={1.5}
                    rx={4}
                  />
                  <rect
                    width={boxWidth}
                    height={headerHeight}
                    fill="#f3f4f6"
                    stroke="#000"
                    strokeWidth={1}
                    rx={4}
                  />
                  <rect
                    y={headerHeight - 5}
                    width={boxWidth}
                    height={5}
                    fill="#f3f4f6"
                  />
                  <line x1={0} y1={headerHeight} x2={boxWidth} y2={headerHeight} stroke="black" strokeWidth={1} />
                  <text x={boxWidth / 2} y={20} textAnchor="middle" className="font-bold text-sm fill-slate-900 pointer-events-none">{displayName}</text>
                  {assoc.attributes.map((attr, index) => (
                    <text
                      key={attr.id}
                      x={10}
                      y={headerHeight + 20 + index * rowHeight}
                      className={`text-xs pointer-events-none fill-slate-800 ${attr.isPk ? 'font-bold underline' : ''}`}
                    >
                      {attr.name}
                      {attr.isPk && <tspan className="fill-red-600"> PK</tspan>}
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
          stroke="black"
          strokeWidth="1.5"
        />
        <text
          x={cardPos.x}
          y={cardPos.y + 4}
          textAnchor="middle"
          style={{
            paintOrder: 'stroke',
            stroke: 'white',
            strokeWidth: '5px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'round',
            fill: '#7c3aed',
            fontSize: '13px',
            fontWeight: 'bold',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.5))',
          }}
        >
          {conn.cardinality}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      className="w-full h-full bg-slate-50 cursor-crosshair overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleCanvasClick}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

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