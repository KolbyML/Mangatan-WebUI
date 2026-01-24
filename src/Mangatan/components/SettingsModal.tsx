import React, { useState, useRef, useEffect } from 'react';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { AppStorage } from '@/lib/storage/AppStorage.ts';
import { COLOR_THEMES, DEFAULT_SETTINGS } from '@/Mangatan/types';
import { apiRequest, getAppVersion, checkForUpdates, triggerAppUpdate, installAppUpdate } from '@/Mangatan/utils/api';
import { DictionaryManager } from './DictionaryManager';
import { getAnkiVersion, getDeckNames, getModelNames, getModelFields } from '@/Mangatan/utils/anki';

const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer', textAlign: 'left', 
};

const checkboxInputStyle: React.CSSProperties = {
    width: 'auto', marginRight: '10px', flexShrink: 0, cursor: 'pointer',
};

const sectionBoxStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.2)', 
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '20px'
};

const statusDotStyle = (connected: boolean): React.CSSProperties => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: connected ? '#2ecc71' : '#e74c3c',
    display: 'inline-block',
    marginRight: '8px',
    boxShadow: connected ? '0 0 5px #2ecc71' : 'none'
});

const MAPPING_OPTIONS = ['None', 'Sentence', 'Image', 'Furigana', 'Reading', 'Target Word', 'Definition', 'Frequency'];
export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { settings, setSettings, showConfirm, showAlert, showProgress, closeDialog, showDialog } = useOCR();
    const [localSettings, setLocalSettings] = useState(settings);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dictManagerKey, setDictManagerKey] = useState(0);

    // --- ANKI STATE ---
    const [ankiStatus, setAnkiStatus] = useState<'idle' | 'loading' | 'connected' | 'error'>('idle');
    const [ankiDecks, setAnkiDecks] = useState<string[]>([]);
    const [ankiModels, setAnkiModels] = useState<string[]>([]);
    const [currentModelFields, setCurrentModelFields] = useState<string[]>([]);

    // --- DICT INSTALL STATE ---
    const [isInstalling, setIsInstalling] = useState(false);
    const [installMessage, setInstallMessage] = useState('');

    // --- UPDATE STATE ---
    const [appVersion, setAppVersion] = useState<string>('...');
    const [updateAvailable, setUpdateAvailable] = useState<any>(null);
    const [updateStatus, setUpdateStatus] = useState<string>('idle');

    // --- ANKI EFFECT ---
    const fetchAnkiData = async () => {
        if (!localSettings.ankiConnectEnabled) return;
        
        const url = localSettings.ankiConnectUrl || 'http://127.0.0.1:8765';
        setAnkiStatus('loading');
        
        const status = await getAnkiVersion(url);
        if (status.ok) {
            setAnkiStatus('connected');
            try {
                const [d, m] = await Promise.all([
                    getDeckNames(url),
                    getModelNames(url)
                ]);
                setAnkiDecks(d);
                setAnkiModels(m);
            } catch (e) {
                console.error("Failed to fetch anki metadata", e);
            }
        } else {
            setAnkiStatus('error');
        }
    };

    useEffect(() => {
        if (localSettings.ankiConnectEnabled) {
            fetchAnkiData();
        }
    }, [localSettings.ankiConnectEnabled]); 

    // Fetch fields when model changes or when connection is established with a pre-selected model
    useEffect(() => {
        const fetchFields = async () => {
             const url = localSettings.ankiConnectUrl || 'http://127.0.0.1:8765';
             if (ankiStatus === 'connected' && localSettings.ankiModel) {
                 try {
                     const f = await getModelFields(url, localSettings.ankiModel);
                     setCurrentModelFields(f);
                 } catch(e) { console.error(e); }
             }
        };
        fetchFields();
    }, [localSettings.ankiModel, ankiStatus]);


    // --- POLL STATUS ---
    useEffect(() => {
        let isMounted = true;

        const checkStatus = async () => {
            try {
                const info = await getAppVersion();
                if (!isMounted) return;

                if (info.version !== '0.0.0') {
                    setAppVersion(`${info.version} (${info.variant})`);
                }

                if (info.update_status && info.update_status !== 'idle') {
                    setUpdateStatus(info.update_status);
                } 
                else if (info.variant !== 'unknown' && info.variant !== 'desktop' && info.variant !== 'ios') {
                    if (!updateAvailable) {
                        const update = await checkForUpdates(info.version, info.variant);
                        if (isMounted && update.hasUpdate) setUpdateAvailable(update);
                    }
                    if (updateStatus !== 'downloading' && updateStatus !== 'ready') {
                        setUpdateStatus('idle');
                    }
                }
            } catch (e) { console.error(e); }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 2000); 
        return () => { isMounted = false; clearInterval(interval); };
    }, [updateStatus, updateAvailable]); 

    // --- ACTIONS ---

    const handleDownload = () => {
        if (!updateAvailable) return;
        showDialog({
            type: 'confirm',
            title: 'Download Update',
            message: 'Version ' + updateAvailable.version + ' will download in the background.',
            // @ts-ignore
            confirmText: 'Start',
            cancelText: 'Cancel',
            onConfirm: async () => {
                await triggerAppUpdate(updateAvailable.url, updateAvailable.name);
                setUpdateStatus('downloading'); 
            }
        });
    };

    const handleInstall = async () => {
        try {
            await installAppUpdate();
        } catch (e) {
            showAlert('Error', 'Failed to launch installer.');
        }
    };

    // --- SETTINGS LOGIC ---
    const handleChange = async (key: keyof typeof settings | string, value: any) => {
        setLocalSettings((prev) => ({ ...prev, [key]: value }));

        if (key === 'enableYomitan' && value === true) {
             try {
                setIsInstalling(true);
                setInstallMessage('Checking dictionaries...');
                
                const res = await apiRequest<{status: string, message: string}>('/api/yomitan/install-defaults', { method: 'POST' });
                
                if (res.status === 'ok' && res.message.includes('Imported')) {
                    setDictManagerKey(prev => prev + 1);
                }
            } catch (e) { 
                console.error("Failed to install defaults", e);
            } finally {
                setIsInstalling(false);
                setInstallMessage('');
            }
        }
    };

    const handleFieldMapChange = (ankiField: string, mapValue: string) => {
        const currentMap = (localSettings.ankiFieldMap as Record<string, string>) || {};
        const newMap = { ...currentMap, [ankiField]: mapValue };

        // Ensure "Target Word" is unique
        if (mapValue === 'Target Word') {
            Object.keys(newMap).forEach(key => {
                if (key !== ankiField && newMap[key] === 'Target Word') {
                    newMap[key] = 'None';
                }
            });
        }

        handleChange('ankiFieldMap', newMap);
    };

    // New helper to handle the inverted selection (Content -> Field)
    const handleContentToFieldChange = (contentType: string, targetField: string) => {
        const newMap = { ...localSettings.ankiFieldMap };

        // 1. Remove this content type from any other fields to prevent duplicates
        Object.keys(newMap).forEach(key => {
            if (newMap[key] === contentType) {
                delete newMap[key]; 
            }
        });

        // 2. Assign the content type to the new target field
        if (targetField) {
            newMap[targetField] = contentType;
        }

        handleChange('ankiFieldMap', newMap);
    };

    // Helper to find the field currently mapped to a specific content type
    const getFieldForContent = (contentType: string) => {
        return Object.keys(localSettings.ankiFieldMap || {}).find(key => localSettings.ankiFieldMap?.[key] === contentType) || '';
    };

    const save = () => {
        AppStorage.local.setItem('mangatan_settings_v3', JSON.stringify(localSettings));
        setSettings(localSettings);
        onClose();
        window.location.reload();
    };

    const resetToDefaults = () => {
        showConfirm('Reset?', 'Revert to defaults?', () => {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            setLocalSettings({ ...DEFAULT_SETTINGS, mobileMode: isMobile });
            closeDialog(); 
        });
    };

    const purgeCache = () => {
        showConfirm('Purge Cache?', 'Delete server cache?', async () => {
            try {
                showProgress('Purging...');
                await apiRequest(`/api/ocr/purge-cache`, { method: 'POST' });
                closeDialog(); 
                showAlert('Success', 'Cache deleted.');
            } catch (e) { closeDialog(); showAlert('Error', 'Failed.'); }
        });
    };

    const resetYomitanDB = () => {
        showConfirm('Reset DB?', 'Delete all dictionaries?', async () => {
            try {
                showProgress('Resetting...');
                const res = await apiRequest<{status: string}>(`/api/yomitan/reset`, { method: 'POST' });
                if (res.status === 'ok') {
                    closeDialog(); 
                    showAlert('Success', 'Reset complete.');
                    setDictManagerKey(p => p + 1);
                } else throw new Error();
            } catch (e) { closeDialog(); showAlert('Error', 'Failed.'); }
        });
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('file', file);
            try {
                showProgress(`Importing...`);
                const res = await fetch('/api/yomitan/import', { method: 'POST', body: formData });
                const json = await res.json();
                closeDialog(); 
                showAlert(json.status === 'ok' ? 'Success' : 'Failed', json.message);
                if (json.status === 'ok') setDictManagerKey(p => p + 1);
            } catch (err) { closeDialog(); showAlert('Error', String(err)); }
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const isNativeApp = typeof navigator !== 'undefined' && navigator.userAgent.includes('MangatanNative');
    const isiOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

    const showDicts = isNativeApp || localSettings.enableYomitan;

    return (
        <div className="ocr-modal-overlay" onClick={onClose}>
            <div className="ocr-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ocr-modal-header">
                    <h2>Settings</h2>
                </div>
                <div className="ocr-modal-content">
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".zip" onChange={handleFileChange} />

                    {/* --- UPDATE BANNER --- */}
                    {updateStatus === 'downloading' && (
                        <div style={{ backgroundColor: '#f39c12', color: 'white', padding: '15px', borderRadius: '5px', marginBottom: '15px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                <div style={{
                                    width: '18px', height: '18px', 
                                    border: '3px solid rgba(255,255,255,0.3)', 
                                    borderTop: '3px solid white', 
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <b>Downloading Update...</b>
                            </div>
                            <small style={{opacity: 0.9}}>Please check your notification tray.</small>
                            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}
                    {updateStatus === 'ready' && (
                        <div style={{ backgroundColor: '#27ae60', color: 'white', padding: '10px', borderRadius: '5px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><b>Download Complete</b></span>
                            <button type="button" onClick={handleInstall} style={{ backgroundColor: 'white', color: '#27ae60', border: 'none', fontWeight: 'bold', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                Install Now
                            </button>
                        </div>
                    )}
                    {updateStatus === 'idle' && updateAvailable && (
                        <div style={{ backgroundColor: '#3498db', color: 'white', padding: '10px', borderRadius: '5px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><b>New Version:</b> {updateAvailable.version}</span>
                            <button type="button" onClick={handleDownload} style={{ backgroundColor: 'white', color: '#2980b9', border: 'none', fontWeight: 'bold', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                Download
                            </button>
                        </div>
                    )}
                    <div style={{ textAlign: 'center', marginBottom: '10px', color: '#666', fontSize: '0.9em' }}>
                        Version: {appVersion}
                    </div>

                    {/* --- POPUP DICTIONARY SECTION --- */}
                    <h3>Popup Dictionary</h3>
                    <div style={sectionBoxStyle}>
                        <label style={checkboxLabelStyle}>
                            <input 
                                type="checkbox" 
                                checked={localSettings.enableYomitan} 
                                onChange={e => handleChange('enableYomitan', e.target.checked)} 
                                style={checkboxInputStyle} 
                            />
                            Enable Popup Dictionary
                        </label>
                        
                        <div style={{
                            maxHeight: showDicts ? '800px' : '0px',
                            opacity: showDicts ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-in-out',
                        }}>
                             <div style={{ paddingTop: '15px' }}>
                                 {/* Result Grouping Dropdown */}
                                 <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label htmlFor="groupingMode" style={{fontSize: '0.9em', color: '#ccc'}}>Result Grouping</label>
                                    <select
                                        id="groupingMode"
                                        value={localSettings.resultGroupingMode || 'grouped'}
                                        onChange={(e) => handleChange('resultGroupingMode', e.target.value)}
                                        style={{ padding: '6px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: 'white' }}
                                    >
                                        <option value="grouped">Group by Term</option>
                                        <option value="flat">No Grouping</option>
                                    </select>
                                 </div>

                                {isInstalling && (
                                    <div style={{ fontSize: '0.9em', color: '#aaa', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '12px', height: '12px', 
                                            border: '2px solid rgba(255,255,255,0.2)', 
                                            borderTop: '2px solid white', 
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite'
                                        }} />
                                        {installMessage}
                                    </div>
                                )}
                                <DictionaryManager key={dictManagerKey} onImportClick={handleImportClick} />
                            </div>
                        </div>
                    </div>

                    {/* --- ANKI CONNECT SECTION --- */}
                    {!isiOS && (
                        <>
                        <h3>AnkiConnect Integration</h3>
                        <div style={sectionBoxStyle}>
                            <label style={checkboxLabelStyle}>
                                <input 
                                    type="checkbox" 
                                    checked={localSettings.ankiConnectEnabled ?? false} 
                                    onChange={(e) => handleChange('ankiConnectEnabled', e.target.checked)} 
                                    style={checkboxInputStyle} 
                                />
                                <div>
                                    Enable AnkiConnect
                                    <div style={{ opacity: 0.5, fontSize: '0.9em' }}>
                                        {localSettings.enableYomitan 
                                            ? "Automatically add cards via the Popup Dictionary" 
                                            : "Right-click (desktop) or hold (mobile) to update the last card (useful for third-party dictionaries)"
                                        }
                                    </div>
                                </div>
                            </label>

                            {/* Collapsible Anki Settings */}
                            <div style={{
                                maxHeight: localSettings.ankiConnectEnabled ? 'none' : '0px',
                                opacity: localSettings.ankiConnectEnabled ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-in-out',
                            }}>
                                <div style={{ marginTop: '10px', paddingLeft: '5px' }}>
                                    {/* Connection Status & URL */}
                                    <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                        <div style={{display:'flex', alignItems:'center'}}>
                                            <span style={statusDotStyle(ankiStatus === 'connected')}></span>
                                            <span style={{color: ankiStatus === 'connected' ? '#2ecc71' : '#e74c3c', fontWeight: 'bold'}}>
                                                {ankiStatus === 'connected' ? 'Connected' : ankiStatus === 'loading' ? 'Connecting...' : 'Not Connected'}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={fetchAnkiData}
                                            disabled={ankiStatus === 'loading'}
                                            style={{
                                                padding: '5px 10px', fontSize: '0.85em', cursor: 'pointer',
                                                backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px'
                                            }}
                                        >
                                            Retry Connection
                                        </button>
                                    </div>

                                    <div className="grid">
                                        <label htmlFor="ankiUrl">AnkiConnect URL</label>
                                        <input 
                                            id="ankiUrl" 
                                            value={localSettings.ankiConnectUrl ?? 'http://127.0.0.1:8765'} 
                                            onChange={(e) => handleChange('ankiConnectUrl', e.target.value)} 
                                            placeholder="http://127.0.0.1:8765"
                                        />
                                        
                                        <label htmlFor="ankiQuality">Image Quality</label>
                                        <input 
                                            id="ankiQuality" 
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="1"
                                            value={localSettings.ankiImageQuality ?? 0.92} 
                                            onChange={(e) => handleChange('ankiImageQuality', parseFloat(e.target.value))} 
                                            placeholder="0.92"
                                        />
                                    </div>

                                    <div style={{ marginBottom: '15px', marginTop: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <label style={{ ...checkboxLabelStyle, marginBottom: '0' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={localSettings.ankiEnableCropper ?? false} 
                                                onChange={(e) => handleChange('ankiEnableCropper', e.target.checked)} 
                                                style={checkboxInputStyle} 
                                            />
                                            <div>
                                                Enable Image Cropper
                                                <div style={{ opacity: 0.5, fontSize: '0.9em' }}>
                                                    Allows you to crop the image before sending to Anki
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    {localSettings.enableYomitan && (
                                        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <label style={{ ...checkboxLabelStyle, marginBottom: '0' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={localSettings.ankiCheckDuplicates ?? true} 
                                                    onChange={(e) => handleChange('ankiCheckDuplicates', e.target.checked)} 
                                                    style={checkboxInputStyle} 
                                                />
                                                <div>
                                                    Check for Duplicates
                                                    <div style={{ opacity: 0.5, fontSize: '0.9em' }}>
                                                        Checks if the word already exists in the selected deck
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    )}

                                    {/* Deck & Model Selection */}
                                    {ankiStatus === 'connected' && (
                                        <>
                                            <div className="grid" style={{marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px'}}>
                                                <label htmlFor="ankiDeck">Target Deck</label>
                                                <select 
                                                    id="ankiDeck"
                                                    value={localSettings.ankiDeck || ''}
                                                    onChange={e => handleChange('ankiDeck', e.target.value)}
                                                >
                                                    <option value="">Select a Deck...</option>
                                                    {ankiDecks.map(d => <option key={d} value={d}>{d}</option>)}
                                                </select>

                                                <label htmlFor="ankiModel">Card Type</label>
                                                <select 
                                                    id="ankiModel"
                                                    value={localSettings.ankiModel || ''}
                                                    onChange={e => {
                                                        const newVal = e.target.value;
                                                        setLocalSettings(prev => ({
                                                            ...prev, 
                                                            ankiModel: newVal,
                                                            ankiFieldMap: {} 
                                                        }));
                                                    }}
                                                >
                                                    <option value="">Select Card Type...</option>
                                                    {ankiModels.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>

                                            {/* Field Mapping Section */}
                                            {localSettings.ankiModel && currentModelFields.length > 0 && (
                                                <div style={{ marginTop: '20px' }}>
                                                    <h4 style={{marginBottom: '10px', color: '#ddd'}}>Field Mapping</h4>
                                                    
                                                    {/* If built-in dictionary is enabled, show full table mapping */}
                                                    {localSettings.enableYomitan ? (
                                                        <div style={{overflowX: 'auto'}}>
                                                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9em'}}>
                                                                <thead>
                                                                    <tr style={{borderBottom: '1px solid rgba(255,255,255,0.2)'}}>
                                                                        <th style={{textAlign: 'left', padding: '8px', color: '#aaa'}}>Anki Field</th>
                                                                        <th style={{textAlign: 'left', padding: '8px', color: '#aaa'}}>Content</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {currentModelFields.map(field => (
                                                                        <tr key={field} style={{borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                                                                            <td style={{padding: '8px'}}>{field}</td>
                                                                            <td style={{padding: '8px'}}>
                                                                                <select
                                                                                    style={{width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: 'white'}}
                                                                                    value={(localSettings.ankiFieldMap as any)?.[field] || 'None'}
                                                                                    onChange={e => handleFieldMapChange(field, e.target.value)}
                                                                                >
                                                                                    {MAPPING_OPTIONS.map(opt => (
                                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        // If built-in dictionary is disabled, show simple dropdowns for Sentence/Image
                                                        <div className="grid">
                                                            <label>Sentence Field</label>
                                                            <select
                                                                value={getFieldForContent('Sentence')}
                                                                onChange={(e) => handleContentToFieldChange('Sentence', e.target.value)}
                                                            >
                                                                <option value="">(None)</option>
                                                                {currentModelFields.map(f => <option key={f} value={f}>{f}</option>)}
                                                            </select>

                                                            <label>Image Field</label>
                                                            <select
                                                                value={getFieldForContent('Image')}
                                                                onChange={(e) => handleContentToFieldChange('Image', e.target.value)}
                                                            >
                                                                <option value="">(None)</option>
                                                                {currentModelFields.map(f => <option key={f} value={f}>{f}</option>)}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        </>
                    )}

                    <h3>Anime Settings</h3>
                    <div style={sectionBoxStyle}>
                        <div className="grid" style={{ marginBottom: '10px' }}>
                            <label htmlFor="subtitleFontSize">Subtitle Font (px)</label>
                            <input
                                id="subtitleFontSize"
                                type="number"
                                step="1"
                                min="8"
                                max="64"
                                value={localSettings.subtitleFontSize}
                                onChange={(e) => handleChange('subtitleFontSize', parseInt(e.target.value, 10))}
                            />
                            <label htmlFor="subtitleFontWeight">Subtitle Thickness</label>
                            <input
                                id="subtitleFontWeight"
                                type="number"
                                step="100"
                                min="100"
                                max="900"
                                value={localSettings.subtitleFontWeight ?? 600}
                                onChange={(e) => handleChange('subtitleFontWeight', parseInt(e.target.value, 10))}
                            />
                            <label htmlFor="jimakuApiKey">Jimaku API Key</label>
                            <input
                                id="jimakuApiKey"
                                type="password"
                                value={localSettings.jimakuApiKey ?? ''}
                                onChange={(e) => handleChange('jimakuApiKey', e.target.value)}
                                placeholder="Paste Jimaku API key"
                            />
                        </div>
                        <div style={{ fontSize: '0.85em', color: '#aaa' }}>
                            Used to fetch Jimaku subtitles for the current episode.
                        </div>
                    </div>

                    <h3>Manga Settings</h3>
                    <div style={sectionBoxStyle}>
                        <h4 style={{ marginTop: 0 }}>General</h4>
                        <div className="checkboxes">
                            <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.enableOverlay} onChange={(e) => handleChange('enableOverlay', e.target.checked)} style={checkboxInputStyle} />Enable Text Overlay</label>
                            <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.soloHoverMode} onChange={(e) => handleChange('soloHoverMode', e.target.checked)} style={checkboxInputStyle} />Solo Hover</label>
                            <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.addSpaceOnMerge} onChange={(e) => handleChange('addSpaceOnMerge', e.target.checked)} style={checkboxInputStyle} />Add Space on Merge</label>
                            <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.mobileMode} onChange={(e) => handleChange('mobileMode', e.target.checked)} style={checkboxInputStyle} />Mobile Mode</label>
                            <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.debugMode} onChange={(e) => handleChange('debugMode', e.target.checked)} style={checkboxInputStyle} />Debug Mode</label>
                            <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.disableStatusIcon} onChange={(e) => handleChange('disableStatusIcon', e.target.checked)} style={checkboxInputStyle} />Disable Status Icon</label>
                        </div>

                        <h4>Visuals</h4>
                        <div className="grid">
                            <label htmlFor="colorTheme">Theme</label>
                            <select id="colorTheme" value={localSettings.colorTheme} onChange={(e) => handleChange('colorTheme', e.target.value)}>
                                {Object.keys(COLOR_THEMES).map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
                            <label htmlFor="textOrientation">Orientation</label>
                            <select id="textOrientation" value={localSettings.textOrientation} onChange={(e) => handleChange('textOrientation', e.target.value)}>
                                <option value="smart">Smart</option><option value="forceHorizontal">Horizontal</option><option value="forceVertical">Vertical</option>
                            </select>
                        </div>

                        <h4>Fine Tuning</h4>
                        <div className="grid">
                            <label htmlFor="dimmedOpacity">Opacity</label>
                            <input id="dimmedOpacity" type="number" step="0.1" max="1" min="0" value={localSettings.dimmedOpacity} onChange={(e) => handleChange('dimmedOpacity', parseFloat(e.target.value))} />
                            <label htmlFor="focusScale">Scale</label>
                            <input id="focusScale" type="number" step="0.1" value={localSettings.focusScaleMultiplier} onChange={(e) => handleChange('focusScaleMultiplier', parseFloat(e.target.value))} />
                            <label htmlFor="fontMultH">H. Font Mult</label>
                            <input id="fontMultH" type="number" step="0.1" value={localSettings.fontMultiplierHorizontal} onChange={(e) => handleChange('fontMultiplierHorizontal', parseFloat(e.target.value))} />
                            <label htmlFor="fontMultV">V. Font Mult</label>
                            <input id="fontMultV" type="number" step="0.1" value={localSettings.fontMultiplierVertical} onChange={(e) => handleChange('fontMultiplierVertical', parseFloat(e.target.value))} />
                            <label htmlFor="boxAdjust">Box Adjust (px)</label>
                            <input id="boxAdjust" type="number" step="1" value={localSettings.boundingBoxAdjustment} onChange={(e) => handleChange('boundingBoxAdjustment', parseInt(e.target.value, 10))} />
                        </div>

                        <h4>Interaction</h4>
                        <div className="grid">
                            <label htmlFor="interactMode">Mode</label>
                            <select id="interactMode" value={localSettings.interactionMode} onChange={(e) => handleChange('interactionMode', e.target.value)}>
                                <option value="hover">Hover</option><option value="click">Click</option>
                            </select>
                            <label htmlFor="delKey">Delete Key</label>
                            <input id="delKey" value={localSettings.deleteModifierKey} onChange={(e) => handleChange('deleteModifierKey', e.target.value)} placeholder="Alt, Control, Shift..." />
                            <label htmlFor="mergeKey">Merge Key</label>
                            <input id="mergeKey" value={localSettings.mergeModifierKey} onChange={(e) => handleChange('mergeModifierKey', e.target.value)} placeholder="Alt, Control, Shift..." />
                        </div>
                    </div>
                </div>
                <div className="ocr-modal-footer">
                    <button type="button" className="danger" onClick={purgeCache}>Purge Cache</button>
                    <button type="button" className="danger" onClick={resetYomitanDB} style={{ background: '#c0392b', borderColor: '#e74c3c' }}>Reset DB</button>
                    <button type="button" className="warning" onClick={resetToDefaults} style={{ marginRight: 'auto', background: '#e67e22', borderColor: '#d35400' }}>Defaults</button>
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="button" className="primary" onClick={save}>Save & Reload</button>
                </div>
            </div>
        </div>
    );
};
