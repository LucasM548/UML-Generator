import { Entity, Association } from '../types';
import { getEntityDimensions } from './geometry';

// Import geometry helper for calculating entity dimensions
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 24;
const PADDING = 10;
const CHAR_WIDTH = 8;

export const handleExportJson = (entities: Entity[], associations: Association[]) => {
    const data = {
        entities,
        associations
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcd_diagram_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const handleExportPng = (
    entities: Entity[],
    associations: Association[],
    setExportModal: (modal: { blob: Blob; url: string } | null) => void
) => {
    const svgElement = document.querySelector('svg');
    if (!svgElement) return;
    if (entities.length === 0 && associations.length === 0) {
        alert("Le diagramme est vide !");
        return;
    }

    const getEntityDims = (entity: Entity) => {
        const entityNameWidth = entity.name.length * CHAR_WIDTH + 20;
        const maxAttrWidth = entity.attributes.reduce((max, attr) => {
            const attrText = (attr.isPk ? 'PK ' : '') + attr.name;
            return Math.max(max, attrText.length * CHAR_WIDTH + 20);
        }, 0);
        const width = Math.max(entity.width, entityNameWidth, maxAttrWidth, 120);
        const height = Math.max(entity.height, HEADER_HEIGHT + (entity.attributes.length * ROW_HEIGHT) + PADDING);
        return { width, height };
    };

    // Calculate bounding box of all content
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    entities.forEach(entity => {
        const dims = getEntityDims(entity);
        minX = Math.min(minX, entity.x);
        minY = Math.min(minY, entity.y);
        maxX = Math.max(maxX, entity.x + dims.width);
        maxY = Math.max(maxY, entity.y + dims.height);
    });

    associations.forEach(assoc => {
        // Association label position
        const labelPadding = 50;
        minX = Math.min(minX, assoc.x - labelPadding);
        minY = Math.min(minY, assoc.y - labelPadding);
        maxX = Math.max(maxX, assoc.x + labelPadding);
        maxY = Math.max(maxY, assoc.y + labelPadding);

        // Include entity box if association has attributes
        if (assoc.attributes.length > 0) {
            const displayName = assoc.entityName && assoc.entityName.trim() !== ''
                ? assoc.entityName
                : assoc.label;
            const nameWidth = displayName.length * CHAR_WIDTH + 20;
            const maxAttrWidth = assoc.attributes.reduce((max, attr) => {
                const attrText = (attr.isPk ? 'PK ' : '') + attr.name;
                return Math.max(max, attrText.length * CHAR_WIDTH + 20);
            }, 0);
            const boxWidth = Math.max(140, nameWidth, maxAttrWidth);
            const boxHeight = Math.max(40, HEADER_HEIGHT + assoc.attributes.length * ROW_HEIGHT + 5);

            // Use entityBox position if set, otherwise estimate default
            const isBinary = assoc.connections.length <= 2;
            const defaultBoxX = assoc.x - boxWidth / 2;
            const defaultBoxY = assoc.y + (isBinary ? 30 : 60);
            const boxX = assoc.entityBoxX !== undefined ? assoc.entityBoxX : defaultBoxX;
            const boxY = assoc.entityBoxY !== undefined ? assoc.entityBoxY : defaultBoxY;

            minX = Math.min(minX, boxX);
            minY = Math.min(minY, boxY);
            maxX = Math.max(maxX, boxX + boxWidth);
            maxY = Math.max(maxY, boxY + boxHeight);
        }
    });

    // Add margin around content
    const margin = 30;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Clone the SVG to modify it
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

    // Remove the grid background (make it transparent)
    const backgroundRect = svgClone.querySelector('rect[fill="url(#grid)"]');
    if (backgroundRect) {
        backgroundRect.setAttribute('fill', 'transparent');
    }

    // Reset transforms on groups (zoom/pan) to ensure export is not affected by current view
    // Only target the specific layers (grid and content)
    ['#grid-layer', '#content-layer'].forEach(selector => {
        const g = svgClone.querySelector(selector);
        if (g) {
            g.removeAttribute('transform');
        }
    });

    // Convert dark mode colors to light theme for export
    // This ensures PNG export always uses light theme regardless of current theme
    const colorReplacements: { [key: string]: string } = {
        // Entity/box fills
        '#1e293b': 'white',           // dark bg -> white
        '#334155': '#f3f4f6',         // dark header -> light header
        // Strokes
        '#475569': '#000',            // dark border -> black
        '#94a3b8': 'black',           // dark line -> black
        // Text fills  
        '#f1f5f9': 'black',           // light text -> black
        '#a78bfa': '#7c3aed',         // light purple -> purple
    };

    // Replace colors in all elements
    const replaceColors = (element: Element) => {
        // Replace fill
        const fill = element.getAttribute('fill');
        if (fill && colorReplacements[fill]) {
            element.setAttribute('fill', colorReplacements[fill]);
        }
        // Replace stroke (but not for text elements using stroke for outline effect)
        const stroke = element.getAttribute('stroke');
        if (stroke && colorReplacements[stroke] && element.tagName !== 'text') {
            element.setAttribute('stroke', colorReplacements[stroke]);
        }
        // Replace style attribute colors
        const style = element.getAttribute('style');
        if (style) {
            let newStyle = style;

            // Handle text with paint-order (stroke outline effect)
            if (style.includes('paint-order')) {
                // Convert dark stroke to white for text outlines
                newStyle = newStyle.replace(/stroke:\s*#1e293b/gi, 'stroke: white');
                newStyle = newStyle.replace(/stroke:\s*rgb\(30,\s*41,\s*59\)/gi, 'stroke: white');
                // Convert light text fill to dark
                newStyle = newStyle.replace(/fill:\s*#f1f5f9/gi, 'fill: black');
                newStyle = newStyle.replace(/fill:\s*rgb\(241,\s*245,\s*249\)/gi, 'fill: black');
                // Convert light purple to standard purple
                newStyle = newStyle.replace(/fill:\s*#a78bfa/gi, 'fill: #7c3aed');
                newStyle = newStyle.replace(/fill:\s*rgb\(167,\s*139,\s*250\)/gi, 'fill: #7c3aed');
            } else {
                // For non-text elements, apply standard color replacements
                Object.entries(colorReplacements).forEach(([dark, light]) => {
                    newStyle = newStyle.replace(new RegExp(dark, 'gi'), light);
                });
            }
            element.setAttribute('style', newStyle);
        }
        // Recurse to children
        Array.from(element.children).forEach(child => replaceColors(child));
    };
    replaceColors(svgClone);

    // Remove selection highlights (blue strokes and selection boxes)
    // Replace selection blue with normal black stroke
    const removeSelection = (element: Element) => {
        const stroke = element.getAttribute('stroke');
        if (stroke === '#3b82f6') {
            element.setAttribute('stroke', '#000');
            // Reset stroke width if it was thickened for selection
            const strokeWidth = element.getAttribute('stroke-width');
            if (strokeWidth === '3' || strokeWidth === '2.5') {
                element.setAttribute('stroke-width', '1.5');
            }
        }
        // Remove selection highlight rectangles (dbeafe fill)
        const fill = element.getAttribute('fill');
        if (fill === '#dbeafe') {
            element.remove();
            return;
        }
        // Recurse to children
        Array.from(element.children).forEach(child => removeSelection(child));
    };
    removeSelection(svgClone);

    // Also fix class-based fills (Tailwind classes)
    const textElements = svgClone.querySelectorAll('text, tspan');
    textElements.forEach(el => {
        const className = el.getAttribute('class') || '';
        if (className.includes('fill-slate-100') || className.includes('fill-slate-200')) {
            el.setAttribute('class', className.replace(/fill-slate-100|fill-slate-200/g, 'fill-slate-800'));
        }
    });

    // High resolution scale factor (3x for crisp export)
    const scale = 3;

    // Set viewBox to crop to content area
    svgClone.setAttribute('viewBox', `${minX} ${minY} ${contentWidth} ${contentHeight}`);
    svgClone.setAttribute('width', contentWidth.toString());
    svgClone.setAttribute('height', contentHeight.toString());

    // Serialize SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    // Create image and canvas
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        // Scale up canvas for higher resolution
        canvas.width = contentWidth * scale;
        canvas.height = contentHeight * scale;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            // Scale the context to draw at higher resolution
            ctx.scale(scale, scale);

            // Enable image smoothing for better quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Draw image (transparent background by default)
            ctx.drawImage(img, 0, 0, contentWidth, contentHeight);

            // Export as PNG with maximum quality
            canvas.toBlob((blob) => {
                if (blob) {
                    const pngUrl = URL.createObjectURL(blob);
                    // Show export modal with options
                    setExportModal({ blob, url: pngUrl });
                }
            }, 'image/png');
        }

        URL.revokeObjectURL(url);
    };
    img.src = url;
};
