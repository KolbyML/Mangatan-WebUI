import { useState, useEffect } from 'react';
import { useMangaObserver } from './hooks/useMangaObserver';
import { ImageOverlay } from './components/ImageOverlay';
import { SettingsModal } from './components/SettingsModal';
import { ChapterListInjector } from './components/ChapterListInjector'; 

export const OCRManager = () => {
    const images = useMangaObserver(); 
    const [showSettings, setShowSettings] = useState(false);

    // --- SCROLL LOCK LOGIC ---
    useEffect(() => {
        const checkUrl = () => {
            // Adjust this string based on Suwayomi's actual URL structure for the reader
            // Typically: /manga/:id/chapter/:id
            const isReader = window.location.href.includes('/chapter/');
            
            if (isReader) {
                document.documentElement.classList.add('ocr-reader-mode');
            } else {
                document.documentElement.classList.remove('ocr-reader-mode');
            }
        };

        // Check immediately
        checkUrl();

        // Check on URL changes (since it's an SPA)
        // We use an interval as a fallback because standard events might miss internal routing
        const interval = setInterval(checkUrl, 500);

        return () => {
            clearInterval(interval);
            document.documentElement.classList.remove('ocr-reader-mode');
        };
    }, []);
    // -------------------------

return (
        <>
            <ChapterListInjector />
            
            {images.map(img => <ImageOverlay key={img.src} img={img} />)}
            
            <div className="ocr-controls">
                <button type="button" onClick={() => setShowSettings(true)}>⚙️</button>
            </div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
};