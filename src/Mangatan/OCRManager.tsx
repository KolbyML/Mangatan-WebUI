import { useState, useEffect, useRef } from 'react';
import { useMangaObserver } from './hooks/useMangaObserver';
import { ImageOverlay } from './components/ImageOverlay';
import { SettingsModal } from './components/SettingsModal';
import { ChapterListInjector } from './components/ChapterListInjector'; 
import { YomitanPopup } from './components/YomitanPopup'; 
import { useOCR } from './context/OCRContext';
import { GlobalDialog } from './components/GlobalDialog'; // IMPORTED

const PUCK_SIZE = 50; 
const STORAGE_KEY = 'mangatan_ocr_puck_pos';

export const OCRManager = () => {
    const images = useMangaObserver(); 
    const { settings } = useOCR();
    const [showSettings, setShowSettings] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const [puckPos, setPuckPos] = useState<{x: number, y: number} | null>(null);
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const initialPuckPos = useRef({ x: 0, y: 0 });

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

    useEffect(() => {
        const handleResize = () => {
            setRefreshKey(prev => prev + 1);
            setPuckPos(prev => {
                if (!prev) return null;
                const maxX = window.innerWidth - PUCK_SIZE;
                const maxY = window.innerHeight - PUCK_SIZE;
                return { x: Math.min(prev.x, maxX), y: Math.min(prev.y, maxY) };
            });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!settings.mobileMode) return;
        const loadPos = () => {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    const maxX = window.innerWidth - PUCK_SIZE;
                    const maxY = window.innerHeight - PUCK_SIZE;
                    return { x: Math.min(Math.max(0, parsed.x), maxX), y: Math.min(Math.max(0, parsed.y), maxY) };
                }
            } catch (e) { /* ignore */ }
            return { x: window.innerWidth - 20 - PUCK_SIZE, y: window.innerHeight - 60 - PUCK_SIZE };
        };
        setPuckPos(loadPos());
    }, [settings.mobileMode]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!settings.mobileMode || !puckPos) return;
        isDragging.current = false;
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        initialPuckPos.current = { ...puckPos };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!settings.mobileMode || !puckPos) return;
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isDragging.current = true;

        let newX = initialPuckPos.current.x + dx;
        let newY = initialPuckPos.current.y + dy;
        const maxX = window.innerWidth - PUCK_SIZE;
        const maxY = window.innerHeight - PUCK_SIZE;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        setPuckPos({ x: newX, y: newY });
    };

    const handleTouchEnd = () => {
        if (settings.mobileMode && puckPos) localStorage.setItem(STORAGE_KEY, JSON.stringify(puckPos));
    };

    const handlePuckClick = (e: React.MouseEvent) => {
        if (settings.mobileMode && isDragging.current) {
            e.preventDefault();
            e.stopPropagation();
            isDragging.current = false; 
            return;
        }
        setShowSettings(true);
    };

    const controlsStyle: React.CSSProperties = (settings.mobileMode && puckPos) 
        ? { left: `${puckPos.x}px`, top: `${puckPos.y}px`, bottom: 'auto', right: 'auto', transform: 'none', touchAction: 'none' }
        : {};

    return (
        <>
            <ChapterListInjector />
            <GlobalDialog /> {/* <-- ADDED THIS */}
            
            {images.map(img => (
                <ImageOverlay key={`${img.src}-${refreshKey}`} img={img} />
            ))}
            
            <YomitanPopup />

            <div 
                className="ocr-controls"
                style={controlsStyle}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <button type="button" onClick={handlePuckClick}>⚙️</button>
            </div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </>
    );
};