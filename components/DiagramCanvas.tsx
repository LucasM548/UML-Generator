import React, { useState, useRef, useEffect } from 'react';
import { Entity, Association } from '../types';
import { EntityBox } from './EntityBox';
import { AssociationNode } from './AssociationNode';
import { getCenter, getIntersection, getPolygonIntersection, getAssociationShapePoints, getLabelPosition, getEntityDimensions } from '../utils/geometry';
import { useTheme } from './ThemeContext';

interface DiagramCanvasProps {
  entities: Entity[];
  associations: Association[];
  onMove: (id: string, x: number, y: number, type: 'entity' | 'association', deltaX?: number, deltaY?: number) => void;
  onMoveEntityBox: (id: string, x: number, y: number) => void;
  selectedItems: Map<string, 'entity' | 'association'>;
  onSelect: (
    id: string | null,
    type: 'entity' | 'association' | null,
    options?: { ctrlKey?: boolean; setSelection?: Map<string, 'entity' | 'association'> }
  ) => void;
  onCreateEntityAtPosition?: (x: number, y: number) => void;
  onQuickConnect?: (sourceId: string, sourceType: 'entity' | 'association', targetEntityId: string) => void;
  onCardinalityClick?: (associationId: string, connectionIndex: number) => void;
}

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  entities,
  associations,
  onMove,
  onMoveEntityBox,
  selectedItems,
  onSelect,
  onCreateEntityAtPosition,
  onQuickConnect,
  onCardinalityClick,
}) => {
  const { theme } = useTheme();
  const [dragging, setDragging] = useState<{ id: string; type: 'entity' | 'association' | 'entityBox'; startX: number; startY: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Last mouse position for calculating delta
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Connection mode state for Ctrl+Drag linking
  const [connectionMode, setConnectionMode] = useState<{
    sourceId: string;
    sourceType: 'entity' | 'association';
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Marquee selection state
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

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

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Shift+Click/Drag: Start connection mode
    if (e.shiftKey) {
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

    // Ctrl+Click: toggle selection (add/remove from multi-selection)
    if (e.ctrlKey || e.metaKey) {
      onSelect(id, type, { ctrlKey: true });
      return;
    }

    // Windows-like behavior:
    // - If clicking an already-selected item: keep selection, prepare for multi-drag
    // - If clicking an unselected item: select only this item
    const isAlreadySelected = selectedItems.has(id);
    if (!isAlreadySelected) {
      onSelect(id, type);
    }

    // For binary associations, check if label is movable
    if (type === 'association') {
      const assoc = obj as import('../types').Association;
      // Binary associations are locked by default (isLabelMovable = false)
      if (assoc.connections.length === 2 && !assoc.isLabelMovable) {
        return; // Don't allow dragging
      }
    }

    // Setup for dragging (single or multi)
    setOffset({
      x: mouseX - obj.x,
      y: mouseY - obj.y,
    });
    setLastPos({ x: mouseX, y: mouseY });
    setDragging({ id, type, startX: obj.x, startY: obj.y });
  };

  // Handler for dragging the entity box of an association
  const handleEntityBoxMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();

    const assoc = associations.find(a => a.id === id);
    if (!assoc || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Ctrl+Click: toggle selection (add/remove from multi-selection)
    if (e.ctrlKey || e.metaKey) {
      onSelect(id, 'association', { ctrlKey: true });
      return;
    }

    // Windows-like: only change selection if not already selected
    if (!selectedItems.has(id)) {
      onSelect(id, 'association');
    }

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
    setLastPos({ x: mouseX, y: mouseY });
    setDragging({ id, type: 'entityBox', startX: boxX, startY: boxY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Always track mouse position for connection mode
    setMousePos({ x: currentX, y: currentY });

    // Update marquee if active
    if (marquee) {
      setMarquee(prev => prev ? { ...prev, endX: currentX, endY: currentY } : null);
      return;
    }

    if (!dragging) return;

    const x = currentX - offset.x;
    const y = currentY - offset.y;

    const snap = 10;
    const snappedX = Math.round(x / snap) * snap;
    const snappedY = Math.round(y / snap) * snap;

    // Calculate delta based on snapped movement from start position
    // This ensures all elements move by the exact same amount
    const deltaX = snappedX - dragging.startX;
    const deltaY = snappedY - dragging.startY;

    if (dragging.type === 'entityBox') {
      onMoveEntityBox(dragging.id, snappedX, snappedY);
    } else {
      // Pass delta for multi-drag support
      onMove(dragging.id, snappedX, snappedY, dragging.type, deltaX, deltaY);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Finalize marquee selection
    if (marquee && svgRef.current) {
      const minX = Math.min(marquee.startX, marquee.endX);
      const maxX = Math.max(marquee.startX, marquee.endX);
      const minY = Math.min(marquee.startY, marquee.endY);
      const maxY = Math.max(marquee.startY, marquee.endY);

      // Only process if marquee has some size (not just a click)
      if (maxX - minX > 5 || maxY - minY > 5) {
        const newSelection = new Map<string, 'entity' | 'association'>();

        // Find entities inside marquee
        entities.forEach(entity => {
          const { width, height } = getEntityDimensions(entity);
          const entityCenterX = entity.x + width / 2;
          const entityCenterY = entity.y + height / 2;

          if (entityCenterX >= minX && entityCenterX <= maxX &&
            entityCenterY >= minY && entityCenterY <= maxY) {
            newSelection.set(entity.id, 'entity');
          }
        });

        // Find associations inside marquee
        // For associations, check if the center point OR any part overlaps
        associations.forEach(assoc => {
          // For n-ary associations (diamond shape), use a bounding box around center
          // Diamond is roughly 60x40 for simple, larger for n-ary
          const assocHalfWidth = assoc.connections.length > 2 ? 40 : 30;
          const assocHalfHeight = assoc.connections.length > 2 ? 30 : 20;

          // Check if association bounding box intersects with marquee
          const assocLeft = assoc.x - assocHalfWidth;
          const assocRight = assoc.x + assocHalfWidth;
          const assocTop = assoc.y - assocHalfHeight;
          const assocBottom = assoc.y + assocHalfHeight;

          // Intersection check: not (completely left OR right OR above OR below)
          const intersects = !(assocRight < minX || assocLeft > maxX ||
            assocBottom < minY || assocTop > maxY);

          if (intersects) {
            newSelection.set(assoc.id, 'association');
          }
        });

        onSelect(null, null, { setSelection: newSelection });
      }

      setMarquee(null);
      return;
    }

    // If in connection mode, check if we're over an entity to complete the connection
    if (connectionMode && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Find entity under mouse position
      const targetEntity = entities.find(entity => {
        // Use the same dimension calculation as EntityBox and geometry utils
        const { width, height } = getEntityDimensions(entity);

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

  // Start marquee selection on canvas mousedown (not on items)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If clicking on empty area, start marquee or clear selection
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Start marquee selection
      setMarquee({ startX: x, startY: y, endX: x, endY: y });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only clear selection if no marquee was drawn
    if (!marquee) {
      onSelect(null, null);
    }
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

  // Render self-referencing (reflexive) association with angular path
  const renderSelfReferencingConnection = (assoc: Association, entity1: import('../types').Entity) => {
    const { width, height } = getEntityDimensions(entity1);
    const entityCenterX = entity1.x + width / 2;
    const entityCenterY = entity1.y + height / 2;

    // Find all self-referencing associations for this entity to offset multiple ones
    const selfRefAssocs = associations.filter(a => {
      if (a.connections.length !== 2) return false;
      return a.connections[0].entityId === entity1.id && a.connections[1].entityId === entity1.id;
    });
    const selfRefIndex = selfRefAssocs.findIndex(a => a.id === assoc.id);
    const loopOffset = selfRefIndex * 40;

    // Default label position (right side when not movable)
    const defaultExtendX = entity1.x + width + 50 + loopOffset;
    const defaultLabelX = defaultExtendX + 5;
    const defaultLabelY = entityCenterY;

    // Actual label position
    const labelX = assoc.isLabelMovable ? assoc.x : defaultLabelX;
    const labelY = assoc.isLabelMovable ? assoc.y : defaultLabelY;

    let simplePathD: string;
    let card1X: number, card1Y: number, card2X: number, card2Y: number;

    if (assoc.isLabelMovable) {
      // Calculate dynamic connection points based on label position
      // Determine which side of the entity the label is on
      const dx = labelX - entityCenterX;
      const dy = labelY - entityCenterY;

      // Calculate two connection points on entity border
      // Point 1: offset slightly up from center direction
      // Point 2: offset slightly down from center direction
      const angle = Math.atan2(dy, dx);
      const offsetAngle = 0.3; // ~17 degrees offset

      // Get intersection points for both lines
      const getEntityBorderPoint = (ang: number) => {
        // Calculate point on entity border in direction of angle
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const hw = width / 2;
        const hh = height / 2;

        // Check which edge we hit
        const tx = hw / Math.abs(cosA);
        const ty = hh / Math.abs(sinA);
        const t = Math.min(tx, ty);

        return {
          x: entityCenterX + t * cosA,
          y: entityCenterY + t * sinA
        };
      };

      const start = getEntityBorderPoint(angle - offsetAngle);
      const end = getEntityBorderPoint(angle + offsetAngle);

      // Angular path with one corner point
      // Calculate a corner point between entity and label
      const corner1X = (start.x + labelX) / 2 + (labelY - start.y) * 0.3;
      const corner1Y = (start.y + labelY) / 2 - (labelX - start.x) * 0.3;
      const corner2X = (end.x + labelX) / 2 - (labelY - end.y) * 0.3;
      const corner2Y = (end.y + labelY) / 2 + (labelX - end.x) * 0.3;

      // Draw angular paths with corners
      simplePathD = `M ${start.x} ${start.y} L ${corner1X} ${corner1Y} L ${labelX} ${labelY} M ${labelX} ${labelY} L ${corner2X} ${corner2Y} L ${end.x} ${end.y}`;

      // Cardinality positions near entity (at start and end points)
      // Offset them outward from entity center
      const offset = 18;
      const dir1X = (start.x - entityCenterX) / Math.hypot(start.x - entityCenterX, start.y - entityCenterY);
      const dir1Y = (start.y - entityCenterY) / Math.hypot(start.x - entityCenterX, start.y - entityCenterY);
      const dir2X = (end.x - entityCenterX) / Math.hypot(end.x - entityCenterX, end.y - entityCenterY);
      const dir2Y = (end.y - entityCenterY) / Math.hypot(end.x - entityCenterX, end.y - entityCenterY);

      card1X = start.x + dir1X * offset;
      card1Y = start.y + dir1Y * offset;
      card2X = end.x + dir2X * offset;
      card2Y = end.y + dir2Y * offset;
    } else {
      // Fixed angular bracket path (right side)
      const startX = entity1.x + width;
      const startY = entityCenterY - 15;
      const endX = entity1.x + width;
      const endY = entityCenterY + 15;
      const extendX = defaultExtendX;

      simplePathD = `M ${startX} ${startY} L ${extendX} ${startY} L ${extendX} ${endY} L ${endX} ${endY}`;

      card1X = (startX + extendX) / 2;
      card1Y = startY - 8;
      card2X = (startX + extendX) / 2;
      card2Y = endY + 15;
    }

    const isSelected = selectedItems.has(assoc.id);
    const hasAttributes = assoc.attributes && assoc.attributes.length > 0;

    return (
      <g
        key={`${assoc.id}-self-ref`}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (e.shiftKey) {
            setConnectionMode({ sourceId: assoc.id, sourceType: 'association' });
            onSelect(assoc.id, 'association');
            return;
          }
          if (e.ctrlKey || e.metaKey) {
            onSelect(assoc.id, 'association', { ctrlKey: true });
            return;
          }
          if (!selectedItems.has(assoc.id)) {
            onSelect(assoc.id, 'association');
          }
          // Enable dragging if isLabelMovable is true
          if (assoc.isLabelMovable && svgRef.current) {
            const rect = svgRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            setOffset({ x: mouseX - assoc.x, y: mouseY - assoc.y });
            setLastPos({ x: mouseX, y: mouseY });
            setDragging({ id: assoc.id, type: 'association', startX: assoc.x, startY: assoc.y });
          }
        }}
        style={{ cursor: assoc.isLabelMovable ? 'move' : 'pointer' }}
      >
        {/* Invisible path for clicking */}
        <path d={simplePathD} stroke="transparent" strokeWidth="15" fill="none" />
        {/* Visible angular path */}
        <path
          d={simplePathD}
          stroke={isSelected ? "#3b82f6" : (theme === 'dark' ? '#94a3b8' : 'black')}
          strokeWidth={isSelected ? 2.5 : 1.5}
          fill="none"
        />
        {/* Selection highlight */}
        {isSelected && (
          <rect
            x={labelX - 5} y={labelY - 12}
            width={assoc.label.length * 8 + 10} height={24}
            fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} rx={4}
          />
        )}
        {/* Label */}
        <text
          x={labelX} y={labelY + 4} textAnchor="start"
          style={{
            paintOrder: 'stroke',
            stroke: theme === 'dark' ? '#1e293b' : 'white',
            strokeWidth: '4px',
            fill: isSelected ? '#3b82f6' : (theme === 'dark' ? '#f1f5f9' : 'black'),
            fontSize: '13px', fontWeight: 'bold',
          }}
        >
          {assoc.label}
        </text>
        {/* Cardinality 1 */}
        <text
          x={card1X} y={card1Y} textAnchor="middle"
          style={{
            paintOrder: 'stroke', stroke: theme === 'dark' ? '#1e293b' : 'white',
            strokeWidth: '5px', fill: theme === 'dark' ? '#a78bfa' : '#7c3aed',
            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); onSelect(assoc.id, 'association'); onCardinalityClick?.(assoc.id, 0); }}
        >
          {assoc.connections[0].cardinality}
        </text>
        {/* Cardinality 2 */}
        <text
          x={card2X} y={card2Y} textAnchor="middle"
          style={{
            paintOrder: 'stroke', stroke: theme === 'dark' ? '#1e293b' : 'white',
            strokeWidth: '5px', fill: theme === 'dark' ? '#a78bfa' : '#7c3aed',
            fontSize: '13px', fontWeight: 'bold', cursor: 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); onSelect(assoc.id, 'association'); onCardinalityClick?.(assoc.id, 1); }}
        >
          {assoc.connections[1].cardinality}
        </text>
        {/* Entity box for associations with attributes */}
        {hasAttributes && (() => {
          const displayName = assoc.entityName && assoc.entityName.trim() !== '' ? assoc.entityName : assoc.label;
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

          const defaultBoxX = defaultExtendX + 20;
          const defaultBoxY = labelY - boxHeight / 2;
          const boxX = assoc.entityBoxX !== undefined ? assoc.entityBoxX : defaultBoxX;
          const boxY = assoc.entityBoxY !== undefined ? assoc.entityBoxY : defaultBoxY;
          const boxCenterX = boxX + boxWidth / 2;
          const boxCenterY = boxY + boxHeight / 2;

          return (
            <>
              {/* Dashed line connecting label to entity box */}
              <line
                x1={labelX} y1={labelY}
                x2={boxCenterX} y2={boxCenterY}
                stroke={theme === 'dark' ? '#94a3b8' : 'black'} strokeDasharray="4" strokeWidth="1"
                className="pointer-events-none"
              />
              <g
                transform={`translate(${boxX}, ${boxY})`}
                onMouseDown={(e) => { e.stopPropagation(); handleEntityBoxMouseDown(e, assoc.id); }}
                className="cursor-move"
              >
                <rect width={boxWidth} height={boxHeight} fill={theme === 'dark' ? '#1e293b' : 'white'}
                  stroke={isSelected ? "#3b82f6" : (theme === 'dark' ? '#475569' : '#000')} strokeWidth={1.5} rx={4} />
                <rect width={boxWidth} height={headerHeight} fill={theme === 'dark' ? '#334155' : '#f3f4f6'}
                  stroke={theme === 'dark' ? '#475569' : '#000'} strokeWidth={1} rx={4} />
                <rect y={headerHeight - 5} width={boxWidth} height={5} fill={theme === 'dark' ? '#334155' : '#f3f4f6'} />
                <line x1={0} y1={headerHeight} x2={boxWidth} y2={headerHeight} stroke={theme === 'dark' ? '#475569' : 'black'} strokeWidth={1} />
                <text x={boxWidth / 2} y={20} textAnchor="middle" className={`font-bold text-sm pointer-events-none ${theme === 'dark' ? 'fill-slate-100' : 'fill-slate-900'}`}>{displayName}</text>
                {assoc.attributes.map((attr, index) => (
                  <text key={attr.id} x={10} y={headerHeight + 20 + index * rowHeight}
                    className={`text-xs pointer-events-none ${attr.isPk ? 'font-bold underline' : ''} ${theme === 'dark' ? 'fill-slate-200' : 'fill-slate-800'}`}>
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
  };

  // Render a connection between an Association (Source) and an Entity (Target)
  const renderConnection = (assoc: Association, connIndex: number) => {
    const conn = assoc.connections[connIndex];
    const entity = entities.find(e => e.id === conn.entityId);
    if (!entity) return null;

    // Early detection of self-referencing associations (same entity for both connections)
    // This applies regardless of isLabelMovable setting
    if (assoc.connections.length === 2) {
      const ent1 = entities.find(e => e.id === assoc.connections[0].entityId);
      const ent2 = entities.find(e => e.id === assoc.connections[1].entityId);

      if (ent1 && ent2 && ent1.id === ent2.id) {
        // Only render once (on first connection)
        if (connIndex !== 0) return null;

        // Render self-referencing association with angular path
        return renderSelfReferencingConnection(assoc, ent1);
      }
    }

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

      // Note: Self-referencing associations are now handled by early detection above
      // So we only reach here for normal binary associations between different entities

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
      const isSelected = selectedItems.has(assoc.id);

      return (
        <g
          key={`${assoc.id}-binary`}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            // Shift+Click: start connection mode to add entity to this association
            if (e.shiftKey) {
              setConnectionMode({ sourceId: assoc.id, sourceType: 'association' });
              onSelect(assoc.id, 'association');
              return;
            }
            // Ctrl+Click: toggle selection
            if (e.ctrlKey || e.metaKey) {
              onSelect(assoc.id, 'association', { ctrlKey: true });
              return;
            }
            // Windows-like: only change selection if not already selected
            if (!selectedItems.has(assoc.id)) {
              onSelect(assoc.id, 'association');
            }
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
              cursor: 'pointer',
              filter: theme === 'dark' ? 'none' : 'drop-shadow(0 0 1px rgba(124, 58, 237, 0.5))',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(assoc.id, 'association');
              onCardinalityClick?.(assoc.id, 0);
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
              cursor: 'pointer',
              filter: theme === 'dark' ? 'none' : 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.5))',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(assoc.id, 'association');
              onCardinalityClick?.(assoc.id, 1);
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
            cursor: 'pointer',
            filter: theme === 'dark' ? 'none' : 'drop-shadow(0 0 2px rgba(124, 58, 237, 0.5))',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(assoc.id, 'association');
            onCardinalityClick?.(assoc.id, connIndex);
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
      className={`w-full h-full overflow-hidden select-none transition-colors duration-300 ${connectionMode ? 'cursor-crosshair' : marquee ? 'cursor-crosshair' : 'cursor-default'} ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'}`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleCanvasMouseDown}
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

      {/* Render marquee selection rectangle */}
      {marquee && (
        <rect
          x={Math.min(marquee.startX, marquee.endX)}
          y={Math.min(marquee.startY, marquee.endY)}
          width={Math.abs(marquee.endX - marquee.startX)}
          height={Math.abs(marquee.endY - marquee.startY)}
          fill="rgba(59, 130, 246, 0.1)"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeDasharray="4 2"
          className="pointer-events-none"
        />
      )}

      {/* Render Connections (Lines) first */}
      {associations.map(assoc =>
        assoc.connections.map((_, idx) => renderConnection(assoc, idx))
      )}

      {/* Render Associations (Nodes) - skip locked binary associations AND self-referencing binary associations */}
      {associations
        .filter(assoc => {
          // Skip locked binary associations (they are rendered inline)
          if (assoc.connections.length === 2 && !assoc.isLabelMovable) return false;
          // Skip self-referencing binary associations (they are rendered by renderSelfReferencingConnection)
          if (assoc.connections.length === 2) {
            const isSelfRef = assoc.connections[0].entityId === assoc.connections[1].entityId;
            if (isSelfRef) return false;
          }
          return true;
        })
        .map((assoc) => (
          <AssociationNode
            key={assoc.id}
            association={assoc}
            onMouseDown={(e, id) => handleMouseDown(e, id, 'association')}
            onEntityBoxMouseDown={handleEntityBoxMouseDown}
            isSelected={selectedItems.has(assoc.id)}
          />
        ))}

      {/* Render Entities */}
      {entities.map((entity) => (
        <EntityBox
          key={entity.id}
          entity={entity}
          onMouseDown={(e, id) => handleMouseDown(e, id, 'entity')}
          isSelected={selectedItems.has(entity.id)}
        />
      ))}
    </svg>
  );
};