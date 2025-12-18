import React from 'react';
import { Entity } from '../types';
import { useTheme } from './ThemeContext';

interface EntityBoxProps {
  entity: Entity;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  isSelected: boolean;
}

export const EntityBox: React.FC<EntityBoxProps> = ({ entity, onMouseDown, isSelected }) => {
  const { theme } = useTheme();
  // Constants for styling
  const headerHeight = 30;
  const rowHeight = 24;
  const padding = 10;
  const charWidth = 8; // Approximate width per character

  // Calculate width based on longest text
  const entityNameWidth = entity.name.length * charWidth + 20;
  const maxAttrWidth = entity.attributes.reduce((max, attr) => {
    const attrText = (attr.isPk ? 'PK ' : '') + attr.name;
    return Math.max(max, attrText.length * charWidth + 20);
  }, 0);

  const calculatedWidth = Math.max(entity.width, entityNameWidth, maxAttrWidth, 120);

  // Dynamic height based on attributes
  const calculatedHeight = Math.max(
    entity.height,
    headerHeight + (entity.attributes.length * rowHeight) + padding
  );

  // Max text width for truncation
  const maxTextWidth = calculatedWidth - 20;

  // Function to truncate text if needed
  const truncateText = (text: string, maxChars: number) => {
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars - 3) + '...';
  };

  const maxChars = Math.floor(maxTextWidth / charWidth);

  return (
    <g
      transform={`translate(${entity.x}, ${entity.y})`}
      onMouseDown={(e) => onMouseDown(e, entity.id)}
      className="cursor-move select-none"
    >
      {/* Clip path for text overflow */}
      <defs>
        <clipPath id={`clip-${entity.id}`}>
          <rect x={5} y={headerHeight} width={calculatedWidth - 10} height={calculatedHeight - headerHeight} />
        </clipPath>
      </defs>

      {/* Shadow/Selection effect */}
      <rect
        width={calculatedWidth}
        height={calculatedHeight}
        fill={theme === 'dark' ? '#1e293b' : 'white'}
        stroke={isSelected ? "#3b82f6" : (theme === 'dark' ? '#475569' : '#000')}
        strokeWidth={isSelected ? 3 : 1.5}
        className="transition-colors duration-200"
        rx={4}
      />

      {/* Header (Class Name) */}
      <rect
        width={calculatedWidth}
        height={headerHeight}
        fill={theme === 'dark' ? '#334155' : '#f3f4f6'}
        stroke={theme === 'dark' ? '#475569' : '#000'}
        strokeWidth={1}
        rx={4}
      />
      {/* Fix bottom corners of header to be square */}
      <rect
        y={headerHeight - 5}
        width={calculatedWidth}
        height={5}
        fill={theme === 'dark' ? '#334155' : '#f3f4f6'}
      />
      <line x1={0} y1={headerHeight} x2={calculatedWidth} y2={headerHeight} stroke={theme === 'dark' ? '#475569' : 'black'} strokeWidth={1} />

      <text
        x={calculatedWidth / 2}
        y={20}
        textAnchor="middle"
        className={`font-bold text-sm pointer-events-none ${theme === 'dark' ? 'fill-slate-100' : 'fill-slate-900'}`}
      >
        {truncateText(entity.name, maxChars)}
      </text>

      <g clipPath={`url(#clip-${entity.id})`}>
        {entity.attributes.map((attr, index) => (
          <text
            key={attr.id}
            x={10}
            y={headerHeight + 20 + (index * rowHeight)}
            className={`text-sm pointer-events-none ${attr.isPk ? 'font-bold' : ''} ${theme === 'dark' ? 'fill-slate-200' : 'fill-slate-800'}`}
            style={{ textDecoration: attr.isPk ? 'underline' : 'none' }}
          >
            {truncateText(attr.name, maxChars - (attr.isPk ? 4 : 0))}
            {attr.isPk && <tspan className="fill-red-500"> PK</tspan>}
          </text>
        ))}
      </g>
    </g>
  );
};