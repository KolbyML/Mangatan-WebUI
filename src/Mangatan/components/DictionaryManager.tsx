import React, { useEffect, useState } from 'react';
import { getDictionaries, manageDictionary, DictionaryMeta } from '@/Mangatan/utils/api';
import { useOCR } from '@/Mangatan/context/OCRContext';

export const DictionaryManager: React.FC<{ onImportClick: () => void }> = ({ onImportClick }) => {
    const { showConfirm, showProgress, closeDialog } = useOCR();
    const [dicts, setDicts] = useState<DictionaryMeta[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = async () => {
        setLoading(true);
        const list = await getDictionaries();
        setDicts(list);
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);

    const handleToggle = async (id: number, current: boolean) => {
        await manageDictionary('Toggle', { id, enabled: !current });
        refresh();
    };

    const handleDelete = async (id: number, name: string) => {
        showConfirm('Delete Dictionary?', `Are you sure you want to delete "${name}"?`, async () => {
            showProgress('Deleting...');
            await manageDictionary('Delete', { id });
            await refresh();
            closeDialog();
        });
    };

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === dicts.length - 1) return;

        const newDicts = [...dicts];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        
        [newDicts[index], newDicts[swapIndex]] = [newDicts[swapIndex], newDicts[index]];
        
        setDicts(newDicts);

        const idOrder = newDicts.map(d => d.id);
        await manageDictionary('Reorder', { order: idOrder });
        refresh(); 
    };

    return (
        <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>Installed Dictionaries</h4>
                <button type="button" onClick={onImportClick} style={{ padding: '4px 8px', fontSize: '12px' }}>
                    + Import New
                </button>
            </div>

            {loading && <div style={{ fontSize: '12px', color: '#aaa' }}>Loading...</div>}

            {!loading && dicts.length === 0 && (
                <div style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>No dictionaries installed.</div>
            )}

            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {dicts.map((d, i) => (
                    <div key={d.id} style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', 
                        background: '#333', padding: '6px', marginBottom: '4px', borderRadius: '4px' 
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <button type="button" disabled={i === 0} onClick={() => handleMove(i, 'up')} style={{ fontSize: '8px', padding: '0 4px', lineHeight: '1', height: '12px' }}>▲</button>
                            <button type="button" disabled={i === dicts.length - 1} onClick={() => handleMove(i, 'down')} style={{ fontSize: '8px', padding: '0 4px', lineHeight: '1', height: '12px' }}>▼</button>
                        </div>
                        <div style={{ flexGrow: 1, fontSize: '13px', color: d.enabled ? '#fff' : '#777' }}>{d.name}</div>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input type="checkbox" checked={d.enabled} onChange={() => handleToggle(d.id, d.enabled)} />
                        </label>
                        <button type="button" onClick={() => handleDelete(d.id, d.name)} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: '3px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
                    </div>
                ))}
            </div>
        </div>
    );
};