import React, { useRef, useEffect } from 'react';
import { Attribute } from '../types';
import { Trash2 } from 'lucide-react';

interface AttributeItemProps {
    attr: Attribute;
    onUpdate: (id: string, field: keyof Attribute, value: any) => void;
    onDelete: (id: string) => void;
    onAddNext: () => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent, id: string) => void;
    onDragLeave: (id: string) => void;
    onDrop: (e: React.DragEvent, id: string) => void;
    isDragging: boolean;
    isDragOver: boolean;
    theme: 'light' | 'dark';
    autoFocus?: boolean;
    dropPosition?: 'top' | 'bottom';
}

export const AttributeItem: React.FC<AttributeItemProps> = ({
    attr,
    onUpdate,
    onDelete,
    onAddNext,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    isDragging,
    isDragOver,
    theme,
    autoFocus,
    dropPosition // New prop
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [autoFocus]);

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, attr.id)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, attr.id)}
            onDragLeave={() => onDragLeave(attr.id)}
            onDrop={(e) => onDrop(e, attr.id)}
            className={`relative flex gap-1 items-center p-1 rounded border transition-all duration-200
                ${isDragging ? 'opacity-50' : ''}
                ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}
                ${isDragOver && dropPosition === 'top' ? 'border-t-4 border-t-blue-500' : ''}
                ${isDragOver && dropPosition === 'bottom' ? 'border-b-4 border-b-blue-500' : ''}
                ${isDragOver && !dropPosition ? 'border-blue-500' : ''} 
            `}
        >
            <span
                className={`cursor-grab active:cursor-grabbing select-none px-0.5 ${theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'
                    }`}
                title="Glisser pour réordonner"
            >
                ⠿
            </span>
            <input
                type="checkbox"
                checked={attr.isPk}
                onChange={(e) => onUpdate(attr.id, 'isPk', e.target.checked)}
                className="accent-red-500 shrink-0"
                title="Clé primaire"
            />
            <input
                type="text"
                ref={inputRef}
                value={attr.name}
                placeholder="nom attribut"
                onChange={(e) => onUpdate(attr.id, 'name', e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onAddNext();
                    }
                }}
                className={`flex-1 bg-transparent text-sm border-none p-0 min-w-0 ${attr.isPk ? 'font-bold' : ''
                    } ${theme === 'dark' ? 'text-slate-100 placeholder-slate-500' : 'text-slate-800'
                    }`}
            />
            {attr.isPk && (
                <span className="text-xs bg-red-100 text-red-700 px-1 rounded font-bold shrink-0">
                    PK
                </span>
            )}
            <button
                onClick={() => onDelete(attr.id)}
                className={`shrink-0 ${theme === 'dark' ? 'text-slate-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'
                    }`}
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
};
