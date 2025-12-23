import { useState, useEffect } from 'react';
import { useMangaObserver } from './hooks/useMangaObserver';
import { ImageOverlay } from './components/ImageOverlay';
import { SettingsModal } from './components/SettingsModal';
import { ChapterListInjector } from './components/ChapterListInjector'; 
import { YomitanPopup } from './components/YomitanPopup'; 

export const OCRManager = () => {
    const images = useMangaObserver(); 
    const [showSettings, setShowSettings] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // --- SCROLL LOCK ---
    useEffect(() => {
        const checkUrl = () => {
            const isReader = window.location.href.includes('/chapter/');
            if (isReader) {
                document.documentElement.classList.add('ocr-reader-mode');
            } else {
                document.documentElement.classList.remove('ocr-reader-mode');
            }
        };

        checkUrl();
        const interval = setInterval(checkUrl, 500);
        return () => {
            clearInterval(interval);
            document.documentElement.classList.remove('ocr-reader-mode');
        };
    }, []);

    // --- REFRESH ON RESIZE ---
    useEffect(() => {
        const handleResize = () => setRefreshKey(prev => prev + 1);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            <ChapterListInjector />
            
            {/* Key forces re-render on zoom/resize */}
            {images.map(img => (
                <ImageOverlay 
                    key={`${img.src}-${refreshKey}`} 
                    img={img} 
                />
            ))}
            
            <YomitanPopup />

            <div className="ocr-controls">
                <button type="button" onClick={() => setShowSettings(true)}>⚙️</button>
            </div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
};