import React, { useEffect, useState, useRef, useCallback, memo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { OcrBlock } from '@/Mangatan/types'; 
import { apiRequest } from '@/Mangatan/utils/api';
import { TextBox } from '@/Mangatan/components/TextBox';
import { StatusIcon } from '@/Mangatan/components/StatusIcon';
// Ensure this path matches your file structure!
import { useReaderOverlayStore } from '@/features/reader/stores/ReaderStore'; 

const getOverlayContainer = (): HTMLElement => {
    let container = document.getElementById('ocr-overlay-layer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ocr-overlay-layer';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 9999;
            overflow: visible;
        `;
        document.body.appendChild(container);
    }
    return container;
};

// --- INNER COMPONENT (MEMOIZED) ---
const ImageOverlayInner = memo(({ 
    data, 
    status, 
    img, 
    spreadData,
    onRetry, 
    onUpdate, 
    onMerge, 
    onDelete, 
    shouldShowChildren 
}: any) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef<HTMLElement>(getOverlayContainer());

    useLayoutEffect(() => {
        if (!img || !wrapperRef.current) return;

        const wrapper = wrapperRef.current;
        const inner = innerRef.current;
        
        const syncPosition = () => {
            if (!img.isConnected) {
                wrapper.style.display = 'none';
                return;
            }

            const rect = img.getBoundingClientRect();
            
            // Check visibility
            const isInViewport = (
                rect.bottom > 0 &&
                rect.top < window.innerHeight &&
                rect.right > 0 &&
                rect.left < window.innerWidth &&
                rect.width > 10 &&
                rect.height > 10
            );

            if (!isInViewport) {
                wrapper.style.display = 'none';
                return;
            }

            wrapper.style.display = 'block';
            wrapper.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
            
            if (inner) {
                inner.style.width = `${rect.width}px`;
                inner.style.height = `${rect.height}px`;
            }

            if (Math.abs(dimensions.width - rect.width) > 1 || 
                Math.abs(dimensions.height - rect.height) > 1) {
                setDimensions({ width: rect.width, height: rect.height });
            }
            
            if (!isVisible) setIsVisible(true);
        };

        // Initial sync
        syncPosition();

        let ticking = false;
        const onUpdateEvent = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                syncPosition();
                ticking = false;
            });
        };

        const resizeObserver = new ResizeObserver(() => {
            onUpdateEvent();
        });
        resizeObserver.observe(img);

        window.addEventListener('scroll', onUpdateEvent, { capture: true, passive: true });
        window.addEventListener('resize', onUpdateEvent, { passive: true });

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('scroll', onUpdateEvent, true);
            window.removeEventListener('resize', onUpdateEvent);
        };
    }, [img, dimensions.width, dimensions.height, isVisible]);

    if (status !== 'loading' && status !== 'error' && !data) return null;

    return createPortal(
        <div
            ref={wrapperRef}
            className="ocr-overlay-wrapper"
            data-img-src={img?.src?.slice(-30)}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                willChange: 'transform',
                display: 'none', // Start hidden until intial sync
                zIndex: 10,
            }}
        >
            <div 
                ref={innerRef}
                style={{ 
                    position: 'relative',
                    width: dimensions.width || 'auto',
                    height: dimensions.height || 'auto',
                }}
            >
                <div style={{ opacity: shouldShowChildren ? 1 : 0, transition: 'opacity 0.2s' }}>
                    <StatusIcon status={status} onRetry={onRetry} />
                </div>
                
                {isVisible && data?.map((block: OcrBlock, i: number) => (
                    <TextBox
                        key={`${i}-${block.text.substring(0, 5)}`}
                        index={i}
                        block={block}
                        imgSrc={img.src}
                        spreadData={spreadData}
                        containerWidth={dimensions.width}
                        containerHeight={dimensions.height}
                        onUpdate={onUpdate}
                        onMerge={onMerge}
                        onDelete={onDelete}
                        parentVisible={shouldShowChildren}
                    />
                ))}
            </div>
        </div>,
        containerRef.current
    );
});

// --- MAIN COMPONENT ---
export const ImageOverlay: React.FC<{ 
    img: HTMLImageElement, 
    spreadData?: { leftSrc: string; rightSrc: string } 
}> = ({ img, spreadData }) => {
    const { 
        settings, serverSettings, ocrCache, updateOcrData, 
        setActiveImageSrc, ocrStatusMap, setOcrStatus, dictPopup 
    } = useOCR();
    
    const data = ocrCache.get(img.src) || null;
    const currentStatus = ocrCache.has(img.src) ? 'success' : (ocrStatusMap.get(img.src) || 'idle');
    const isReaderOverlayVisible = useReaderOverlayStore((state) => state.overlay.isVisible);

    const hideTimerRef = useRef<number | null>(null);
    const isPopupOpenRef = useRef(false);

    useEffect(() => { isPopupOpenRef.current = dictPopup.visible; }, [dictPopup.visible]);

    const fetchOCR = useCallback(async () => {
        if (!img.src || ocrCache.has(img.src)) return;
        try {
            setOcrStatus(img.src, 'loading');
            let url = `/api/ocr/ocr?url=${encodeURIComponent(img.src)}`;
            url += `&add_space_on_merge=${settings.addSpaceOnMerge}`;
            if (serverSettings?.authUsername?.trim() && serverSettings?.authPassword?.trim()) {
                url += `&user=${encodeURIComponent(serverSettings.authUsername.trim())}`;
                url += `&pass=${encodeURIComponent(serverSettings.authPassword.trim())}`;
            }
            const result = await apiRequest<OcrBlock[]>(url);
            if (Array.isArray(result)) {
                updateOcrData(img.src, result);
            } else {
                throw new Error("Invalid response format");
            }
        } catch (err) {
            console.error("OCR Failed:", err);
            setOcrStatus(img.src, 'error');
        }
    }, [img.src, ocrCache, setOcrStatus, updateOcrData, serverSettings, settings.addSpaceOnMerge]);

    useEffect(() => {
        if (!img.src) return;
        if (ocrCache.has(img.src)) {
            if (ocrStatusMap.get(img.src) !== 'success') setOcrStatus(img.src, 'success');
            return;
        }
        if (currentStatus === 'loading' || currentStatus === 'error') return;
        if (img.complete) fetchOCR();
        else img.onload = fetchOCR;
    }, [fetchOCR, img.complete, ocrCache, img.src, currentStatus, setOcrStatus, ocrStatusMap]);

    // Hover / Interaction
    useEffect(() => {
        const clearTimer = () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
        const show = () => {
            clearTimer();
            setActiveImageSrc(img.src);
        };
        const hide = () => {
            clearTimer();
            hideTimerRef.current = window.setTimeout(() => {}, 400);
        };

        img.addEventListener('mouseenter', show);
        img.addEventListener('mouseleave', hide);
        return () => {
            img.removeEventListener('mouseenter', show);
            img.removeEventListener('mouseleave', hide);
            clearTimer();
        };
    }, [img, setActiveImageSrc]);

    const handleUpdate = useCallback((index: number, newText: string) => {
        if (!data) return;
        const newData = [...data];
        newData[index] = { ...newData[index], text: newText };
        updateOcrData(img.src, newData);
    }, [data, img.src, updateOcrData]);

    const handleMerge = useCallback((idx1: number, idx2: number) => {
        if (!data) return;
        const b1 = data[idx1];
        const b2 = data[idx2];
        const separator = settings.addSpaceOnMerge ? ' ' : '\u200B';
        const newBlock: OcrBlock = {
            text: b1.text + separator + b2.text,
            tightBoundingBox: { 
                x: Math.min(b1.tightBoundingBox.x, b2.tightBoundingBox.x),
                y: Math.min(b1.tightBoundingBox.y, b2.tightBoundingBox.y),
                width: Math.max(b1.tightBoundingBox.x + b1.tightBoundingBox.width, b2.tightBoundingBox.x + b2.tightBoundingBox.width) - Math.min(b1.tightBoundingBox.x, b2.tightBoundingBox.x),
                height: Math.max(b1.tightBoundingBox.y + b1.tightBoundingBox.height, b2.tightBoundingBox.y + b2.tightBoundingBox.height) - Math.min(b1.tightBoundingBox.y, b2.tightBoundingBox.y)
            },
            isMerged: true,
            forcedOrientation: 'auto',
        };
        const newData = data.filter((_, i) => i !== idx1 && i !== idx2);
        newData.push(newBlock);
        updateOcrData(img.src, newData);
    }, [data, img.src, settings.addSpaceOnMerge, updateOcrData]);

    const handleDelete = useCallback((index: number) => {
        if (!data) return;
        const newData = data.filter((_, i) => i !== index);
        updateOcrData(img.src, newData);
    }, [data, img.src, updateOcrData]);

    const isImgDisplayed = img.offsetParent !== null; 
    const isGlobalEnabled = settings.enableOverlay && isImgDisplayed && !isReaderOverlayVisible;
    const shouldShowChildren = !settings.soloHoverMode || settings.interactionMode === 'click' || settings.debugMode || currentStatus === 'loading' || currentStatus === 'error';

    if (!isGlobalEnabled) return null;

    return (
        <ImageOverlayInner
            data={data}
            status={currentStatus}
            img={img}
            spreadData={spreadData}
            onRetry={fetchOCR}
            onUpdate={handleUpdate}
            onMerge={handleMerge}
            onDelete={handleDelete}
            shouldShowChildren={shouldShowChildren}
        />
    );
};