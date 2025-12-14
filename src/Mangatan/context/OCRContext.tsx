import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { Settings, DEFAULT_SETTINGS, MergeState, OcrBlock, COLOR_THEMES, ServerSettingsData } from '@/Mangatan/types';
import { requestManager } from '@/lib/requests/RequestManager';

export type OcrStatus = 'loading' | 'error' | 'success' | 'idle';

interface OCRContextType {
    settings: Settings;
    setSettings: React.Dispatch<React.SetStateAction<Settings>>;
    serverSettings: ServerSettingsData | null; // EXPOSED LIVE SETTINGS
    ocrCache: Map<string, OcrBlock[]>;
    updateOcrData: (imgSrc: string, data: OcrBlock[]) => void;
    ocrStatusMap: Map<string, OcrStatus>;
    setOcrStatus: (imgSrc: string, status: OcrStatus) => void;    
    mergeAnchor: MergeState;
    setMergeAnchor: React.Dispatch<React.SetStateAction<MergeState>>;
    activeImageSrc: string | null;
    setActiveImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
    debugLog: string[];
    addLog: (msg: string) => void;
}

const OCRContext = createContext<OCRContextType | undefined>(undefined);

export const OCRProvider = ({ children }: { children: ReactNode }) => {
    // 1. Hook into Global Request Manager (Apollo Store)
    const { data: serverSettingsData } = requestManager.useGetServerSettings();
    const serverSettings: ServerSettingsData | null = serverSettingsData?.settings || null;

    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('mangatan_settings_v3');
        
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        return { 
            ...DEFAULT_SETTINGS, 
            mobileMode: isMobile 
        };
    });

    const [ocrCache, setOcrCache] = useState<Map<string, OcrBlock[]>>(new Map());
    const [ocrStatusMap, setOcrStatusMap] = useState<Map<string, OcrStatus>>(new Map());    
    const [mergeAnchor, setMergeAnchor] = useState<MergeState>(null);
    const [activeImageSrc, setActiveImageSrc] = useState<string | null>(null);
    const [debugLog, setDebugLog] = useState<string[]>([]);

    const addLog = useCallback(
        (msg: string) => {
            if (!settings.debugMode) return;
            const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
            setDebugLog((prev) => [...prev.slice(-99), entry]);
             // eslint-disable-next-line no-console
            console.log(`[OCR] ${entry}`);
        },
        [settings.debugMode],
    );

    const updateOcrData = useCallback((imgSrc: string, data: OcrBlock[]) => {
        setOcrCache((prev) => new Map(prev).set(imgSrc, data));
    }, []);

    const setOcrStatus = useCallback((imgSrc: string, status: OcrStatus) => {
         setOcrStatusMap((prev) => new Map(prev).set(imgSrc, status));
    }, []);    

    useEffect(() => {
        localStorage.setItem('mangatan_settings_v3', JSON.stringify(settings));

        const theme = COLOR_THEMES[settings.colorTheme] || COLOR_THEMES.blue;
        document.documentElement.style.setProperty('--ocr-accent', theme.accent);

        if (settings.brightnessMode === 'dark') {
            document.documentElement.style.setProperty('--ocr-bg', '#1a1d21');
            document.documentElement.style.setProperty('--ocr-text-color', '#eaeaea');
        } else {
            document.documentElement.style.setProperty('--ocr-bg', '#ffffff');
            document.documentElement.style.setProperty('--ocr-text-color', '#000000');
        }

        document.documentElement.style.setProperty('--ocr-opacity', settings.dimmedOpacity.toString());
        document.documentElement.style.setProperty('--ocr-scale', settings.focusScaleMultiplier.toString());

        if (settings.mobileMode) document.body.classList.add('mobile-mode');
        else document.body.classList.remove('mobile-mode');
    }, [settings]);

    const contextValue = useMemo(
        () => ({
            settings,
            setSettings,
            serverSettings, // Exposed here
            ocrCache,
            updateOcrData,
            ocrStatusMap, 
            setOcrStatus,
            mergeAnchor,
            setMergeAnchor,
            activeImageSrc,
            setActiveImageSrc,
            debugLog,
            addLog,
        }),
        [settings, serverSettings, ocrCache, updateOcrData, ocrStatusMap, setOcrStatus, mergeAnchor, activeImageSrc, debugLog, addLog],
    );

    return <OCRContext.Provider value={contextValue}>{children}</OCRContext.Provider>;
};

export const useOCR = () => {
    const context = useContext(OCRContext);
    if (!context) throw new Error('useOCR must be used within OCRProvider');
    return context;
};
