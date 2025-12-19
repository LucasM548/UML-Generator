import { Entity, Point, Association } from '../types';

// Constants for entity sizing (must match EntityBox.tsx)
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 24;
const PADDING = 20;

// Helper function to measure text width using Canvas API
const measureTextWidth = (text: string, font: string): number => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return text.length * 8; // Fallback
  context.font = font;
  return context.measureText(text).width;
};

// Calculate the actual rendered dimensions of an entity
export const getEntityDimensions = (entity: Entity): { width: number; height: number } => {
  const normalFont = '14px ui-sans-serif, system-ui, sans-serif';
  const boldFont = 'bold 14px ui-sans-serif, system-ui, sans-serif';

  // Measure entity name (bold, centered)
  const entityNameWidth = measureTextWidth(entity.name, boldFont) + PADDING;

  // Measure all attributes
  const maxAttrWidth = entity.attributes.reduce((max, attr) => {
    const font = attr.isPk ? boldFont : normalFont;
    const attrText = attr.name + (attr.isPk ? ' PK' : '');
    return Math.max(max, measureTextWidth(attrText, font) + PADDING);
  }, 0);

  const width = Math.max(entity.width, entityNameWidth, maxAttrWidth, 120);
  const height = Math.max(
    entity.height,
    HEADER_HEIGHT + (entity.attributes.length * ROW_HEIGHT) + PADDING
  );

  return { width, height };
};

// Helper to get the center of an entity
export const getCenter = (entity: Entity | Association): Point => {
  if ('width' in entity) {
    const { width, height } = getEntityDimensions(entity);
    return {
      x: entity.x + width / 2,
      y: entity.y + height / 2,
    };
  }
  return { x: entity.x, y: entity.y };
};

// Intersection for Rectangles (Entities)
export const getIntersection = (center: Point, target: Point, rect: Entity): Point => {
  const { width, height } = getEntityDimensions(rect);
  const cx = rect.x + width / 2;
  const cy = rect.y + height / 2;

  const dx = target.x - cx;
  const dy = target.y - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = width / 2;
  const halfH = height / 2;

  const tx = dx !== 0 ? (dx > 0 ? halfW : -halfW) / dx : Infinity;
  const ty = dy !== 0 ? (dy > 0 ? halfH : -halfH) / dy : Infinity;

  const t = Math.min(Math.abs(tx), Math.abs(ty));

  return {
    x: cx + dx * t,
    y: cy + dy * t,
  };
};

// Generic Polygon Intersection
export const getPolygonIntersection = (center: Point, target: Point, points: Point[]): Point => {
  if (points.length < 2) return center;

  const x1 = center.x;
  const y1 = center.y;
  const x2 = target.x;
  const y2 = target.y;

  let bestPoint = center;
  let minDist = Infinity;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    const inter = getLineIntersection(x1, y1, x2, y2, p1.x, p1.y, p2.x, p2.y);
    if (inter) {
      const dist = Math.sqrt(Math.pow(inter.x - x1, 2) + Math.pow(inter.y - y1, 2));
      if (dist < minDist) {
        minDist = dist;
        bestPoint = inter;
      }
    }
  }

  return bestPoint;
};

const getLineIntersection = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): Point | null => {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: x1 + ua * (x2 - x1),
      y: y1 + ua * (y2 - y1),
    };
  }
  return null;
};

export const getLabelPosition = (start: Point, end: Point, distance: number): Point => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) return start;

  const ndx = dx / len;
  const ndy = dy / len;

  return {
    x: start.x + ndx * distance,
    y: start.y + ndy * distance,
  };
};

// Generates points for the association shape based on connection count
export const getAssociationShapePoints = (association: Association): Point[] => {
  const count = association.connections.length;
  const cx = association.x;
  const cy = association.y;
  const size = 40; // Base size radius

  if (count <= 2) {
    // For n=2, we create a tighter box around the text so lines look connected to the text
    // Estimate width based on label length (approx 7px per char)
    const w = Math.max(40, association.label.length * 7 + 10);
    const h = 20;
    return [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 },
    ];
  } else if (count === 3) {
    // Triangle
    const r = size * 1.2;
    return [
      { x: cx, y: cy - r },
      { x: cx + r * 0.866, y: cy + r * 0.5 },
      { x: cx - r * 0.866, y: cy + r * 0.5 },
    ];
  } else {
    // Square (for 4) or Polygon (for >4)
    const sides = count;
    const points: Point[] = [];
    const angleOffset = -Math.PI / 2 + (sides === 4 ? Math.PI / 4 : 0);
    const r = size;
    for (let i = 0; i < sides; i++) {
      const theta = angleOffset + (i * 2 * Math.PI / sides);
      points.push({
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta)
      });
    }
    return points;
  }
};