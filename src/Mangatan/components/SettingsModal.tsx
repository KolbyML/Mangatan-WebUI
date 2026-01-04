import React, { useState, useRef, useEffect } from 'react';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { COLOR_THEMES, DEFAULT_SETTINGS } from '@/Mangatan/types';
import { apiRequest, getAppVersion, checkForUpdates, triggerAppUpdate, installAppUpdate } from '@/Mangatan/utils/api';
import { DictionaryManager } from './DictionaryManager';

const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', marginBottom: '8px', cursor: 'pointer', textAlign: 'left', 
};

const checkboxInputStyle: React.CSSProperties = {
    width: 'auto', marginRight: '10px', flexShrink: 0, cursor: 'pointer',
};

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { settings, setSettings, showConfirm, showAlert, showProgress, closeDialog, showDialog } = useOCR();
    const [localSettings, setLocalSettings] = useState(settings);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dictManagerKey, setDictManagerKey] = useState(0);

    // --- UPDATE STATE ---
    const [appVersion, setAppVersion] = useState<string>('...');
    const [updateAvailable, setUpdateAvailable] = useState<any>(null);
    const [updateStatus, setUpdateStatus] = useState<string>('idle');

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

                // 1. Prioritize System Status
                if (info.update_status && info.update_status !== 'idle') {
                    setUpdateStatus(info.update_status);
                } 
                // 2. Only if system is idle, check GitHub
                else if (info.variant !== 'unknown' && info.variant !== 'desktop' && info.variant !== 'ios') {
                    if (!updateAvailable) {
                        const update = await checkForUpdates(info.version, info.variant);
                        if (isMounted && update.hasUpdate) setUpdateAvailable(update);
                    }
                    // Only set to idle if we aren't currently downloading locally
                    // This prevents flickering if the poll is slightly faster than the backend state update
                    if (updateStatus !== 'downloading' && updateStatus !== 'ready') {
                        setUpdateStatus('idle');
                    }
                }
            } catch (e) { console.error(e); }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 2000); // Poll every 2s
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
                setUpdateStatus('downloading'); // Immediate UI feedback
                // Alert removed to prevent confusion
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
    const handleChange = async (key: keyof typeof settings, value: any) => {
        if (key === 'enableYomitan' && value === true) {
             try {
                showProgress('Installing dictionaries...');
                const res = await apiRequest<{status: string, message: string}>('/api/yomitan/install-defaults', { method: 'POST' });
                closeDialog();
                if (res.status === 'ok' && res.message.includes('Imported')) showAlert('Success', 'Dictionaries installed.');
            } catch (e) { closeDialog(); }
        }
        setLocalSettings((prev) => ({ ...prev, [key]: value }));
    };

    const save = () => {
        localStorage.setItem('mangatan_settings_v3', JSON.stringify(localSettings));
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

    return (
        <div className="ocr-modal-overlay" onClick={onClose}>
            <div className="ocr-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ocr-modal-header">
                    <h2>Settings</h2>
                </div>
                <div className="ocr-modal-content">
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".zip" onChange={handleFileChange} />

                    {/* --- UPDATE BANNER --- */}
                    
                    {/* DOWNLOADING STATE */}
                    {updateStatus === 'downloading' && (
                        <div style={{ backgroundColor: '#f39c12', color: 'white', padding: '15px', borderRadius: '5px', marginBottom: '15px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                {/* Simple CSS Spinner */}
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

                    {/* READY STATE */}
                    {updateStatus === 'ready' && (
                        <div style={{ backgroundColor: '#27ae60', color: 'white', padding: '10px', borderRadius: '5px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><b>Download Complete</b></span>
                            <button type="button" onClick={handleInstall} style={{ backgroundColor: 'white', color: '#27ae60', border: 'none', fontWeight: 'bold', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                Install Now
                            </button>
                        </div>
                    )}

                    {/* IDLE + UPDATE AVAILABLE */}
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

                    {(isNativeApp || localSettings.enableYomitan) && (
                        <DictionaryManager key={dictManagerKey} onImportClick={handleImportClick} />
                    )}

                    <h3>Visuals</h3>
                    <div className="grid">
                        <label htmlFor="colorTheme">Theme</label>
                        <select id="colorTheme" value={localSettings.colorTheme} onChange={(e) => handleChange('colorTheme', e.target.value)}>
                            {Object.keys(COLOR_THEMES).map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <label htmlFor="brightnessMode">Brightness</label>
                        <select id="brightnessMode" value={localSettings.brightnessMode} onChange={(e) => handleChange('brightnessMode', e.target.value)}>
                            <option value="light">Light</option><option value="dark">Dark</option>
                        </select>
                        <label htmlFor="focusFontColor">Text Color</label>
                        <select id="focusFontColor" value={localSettings.focusFontColor} onChange={(e) => handleChange('focusFontColor', e.target.value)}>
                            <option value="default">Default</option><option value="black">Black</option><option value="white">White</option><option value="difference">Difference (Blend)</option>
                        </select>
                        <label htmlFor="textOrientation">Orientation</label>
                        <select id="textOrientation" value={localSettings.textOrientation} onChange={(e) => handleChange('textOrientation', e.target.value)}>
                            <option value="smart">Smart</option><option value="forceHorizontal">Horizontal</option><option value="forceVertical">Vertical</option>
                        </select>
                    </div>

                    <h3>Fine Tuning</h3>
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

                    <h3>Interaction</h3>
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

                    {!isiOS && (
                        <>
                            <h3>Anki Integrations</h3>
                            <label style={checkboxLabelStyle}>
                                <input type="checkbox" checked={localSettings.ankiConnectEnabled ?? false} onChange={(e) => handleChange('ankiConnectEnabled', e.target.checked)} style={checkboxInputStyle} />
                                <div>
                                    Enable Anki Integrations
                                    <div style={{ opacity: 0.5, fontSize: '0.9em' }}>
                                        To trigger the anki connect integration, right click (long press on mobile) any text box
                                    </div>
                                </div>
                            </label>
                            <div className="grid">
                                <label htmlFor="ankiSent" style={{ opacity: localSettings.ankiConnectEnabled ? 1 : 0.5 }}>
                                    Sentence Field
                                </label>
                                <input 
                                    id="ankiSent" 
                                    disabled={!localSettings.ankiConnectEnabled}
                                    value={localSettings.ankiSentenceField ?? 'Sentence'} 
                                    onChange={(e) => handleChange('ankiSentenceField', e.target.value)} 
                                    placeholder="Leave empty to skip"
                                />

                                <label htmlFor="ankiImg" style={{ opacity: localSettings.ankiConnectEnabled ? 1 : 0.5 }}>
                                    Image Field
                                </label>
                                <input 
                                    id="ankiImg" 
                                    disabled={!localSettings.ankiConnectEnabled}
                                    value={localSettings.ankiImageField ?? 'Image'} 
                                    onChange={(e) => handleChange('ankiImageField', e.target.value)} 
                                    placeholder="Leave empty to skip"
                                />
                            </div>
                        </>
                    )}

                    <div className="checkboxes">
                        <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.enableOverlay} onChange={(e) => handleChange('enableOverlay', e.target.checked)} style={checkboxInputStyle} />Enable Text Overlay</label>
                        
                        <label style={checkboxLabelStyle}>
                            <input type="checkbox" checked={localSettings.enableYomitan} onChange={e => handleChange('enableYomitan', e.target.checked)} style={checkboxInputStyle} />
                            Enable Popup Dictionary
                        </label>

                        <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.soloHoverMode} onChange={(e) => handleChange('soloHoverMode', e.target.checked)} style={checkboxInputStyle} />Solo Hover</label>
                        <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.addSpaceOnMerge} onChange={(e) => handleChange('addSpaceOnMerge', e.target.checked)} style={checkboxInputStyle} />Add Space on Merge</label>
                        <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.mobileMode} onChange={(e) => handleChange('mobileMode', e.target.checked)} style={checkboxInputStyle} />Mobile Mode</label>
                        <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.debugMode} onChange={(e) => handleChange('debugMode', e.target.checked)} style={checkboxInputStyle} />Debug Mode</label>
                        <label style={checkboxLabelStyle}><input type="checkbox" checked={localSettings.disableStatusIcon} onChange={(e) => handleChange('disableStatusIcon', e.target.checked)} style={checkboxInputStyle} />Disable Status Icon</label>
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
