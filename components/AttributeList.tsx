import React, { useState } from 'react';
import { Attribute } from '../types';
import { AttributeItem } from './AttributeItem';

interface AttributeListProps {
    attributes: Attribute[];
    onUpdate: (id: string, field: keyof Attribute, value: any) => void;
    onDelete: (id: string) => void;
    onAdd: () => void;
    onReorder: (fromId: string, toId: string) => void;
    newlyAddedAttrId: string | null;
    theme: 'light' | 'dark';
    label?: string;
}

export const AttributeList: React.FC<AttributeListProps> = ({
    attributes,
    onUpdate,
    onDelete,
    onAdd,
    onReorder,
    newlyAddedAttrId,
    theme,
    label = "Attributs"
}) => {
    const [draggedAttrId, setDraggedAttrId] = useState<string | null>(null);
    const [dragOverAttrId, setDragOverAttrId] = useState<string | null>(null);

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <label className={`text-xs font-bold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                    {label}
                </label>
                <button
                    onClick={onAdd}
                    className={`text-xs px-2 py-0.5 rounded ${theme === 'dark'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-green-100 text-green-700'
                        }`}
                >
                    + Ajouter
                </button>
            </div>

            {attributes.length === 0 && (
                <p className={`text-[10px] italic ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
                    Aucun attribut.
                </p>
            )}

            {attributes.map((attr) => (
                <AttributeItem
                    key={attr.id}
                    attr={attr}
                    theme={theme}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onAddNext={onAdd}
                    onDragStart={(e, id) => {
                        setDraggedAttrId(id);
                        e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                        setDraggedAttrId(null);
                        setDragOverAttrId(null);
                    }}
                    onDragOver={(e, id) => {
                        e.preventDefault();
                        if (draggedAttrId && draggedAttrId !== id) {
                            setDragOverAttrId(id);
                        }
                    }}
                    onDrop={(e, id) => {
                        e.preventDefault();
                        if (draggedAttrId && draggedAttrId !== id) {
                            onReorder(draggedAttrId, id);
                        }
                        setDraggedAttrId(null);
                        setDragOverAttrId(null);
                    }}
                    isDragging={draggedAttrId === attr.id}
                    isDragOver={dragOverAttrId === attr.id}
                    autoFocus={attr.id === newlyAddedAttrId}
                />
            ))}
        </div>
    );
};
