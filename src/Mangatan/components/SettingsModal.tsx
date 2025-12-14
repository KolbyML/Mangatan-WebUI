import React, { useState } from 'react';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { COLOR_THEMES, DEFAULT_SETTINGS } from '@/Mangatan/types';
import { apiRequest } from '@/Mangatan/utils/api';

const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
    cursor: 'pointer',
    textAlign: 'left', 
};

const checkboxInputStyle: React.CSSProperties = {
    width: 'auto',      
    marginRight: '10px',  
    flexShrink: 0,     
    cursor: 'pointer',
};

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { settings, setSettings } = useOCR();
    const [localSettings, setLocalSettings] = useState(settings);

    const handleChange = (key: keyof typeof settings, value: any) => {
        setLocalSettings((prev) => ({ ...prev, [key]: value }));
    };

    const save = () => {
        setSettings(localSettings);
        onClose();
        window.location.reload();
    };

    const resetToDefaults = () => {
        // eslint-disable-next-line no-restricted-globals, no-alert
        if (window.confirm('Reset all settings to default?2')) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            setLocalSettings({
                ...DEFAULT_SETTINGS,
                mobileMode: isMobile
            });
        }
    };

    const purgeCache = async () => {
        // eslint-disable-next-line no-restricted-globals, no-alert
        if (!window.confirm('Purge Server Cache?')) return;
        try {
            await apiRequest(`/api/ocr/purge-cache`, { method: 'POST' });
            // eslint-disable-next-line no-alert
            window.alert('Cache Purged');
        } catch (e) {
            // eslint-disable-next-line no-alert
            window.alert('Failed');
        }
    };

    return (
        <div className="ocr-modal-overlay">
            <div className="ocr-modal">
                <div className="ocr-modal-header">
                    <h2>Settings</h2>
                </div>
                <div className="ocr-modal-content">
                    <h3>Visuals</h3>
                    <div className="grid">
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="colorTheme">Theme</label>
                        <select
                            id="colorTheme"
                            value={localSettings.colorTheme}
                            onChange={(e) => handleChange('colorTheme', e.target.value)}
                        >
                            {Object.keys(COLOR_THEMES).map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="brightnessMode">Brightness</label>
                        <select
                            id="brightnessMode"
                            value={localSettings.brightnessMode}
                            onChange={(e) => handleChange('brightnessMode', e.target.value)}
                        >
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="focusFontColor">Text Color</label>
                        <select
                            id="focusFontColor"
                            value={localSettings.focusFontColor}
                            onChange={(e) => handleChange('focusFontColor', e.target.value)}
                        >
                            <option value="default">Default</option>
                            <option value="black">Black</option>
                            <option value="white">White</option>
                            <option value="difference">Difference (Blend)</option>
                        </select>
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="textOrientation">Orientation</label>
                        <select
                            id="textOrientation"
                            value={localSettings.textOrientation}
                            onChange={(e) => handleChange('textOrientation', e.target.value)}
                        >
                            <option value="smart">Smart</option>
                            <option value="forceHorizontal">Horizontal</option>
                            <option value="forceVertical">Vertical</option>
                        </select>
                    </div>

                    <h3>Fine Tuning</h3>
                    <div className="grid">
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="dimmedOpacity">Opacity</label>
                        <input
                            id="dimmedOpacity"
                            type="number"
                            step="0.1"
                            max="1"
                            min="0"
                            value={localSettings.dimmedOpacity}
                            onChange={(e) => handleChange('dimmedOpacity', parseFloat(e.target.value))}
                        />
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="focusScale">Scale</label>
                        <input
                            id="focusScale"
                            type="number"
                            step="0.1"
                            value={localSettings.focusScaleMultiplier}
                            onChange={(e) => handleChange('focusScaleMultiplier', parseFloat(e.target.value))}
                        />
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="fontMultH">H. Font Mult</label>
                        <input
                            id="fontMultH"
                            type="number"
                            step="0.1"
                            value={localSettings.fontMultiplierHorizontal}
                            onChange={(e) => handleChange('fontMultiplierHorizontal', parseFloat(e.target.value))}
                        />
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="fontMultV">V. Font Mult</label>
                        <input
                            id="fontMultV"
                            type="number"
                            step="0.1"
                            value={localSettings.fontMultiplierVertical}
                            onChange={(e) => handleChange('fontMultiplierVertical', parseFloat(e.target.value))}
                        />
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="boxAdjust">Box Adjust (px)</label>
                        <input
                            id="boxAdjust"
                            type="number"
                            step="1"
                            value={localSettings.boundingBoxAdjustment}
                            onChange={(e) => handleChange('boundingBoxAdjustment', parseInt(e.target.value, 10))}
                        />
                    </div>

                    <h3>Interaction</h3>
                    <div className="grid">
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="interactMode">Mode</label>
                        <select
                            id="interactMode"
                            value={localSettings.interactionMode}
                            onChange={(e) => handleChange('interactionMode', e.target.value)}
                        >
                            <option value="hover">Hover</option>
                            <option value="click">Click</option>
                        </select>
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="delKey">Delete Key</label>
                        <input
                            id="delKey"
                            value={localSettings.deleteModifierKey}
                            onChange={(e) => handleChange('deleteModifierKey', e.target.value)}
                            placeholder="Alt, Control, Shift..."
                        />
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                        <label htmlFor="mergeKey">Merge Key</label>
                        <input
                            id="mergeKey"
                            value={localSettings.mergeModifierKey}
                            onChange={(e) => handleChange('mergeModifierKey', e.target.value)}
                            placeholder="Alt, Control, Shift..."
                        />
                    </div>

                    <div className="checkboxes">
                        {/* Enable Overlay */}
                        <label style={checkboxLabelStyle}>
                            <input
                                type="checkbox"
                                checked={localSettings.enableOverlay}
                                onChange={(e) => handleChange('enableOverlay', e.target.checked)}
                                style={checkboxInputStyle}
                            />
                            Enable Text Overlay (If disabled, no OCR text will show)
                        </label>

                        {/* Solo Hover */}
                        <label style={checkboxLabelStyle}>
                            <input
                                type="checkbox"
                                checked={localSettings.soloHoverMode}
                                onChange={(e) => handleChange('soloHoverMode', e.target.checked)}
                                style={checkboxInputStyle}
                            />
                            Solo Hover (Hide others when hovering one)
                        </label>

                        {/* Add Space on Merge */}
                        <label style={checkboxLabelStyle}>
                            <input
                                type="checkbox"
                                checked={localSettings.addSpaceOnMerge}
                                onChange={(e) => handleChange('addSpaceOnMerge', e.target.checked)}
                                style={checkboxInputStyle}
                            />
                            Add Space on Merge
                        </label>

                        {/* Mobile Mode */}
                        <label style={checkboxLabelStyle}>
                            <input
                                type="checkbox"
                                checked={localSettings.mobileMode}
                                onChange={(e) => handleChange('mobileMode', e.target.checked)}
                                style={checkboxInputStyle}
                            />
                            Mobile Mode (No Animation)
                        </label>

                        {/* Debug Mode */}
                        <label style={checkboxLabelStyle}>
                            <input
                                type="checkbox"
                                checked={localSettings.debugMode}
                                onChange={(e) => handleChange('debugMode', e.target.checked)}
                                style={checkboxInputStyle}
                            />
                            Debug Mode
                        </label>
                        <label style={checkboxLabelStyle}>
                            <input
                                type="checkbox"
                                checked={localSettings.disableStatusIcon}
                                onChange={(e) => handleChange('disableStatusIcon', e.target.checked)}
                                style={checkboxInputStyle}
                            />
                            Disable Status Icon (Hide loading/error spinner for OCR status)
                        </label>
                    </div>
                    <h3>Site Config</h3>
                    {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                    <label htmlFor="siteConfig" style={{ display: 'none' }}>
                        Site Config
                    </label>
                    <textarea
                        id="siteConfig"
                        rows={5}
                        value={[
                                    localSettings.site.overflowFixSelector,
                                    ...localSettings.site.imageContainerSelectors,
                                    localSettings.site.contentRootSelector,
                                ].join('; ')}
                        onChange={(e) => {
                            const sites = e.target.value
                                .split('\n')
                                .filter((l) => l.trim())
                                .map((l) => {
                                    const p = l.split(';').map((s) => s.trim());
                                    return {
                                        overflowFixSelector: p[0],
                                        imageContainerSelectors: p.slice(1, -1),
                                        contentRootSelector: p[p.length - 1],
                                    };
                                });
                            handleChange('site', sites[0]);
                        }}
                    />
                </div>
                <div className="ocr-modal-footer">
                    <button type="button" className="danger" onClick={purgeCache}>
                        Purge Cache
                    </button>
                    <button
                        type="button"
                        className="warning"
                        onClick={resetToDefaults}
                        style={{ marginRight: 'auto', background: '#e67e22', borderColor: '#d35400' }}
                    >
                        Reset Defaults
                    </button>
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="primary" onClick={save}>
                        Save & Reload
                    </button>
                </div>
            </div>
        </div>
    );
};
