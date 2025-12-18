import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { Entity, Association } from './types';
import { useTheme } from './components/ThemeContext';

// Initial data compatible with new N-ary structure
const initialEntities: Entity[] = [
  {
    id: '1',
    name: 'Skieur',
    x: 100,
    y: 100,
    width: 160,
    height: 100,
    attributes: [
      { id: 'a1', name: 'nomski', isPk: true },
      { id: 'a2', name: 'spécialité', isPk: false },
    ]
  },
  {
    id: '2',
    name: 'Compétition',
    x: 500,
    y: 300,
    width: 160,
    height: 100,
    attributes: [
      { id: 'b1', name: 'refcomp', isPk: true },
      { id: 'b2', name: 'datecomp', isPk: false },
    ]
  },
  {
    id: '3',
    name: 'Station',
    x: 600,
    y: 50,
    width: 160,
    height: 120,
    attributes: [
      { id: 'c1', name: 'nomstat', isPk: true },
      { id: 'c2', name: 'altstat', isPk: false },
    ]
  }
];

const initialAssociations: Association[] = [
  {
    id: 'rel1',
    label: 'Participe',
    entityName: 'Participation', // Example Named Entity Association
    x: 350,
    y: 250,
    attributes: [
      { id: 'attr_score', name: 'score', isPk: false }
    ],
    connections: [
      { id: 'c1', entityId: '1', cardinality: '1..*' },
      { id: 'c2', entityId: '2', cardinality: '0..*' }
    ]
  },
  {
    id: 'rel2',
    label: 'se déroule',
    x: 680,
    y: 230,
    attributes: [],
    connections: [
      { id: 'c3', entityId: '2', cardinality: '*' },
      { id: 'c4', entityId: '3', cardinality: '1' }
    ]
  }
];

export default function App() {
  const { theme } = useTheme();
  const [entities, setEntities] = useState<Entity[]>(initialEntities);
  const [associations, setAssociations] = useState<Association[]>(initialAssociations);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'entity' | 'association' | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Focus field state for auto-focus in Sidebar
  const [focusField, setFocusField] = useState<{ type: 'entity-name' | 'association-label'; id: string } | null>(null);

  // Export modal state
  const [exportModal, setExportModal] = useState<{ blob: Blob; url: string } | null>(null);

  // History for undo functionality
  const [history, setHistory] = useState<Array<{ entities: Entity[]; associations: Association[] }>>([]);
  const maxHistorySize = 50;

  // Save current state to history
  const saveToHistory = () => {
    setHistory(prev => {
      const newHistory = [...prev, { entities, associations }];
      if (newHistory.length > maxHistorySize) {
        return newHistory.slice(-maxHistorySize);
      }
      return newHistory;
    });
  };

  // Undo function
  const handleUndo = () => {
    if (history.length === 0) return;

    const previousState = history[history.length - 1];
    setEntities(previousState.entities);
    setAssociations(previousState.associations);
    setHistory(prev => prev.slice(0, -1));
    setSelectedId(null);
    setSelectedType(null);
    setToast({ message: "Annulé", type: 'success' });
  };

  // Keyboard shortcuts: Delete and Ctrl+Z
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // For Delete key (not Backspace), check if we should delete the entity/association
      if (e.key === 'Delete') {
        // If in an input, only delete entity if ALL text is selected
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          const input = target as HTMLInputElement;
          const isAllSelected = input.selectionStart === 0 &&
            input.selectionEnd === input.value.length &&
            input.value.length > 0;
          // If not all selected, let normal input behavior happen
          if (!isAllSelected) return;
        }

        if (selectedId && selectedType) {
          e.preventDefault();
          // Blur any focused input before deleting
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          if (selectedType === 'entity') {
            handleDeleteEntityDirect(selectedId);
          } else {
            handleDeleteAssociationDirect(selectedId);
          }
        }
      }

      // Ctrl+Z - Undo (only if not in input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedType, entities, associations, history]);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleAddEntity = (name: string) => {
    saveToHistory();
    const newEntity: Entity = {
      id: crypto.randomUUID(),
      name,
      x: 100 + Math.random() * 50,
      y: 100 + Math.random() * 50,
      width: 160,
      height: 80,
      attributes: []
    };
    setEntities(prev => [...prev, newEntity]);
    setSelectedId(newEntity.id);
    setSelectedType('entity');
  };

  // Create entity at specific position (for double-click)
  const handleCreateEntityAtPosition = (x: number, y: number) => {
    saveToHistory();
    const newEntity: Entity = {
      id: crypto.randomUUID(),
      name: 'Nouvelle entité',
      x,
      y,
      width: 160,
      height: 80,
      attributes: []
    };
    setEntities(prev => [...prev, newEntity]);
    setSelectedId(newEntity.id);
    setSelectedType('entity');
    setFocusField({ type: 'entity-name', id: newEntity.id });
  };

  // Quick connect entities (for Ctrl+click)
  const handleQuickConnect = (sourceId: string, sourceType: 'entity' | 'association', targetEntityId: string) => {
    saveToHistory();
    if (sourceType === 'entity') {
      // Create a new association between two entities
      const sourceEntity = entities.find(e => e.id === sourceId);
      const targetEntity = entities.find(e => e.id === targetEntityId);
      if (!sourceEntity || !targetEntity) return;

      // Calculate position at midpoint between entities
      const midX = (sourceEntity.x + sourceEntity.width / 2 + targetEntity.x + targetEntity.width / 2) / 2;
      const midY = (sourceEntity.y + sourceEntity.height / 2 + targetEntity.y + targetEntity.height / 2) / 2;

      const newAssoc: Association = {
        id: crypto.randomUUID(),
        label: '',
        x: midX,
        y: midY,
        attributes: [],
        connections: [
          { id: crypto.randomUUID(), entityId: sourceId, cardinality: '0..*' },
          { id: crypto.randomUUID(), entityId: targetEntityId, cardinality: '0..*' }
        ]
      };
      setAssociations(prev => [...prev, newAssoc]);
      setSelectedId(newAssoc.id);
      setSelectedType('association');
      setFocusField({ type: 'association-label', id: newAssoc.id });
    } else {
      // Add a connection to an existing association
      const assoc = associations.find(a => a.id === sourceId);
      if (!assoc) return;

      // Check if the entity is already connected
      if (assoc.connections.some(c => c.entityId === targetEntityId)) return;

      const updatedAssoc: Association = {
        ...assoc,
        connections: [
          ...assoc.connections,
          { id: crypto.randomUUID(), entityId: targetEntityId, cardinality: '0..*' }
        ]
      };
      setAssociations(prev => prev.map(a => a.id === sourceId ? updatedAssoc : a));
      setSelectedId(sourceId);
      setSelectedType('association');
      setFocusField({ type: 'association-label', id: sourceId });
    }
  };

  const handleFocusHandled = () => {
    setFocusField(null);
  };

  const handleUpdateEntity = (updated: Entity) => {
    saveToHistory();
    setEntities(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  // Direct delete without confirmation (called from keyboard shortcut)
  const handleDeleteEntityDirect = (id: string) => {
    saveToHistory();
    // 1. Remove entity
    setEntities(prev => prev.filter(e => e.id !== id));

    // 2. Update associations based on rules
    setAssociations(prevAssocs => {
      return prevAssocs.reduce((acc, assoc) => {
        const isConnected = assoc.connections.some(c => c.entityId === id);

        if (!isConnected) {
          acc.push(assoc);
        } else {
          if (assoc.connections.length > 2) {
            acc.push({
              ...assoc,
              connections: assoc.connections.filter(c => c.entityId !== id)
            });
          }
        }
        return acc;
      }, [] as Association[]);
    });

    setSelectedId(null);
    setSelectedType(null);
  };

  // Delete from sidebar button (no confirmation now)
  const handleDeleteEntity = (id: string) => {
    handleDeleteEntityDirect(id);
  };

  const handleAddAssociation = (assoc: Omit<Association, 'id'>) => {
    saveToHistory();
    const newAssoc = { ...assoc, id: crypto.randomUUID() };
    setAssociations(prev => [...prev, newAssoc]);
    setSelectedId(newAssoc.id);
    setSelectedType('association');
  };

  const handleUpdateAssociation = (updated: Association) => {
    saveToHistory();
    setAssociations(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  // Direct delete without confirmation (called from keyboard shortcut)
  const handleDeleteAssociationDirect = (id: string) => {
    saveToHistory();
    setAssociations(prev => prev.filter(a => a.id !== id));
    setSelectedId(null);
    setSelectedType(null);
  };

  const handleDeleteAssociation = (id: string) => {
    handleDeleteAssociationDirect(id);
  };

  const handleMove = (id: string, x: number, y: number, type: 'entity' | 'association') => {
    if (type === 'entity') {
      setEntities(prev => prev.map(e => e.id === id ? { ...e, x, y } : e));
    } else {
      setAssociations(prev => prev.map(a => a.id === id ? { ...a, x, y } : a));
    }
  };

  const handleMoveEntityBox = (id: string, x: number, y: number) => {
    setAssociations(prev => prev.map(a =>
      a.id === id ? { ...a, entityBoxX: x, entityBoxY: y } : a
    ));
  };

  const handleSelect = (id: string | null, type: 'entity' | 'association' | null) => {
    setSelectedId(id);
    setSelectedType(type);
    // Auto-focus on name/label field when selected
    if (type === 'entity' && id) {
      setFocusField({ type: 'entity-name', id });
    } else if (type === 'association' && id) {
      setFocusField({ type: 'association-label', id });
    }
  };


  // Export Logic
  const handleExport = () => {
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

  // Export PNG Logic
  const handleExportPng = () => {
    const svgElement = document.querySelector('svg');
    if (!svgElement) return;
    if (entities.length === 0 && associations.length === 0) {
      alert("Le diagramme est vide !");
      return;
    }

    // Import geometry helper for calculating entity dimensions
    const HEADER_HEIGHT = 30;
    const ROW_HEIGHT = 24;
    const PADDING = 10;
    const CHAR_WIDTH = 8;

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

  // Clear All Logic
  const handleClear = () => {
    if (entities.length === 0 && associations.length === 0) return;
    if (window.confirm("Voulez-vous vraiment effacer tout le diagramme ?")) {
      setEntities([]);
      setAssociations([]);
      setSelectedId(null);
      setSelectedType(null);
    }
  };

  // Import Logic
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if ((entities.length > 0 || associations.length > 0) && !window.confirm("Importer écrasera le diagramme actuel. Continuer ?")) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json);

        if (Array.isArray(data.entities) && Array.isArray(data.associations)) {
          setEntities(data.entities);
          setAssociations(data.associations);
          setSelectedId(null);
          setSelectedType(null);
          setToast({ message: "Import réussi !", type: 'success' });
        } else {
          setToast({ message: "Format de fichier invalide.", type: 'error' });
        }
      } catch (err) {
        console.error(err);
        setToast({ message: "Erreur lors de la lecture du fichier.", type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all duration-300 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`}
        >
          {toast.message}
        </div>
      )}

      <main className="flex-1 relative shadow-inner">
        <DiagramCanvas
          entities={entities}
          associations={associations}
          onMove={handleMove}
          onMoveEntityBox={handleMoveEntityBox}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateEntityAtPosition={handleCreateEntityAtPosition}
          onQuickConnect={handleQuickConnect}
        />

        <div className={`absolute bottom-4 left-4 p-3 rounded-lg shadow-md border pointer-events-none transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-slate-200'}`}>
          <h4 className={`font-bold text-sm mb-1 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>Guide (MCD)</h4>
          <ul className={`text-xs space-y-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
            <li>• Double-clic = créer entité.</li>
            <li>• Ctrl+Clic = relier entités.</li>
          </ul>
        </div>
      </main>

      <Sidebar
        entities={entities}
        associations={associations}
        onAddEntity={handleAddEntity}
        onUpdateEntity={handleUpdateEntity}
        onDeleteEntity={handleDeleteEntity}
        onAddAssociation={handleAddAssociation}
        onUpdateAssociation={handleUpdateAssociation}
        onDeleteAssociation={handleDeleteAssociation}
        selectedId={selectedId}
        selectedType={selectedType}
        onExportPng={handleExportPng}
        onExport={handleExport}
        onImport={handleImport}
        onClear={handleClear}
        focusField={focusField}
        onFocusHandled={handleFocusHandled}
      />

      {/* Export Modal */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => {
          URL.revokeObjectURL(exportModal.url);
          setExportModal(null);
        }}>
          <div
            className={`p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-lg font-bold mb-4 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
              Exporter l'image
            </h3>

            {/* Preview */}
            <div className="mb-4 border rounded-lg overflow-hidden">
              <img src={exportModal.url} alt="Aperçu du diagramme" className="w-full h-auto max-h-48 object-contain bg-gray-100" />
            </div>

            <div className="flex flex-col gap-3">
              {/* Copy to Clipboard */}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': exportModal.blob })
                    ]);
                    setToast({ message: 'Image copiée dans le presse-papiers !', type: 'success' });
                    URL.revokeObjectURL(exportModal.url);
                    setExportModal(null);
                  } catch (err) {
                    console.error('Clipboard write failed:', err);
                    setToast({ message: 'Erreur: impossible de copier', type: 'error' });
                  }
                }}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copier dans le presse-papiers
              </button>

              {/* Save File */}
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = exportModal.url;
                  a.download = `mcd_diagram_${new Date().toISOString().slice(0, 10)}.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(exportModal.url);
                  setExportModal(null);
                  setToast({ message: 'Image téléchargée !', type: 'success' });
                }}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors font-medium border ${theme === 'dark' ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-gray-300 text-slate-700 hover:bg-gray-50'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Enregistrer l'image
              </button>

              {/* Cancel */}
              <button
                onClick={() => {
                  URL.revokeObjectURL(exportModal.url);
                  setExportModal(null);
                }}
                className={`px-4 py-2 text-sm ${theme === 'dark' ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}