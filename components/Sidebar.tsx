import React, { useState, useEffect, useRef } from 'react';
import { Entity, Attribute, Association, Connection } from '../types';
import { Plus, Trash2, ArrowRightLeft, Database, Download, Upload, XCircle, Image } from 'lucide-react';

interface SidebarProps {
  entities: Entity[];
  associations: Association[];
  onAddEntity: (name: string) => void;
  onUpdateEntity: (entity: Entity) => void;
  onDeleteEntity: (id: string) => void;
  onAddAssociation: (assoc: Omit<Association, 'id'>) => void;
  onUpdateAssociation: (assoc: Association) => void;
  onDeleteAssociation: (id: string) => void;
  selectedId: string | null;
  selectedType: 'entity' | 'association' | null;
  onExport: () => void;
  onExportPng: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  entities,
  associations,
  onAddEntity,
  onUpdateEntity,
  onDeleteEntity,
  onAddAssociation,
  onUpdateAssociation,
  onDeleteAssociation,
  selectedId,
  selectedType,
  onExport,
  onExportPng,
  onImport,
  onClear
}) => {
  const [newEntityName, setNewEntityName] = useState('');
  const [activeTab, setActiveTab] = useState<'entities' | 'associations'>('entities');

  // Auto-switch tab when selecting an item on the canvas
  useEffect(() => {
    if (selectedType === 'entity') {
      setActiveTab('entities');
    } else if (selectedType === 'association') {
      setActiveTab('associations');
    }
  }, [selectedId, selectedType]);

  // New Association State
  const [newAssocLabel, setNewAssocLabel] = useState('');

  // Track newly added attribute for auto-focus
  const [newlyAddedAttrId, setNewlyAddedAttrId] = useState<string | null>(null);
  const newAttrInputRef = useRef<HTMLInputElement>(null);

  // Helpers for Attributes
  const handleAddAttribute = (isAssoc: boolean, obj: Entity | Association) => {
    const newAttrId = crypto.randomUUID();
    const newAttr: Attribute = { id: newAttrId, name: '', isPk: false };
    if (isAssoc) {
      onUpdateAssociation({ ...obj as Association, attributes: [...obj.attributes, newAttr] });
    } else {
      onUpdateEntity({ ...obj as Entity, attributes: [...obj.attributes, newAttr] });
    }
    // Set the ID for auto-focus
    setNewlyAddedAttrId(newAttrId);
  };

  // Auto-focus on newly added attribute
  useEffect(() => {
    if (newlyAddedAttrId && newAttrInputRef.current) {
      newAttrInputRef.current.focus();
      newAttrInputRef.current.select();
      setNewlyAddedAttrId(null);
    }
  }, [newlyAddedAttrId]);

  const updateAttribute = (isAssoc: boolean, obj: Entity | Association, attrId: string, field: keyof Attribute, value: any) => {
    const updatedAttrs = obj.attributes.map(a => a.id === attrId ? { ...a, [field]: value } : a);
    if (isAssoc) onUpdateAssociation({ ...obj as Association, attributes: updatedAttrs });
    else onUpdateEntity({ ...obj as Entity, attributes: updatedAttrs });
  };

  const deleteAttribute = (isAssoc: boolean, obj: Entity | Association, attrId: string) => {
    const updatedAttrs = obj.attributes.filter(a => a.id !== attrId);
    if (isAssoc) onUpdateAssociation({ ...obj as Association, attributes: updatedAttrs });
    else onUpdateEntity({ ...obj as Entity, attributes: updatedAttrs });
  };

  // Connection Management for Associations
  const addConnection = (assoc: Association) => {
    if (entities.length === 0) return;
    const newConn: Connection = {
      id: crypto.randomUUID(),
      entityId: entities[0].id,
      cardinality: '0..n'
    };
    onUpdateAssociation({ ...assoc, connections: [...assoc.connections, newConn] });
  };

  const updateConnection = (assoc: Association, connId: string, field: keyof Connection, value: string) => {
    const newConns = assoc.connections.map(c => c.id === connId ? { ...c, [field]: value } : c);
    onUpdateAssociation({ ...assoc, connections: newConns });
  };

  const removeConnection = (assoc: Association, connId: string) => {
    onUpdateAssociation({ ...assoc, connections: assoc.connections.filter(c => c.id !== connId) });
  };

  const handleCreateAssociation = () => {
    if (!newAssocLabel.trim()) return;
    onAddAssociation({
      label: newAssocLabel,
      x: 300,
      y: 300,
      attributes: [],
      connections: []
    });
    setNewAssocLabel('');
  };

  // Derived selected object
  const selectedEntity = selectedType === 'entity' ? entities.find(e => e.id === selectedId) : null;
  const selectedAssoc = selectedType === 'association' ? associations.find(a => a.id === selectedId) : null;

  return (
    <div className="w-80 h-full bg-white border-l border-gray-200 flex flex-col shadow-xl z-10">
      {/* Header with Import/Export */}
      <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
        <h2 className="font-bold text-slate-800">UML Builder</h2>
        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Sauvegarder (Export JSON)"
          >
            <Download size={18} />
          </button>
          <button
            onClick={onExportPng}
            className="p-1.5 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
            title="Exporter en PNG (fond transparent)"
          >
            <Image size={18} />
          </button>
          <label
            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
            title="Ouvrir (Import JSON)"
          >
            <Upload size={18} />
            <input
              type="file"
              accept=".json"
              onChange={onImport}
              onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
              className="hidden"
            />
          </label>
          <button
            onClick={onClear}
            className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Effacer tout le diagramme"
          >
            <XCircle size={18} />
          </button>
        </div>
      </div>

      <div className="flex border-b">
        <button
          className={`flex-1 p-3 font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'entities' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
          onClick={() => setActiveTab('entities')}
        >
          <Database size={16} /> Entités
        </button>
        <button
          className={`flex-1 p-3 font-medium text-sm flex items-center justify-center gap-2 ${activeTab === 'associations' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
          onClick={() => setActiveTab('associations')}
        >
          <ArrowRightLeft size={16} /> Relations
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ENTITIES TAB */}
        {activeTab === 'entities' && (
          <div className="space-y-6">
            <form onSubmit={(e) => { e.preventDefault(); if (newEntityName) { onAddEntity(newEntityName); setNewEntityName('') } }} className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">Nouvelle Entité</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                  placeholder="Nom (ex: Client)"
                  className="flex-1 border rounded px-2 py-1 text-sm"
                />
                <button type="submit" className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"><Plus size={20} /></button>
              </div>
            </form>

            <hr />

            {selectedEntity ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800">Éditer: {selectedEntity.name}</h3>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteEntity(selectedEntity.id); }}
                    className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Nom</label>
                  <input type="text" value={selectedEntity.name} onChange={(e) => onUpdateEntity({ ...selectedEntity, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-bold" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-500 uppercase">Attributs</label>
                    <button onClick={() => handleAddAttribute(false, selectedEntity)} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">+ Ajouter</button>
                  </div>
                  {selectedEntity.attributes.map((attr, index) => (
                    <div key={attr.id} className="flex gap-1 items-center bg-gray-50 p-1 rounded border">
                      <input type="checkbox" checked={attr.isPk} onChange={(e) => updateAttribute(false, selectedEntity, attr.id, 'isPk', e.target.checked)} className="accent-red-500" title="Clé primaire" />
                      <input
                        type="text"
                        ref={attr.id === newlyAddedAttrId ? newAttrInputRef : null}
                        value={attr.name}
                        placeholder="nom attribut"
                        onChange={(e) => updateAttribute(false, selectedEntity, attr.id, 'name', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAttribute(false, selectedEntity);
                          }
                        }}
                        className={`flex-1 bg-transparent text-sm border-none p-0 ${attr.isPk ? 'font-bold' : ''}`}
                      />
                      {attr.isPk && <span className="text-xs bg-red-100 text-red-700 px-1 rounded font-bold">PK</span>}
                      <button onClick={() => deleteAttribute(false, selectedEntity, attr.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-400 text-xs mt-10">Sélectionnez une entité pour éditer.</p>
            )}
          </div>
        )}

        {/* ASSOCIATIONS TAB */}
        {activeTab === 'associations' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">Nouvelle Relation</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAssocLabel}
                  onChange={(e) => setNewAssocLabel(e.target.value)}
                  placeholder="Verbe (ex: achète)"
                  className="flex-1 border rounded px-2 py-1 text-sm"
                />
                <button onClick={handleCreateAssociation} className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"><Plus size={20} /></button>
              </div>
            </div>

            <hr />

            {selectedAssoc ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800">Relation: {selectedAssoc.label}</h3>
                  <button onClick={() => onDeleteAssociation(selectedAssoc.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16} /></button>
                </div>

                <div className="grid gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Libellé</label>
                    <input type="text" value={selectedAssoc.label} onChange={(e) => onUpdateAssociation({ ...selectedAssoc, label: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-bold" />
                  </div>
                  {/* Entity Name Field */}
                  <div>
                    <label className="text-xs text-gray-500 flex items-center gap-1">
                      Nom Entité Associative
                      <span className="text-[10px] text-gray-400 font-normal">(optionnel)</span>
                    </label>
                    <input
                      type="text"
                      value={selectedAssoc.entityName || ''}
                      onChange={(e) => onUpdateAssociation({ ...selectedAssoc, entityName: e.target.value })}
                      placeholder={selectedAssoc.label}
                      className="w-full border rounded px-2 py-1 text-sm italic"
                    />
                  </div>
                  {/* Label Movable checkbox - only for binary associations */}
                  {selectedAssoc.connections.length === 2 && (
                    <div className="flex items-center gap-2 bg-amber-50 p-2 rounded border border-amber-200">
                      <input
                        type="checkbox"
                        id="isLabelMovable"
                        checked={selectedAssoc.isLabelMovable || false}
                        onChange={(e) => onUpdateAssociation({ ...selectedAssoc, isLabelMovable: e.target.checked })}
                        className="accent-amber-500"
                      />
                      <label htmlFor="isLabelMovable" className="text-xs text-amber-800 cursor-pointer">
                        Libellé déplaçable
                      </label>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-500 uppercase">Liens ({selectedAssoc.connections.length})</label>
                    <button onClick={() => addConnection(selectedAssoc)} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200">+ Lier Entité</button>
                  </div>
                  <div className="space-y-2">
                    {selectedAssoc.connections.map(conn => (
                      <div key={conn.id} className="bg-gray-50 p-2 rounded border text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-500">Vers:</span>
                          <button onClick={() => removeConnection(selectedAssoc, conn.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                        </div>
                        <select
                          value={conn.entityId}
                          onChange={(e) => updateConnection(selectedAssoc, conn.id, 'entityId', e.target.value)}
                          className="w-full p-1 border rounded bg-white mb-1"
                        >
                          {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Card:</span>
                          <input
                            type="text"
                            list="card-options"
                            value={conn.cardinality}
                            onChange={(e) => updateConnection(selectedAssoc, conn.id, 'cardinality', e.target.value)}
                            className="flex-1 p-1 border rounded"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <datalist id="card-options">
                    {['0..1', '1..1', '0..n', '1..n', '0..*', '1..*'].map(opt => <option key={opt} value={opt} />)}
                  </datalist>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-500 uppercase">Propriétés</label>
                    <button onClick={() => handleAddAttribute(true, selectedAssoc)} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">+ Ajouter</button>
                  </div>
                  {selectedAssoc.attributes.map(attr => (
                    <div key={attr.id} className="flex gap-1 items-center bg-gray-50 p-1 rounded border">
                      <input type="checkbox" checked={attr.isPk} onChange={(e) => updateAttribute(true, selectedAssoc, attr.id, 'isPk', e.target.checked)} className="accent-red-500" title="Clé primaire" />
                      <input
                        type="text"
                        ref={attr.id === newlyAddedAttrId ? newAttrInputRef : null}
                        value={attr.name}
                        placeholder="nom propriété"
                        onChange={(e) => updateAttribute(true, selectedAssoc, attr.id, 'name', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAttribute(true, selectedAssoc);
                          }
                        }}
                        className={`flex-1 bg-transparent text-sm border-none p-0 ${attr.isPk ? 'font-bold' : ''}`}
                      />
                      {attr.isPk && <span className="text-xs bg-red-100 text-red-700 px-1 rounded font-bold">PK</span>}
                      <button onClick={() => deleteAttribute(true, selectedAssoc, attr.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {selectedAssoc.attributes.length === 0 && <p className="text-[10px] text-gray-400 italic">Ajoutez des propriétés pour faire une Entité-Association.</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-2 mt-4">
                <h4 className="text-xs font-bold text-gray-700">Liste des relations</h4>
                {associations.map(a => (
                  <div
                    key={a.id}
                    className="p-2 border rounded bg-white text-xs flex justify-between group"
                  >
                    <span>{a.label} <span className="text-gray-400">({a.connections.length} liens)</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};