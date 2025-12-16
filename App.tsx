import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DiagramCanvas } from './components/DiagramCanvas';
import { Entity, Association } from './types';

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
  const [entities, setEntities] = useState<Entity[]>(initialEntities);
  const [associations, setAssociations] = useState<Association[]>(initialAssociations);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'entity' | 'association' | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleAddEntity = (name: string) => {
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

  const handleUpdateEntity = (updated: Entity) => {
    setEntities(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  const handleDeleteEntity = (id: string) => {
    if (window.confirm("Supprimer cette entité ?")) {
      // 1. Remove entity
      setEntities(prev => prev.filter(e => e.id !== id));

      // 2. Update associations based on rules
      setAssociations(prevAssocs => {
        return prevAssocs.reduce((acc, assoc) => {
          const isConnected = assoc.connections.some(c => c.entityId === id);

          if (!isConnected) {
            // Not connected to deleted entity: Keep as is
            acc.push(assoc);
          } else {
            // Connected. Check arity (number of connections)
            // If it was a Ternary or more (>2), we keep it but remove the leg.
            // If it was Binary or Unary (<=2), we delete it entirely.
            if (assoc.connections.length > 2) {
              acc.push({
                ...assoc,
                connections: assoc.connections.filter(c => c.entityId !== id)
              });
            }
            // Else: drop association (it becomes invalid/too simple)
          }
          return acc;
        }, [] as Association[]);
      });

      setSelectedId(null);
      setSelectedType(null);
    }
  };

  const handleAddAssociation = (assoc: Omit<Association, 'id'>) => {
    const newAssoc = { ...assoc, id: crypto.randomUUID() };
    setAssociations(prev => [...prev, newAssoc]);
    setSelectedId(newAssoc.id);
    setSelectedType('association');
  };

  const handleUpdateAssociation = (updated: Association) => {
    setAssociations(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const handleDeleteAssociation = (id: string) => {
    setAssociations(prev => prev.filter(a => a.id !== id));
    setSelectedId(null);
    setSelectedType(null);
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
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `mcd_diagram_${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(pngUrl);
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-900">
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
        />

        <div className="absolute bottom-4 left-4 bg-white/90 p-3 rounded-lg shadow-md border border-slate-200 pointer-events-none">
          <h4 className="font-bold text-sm text-slate-700 mb-1">Guide V2 (MCD)</h4>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>• Entités = rectangles.</li>
            <li>• Relations = Libellé (2), Triangle (3), Carré (4+).</li>
            <li>• Glissez le libellé pour courber la ligne.</li>
            <li>• Ajoutez des propriétés à une relation pour faire une Entité-Association.</li>
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
        onExport={handleExport}
        onExportPng={handleExportPng}
        onImport={handleImport}
        onClear={handleClear}
      />
    </div>
  );
}