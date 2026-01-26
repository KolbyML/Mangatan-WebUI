import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useOCR } from '@/Manatan/context/OCRContext';
import { OcrStatus, OcrBlock } from '@/Manatan/types'; 
import { apiRequest } from '@/Manatan/utils/api';
import { TextBox } from '@/Manatan/components/TextBox';
import { StatusIcon } from '@/Manatan/components/StatusIcon';
// Ensure this path matches your file structure!
import { useReaderOverlayStore } from '@/features/reader/stores/ReaderStore'; 

// --- INNER COMPONENT (MEMOIZED) ---
const ImageOverlayInner = memo(({ 
    data, 
    status, 
    img, 
    spreadData,
    mountNode, 
    onRetry, 
    onUpdate, 
    onMerge, 
    onDelete, 
    shouldShowChildren 
}: any) => {
    // Exact dimensions of the image element
    const [style, setStyle] = useState({ top: 0, left: 0, width: 0, height: 0 });

    useEffect(() => {
        const syncPosition = () => {
            if (!img) return;
            // Match the overlay exactly to the image's layout footprint
            setStyle({
                top: img.offsetTop,
                left: img.offsetLeft,
                width: img.offsetWidth,
                height: img.offsetHeight
            });
        };

        syncPosition();

        // Update if image layout changes (e.g. lazy load)
        const observer = new ResizeObserver(syncPosition);
        observer.observe(img);
        window.addEventListener('resize', syncPosition);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', syncPosition);
        };
    }, [img]);

    if (!mountNode) return null;
    if (status !== 'loading' && status !== 'error' && !data) return null;

    return createPortal(
        <div
            className="ocr-overlay-wrapper"
            style={{
                position: 'absolute',
                top: style.top,
                left: style.left,
                width: style.width,
                height: style.height,
                pointerEvents: 'none',
                zIndex: 10,
            }}
        >
            <div style={{ opacity: shouldShowChildren ? 1 : 0, transition: 'opacity 0.2s' }}>
                <StatusIcon status={status} onRetry={onRetry} />
            </div>
            
            {data?.map((block: OcrBlock, i: number) => (
                <TextBox
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${i}-${block.text.substring(0, 5)}`}
                    index={i}
                    block={block}
                    imgSrc={img.src}
                    spreadData={spreadData}
                    // CRITICAL: Pass exact width/height so TextBox calculates font size correctly
                    containerWidth={style.width}
                    containerHeight={style.height}
                    onUpdate={onUpdate}
                    onMerge={onMerge}
                    onDelete={onDelete}
                    parentVisible={shouldShowChildren}
                />
            ))}
        </div>,
        mountNode
    );
});

// --- MAIN COMPONENT ---
// Added 'export' to fix the build error
export const ImageOverlay: React.FC<{ img: HTMLImageElement, spreadData?: { leftSrc: string; rightSrc: string } }> = ({ img, spreadData }) => {
    const { settings, serverSettings, ocrCache, updateOcrData, setActiveImageSrc, mergeAnchor, ocrStatusMap, setOcrStatus, dictPopup } = useOCR();
    
    const data = ocrCache.get(img.src) || null;
    const currentStatus = ocrCache.has(img.src) ? 'success' : (ocrStatusMap.get(img.src) || 'idle');
    const isReaderOverlayVisible = useReaderOverlayStore((state) => state.overlay.isVisible);

    const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
    const hideTimerRef = useRef<number | null>(null);
    const isHoveringRef = useRef(false);
    const isPopupOpenRef = useRef(false);

    useEffect(() => { isPopupOpenRef.current = dictPopup.visible; }, [dictPopup.visible]);

    // 1. Latch onto the image parent to get "Free Zoom" support
    useEffect(() => {
        if (img && img.parentElement) {
            const parent = img.parentElement;
            if (getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }
            setMountNode(parent);
        }
    }, [img]);

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
            isHoveringRef.current = true;
            setActiveImageSrc(img.src);
        };
        const hide = () => {
            clearTimer();
            hideTimerRef.current = window.setTimeout(() => {}, 400);
        };
        const onEnter = () => { isHoveringRef.current = true; show(); };
        const onLeave = () => { isHoveringRef.current = false; hide(); };

        img.addEventListener('mouseenter', onEnter);
        img.addEventListener('mouseleave', onLeave);
        return () => {
            img.removeEventListener('mouseenter', onEnter);
            img.removeEventListener('mouseleave', onLeave);
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
            mountNode={mountNode}
            onRetry={fetchOCR}
            onUpdate={handleUpdate}
            onMerge={handleMerge}
            onDelete={handleDelete}
            shouldShowChildren={shouldShowChildren}
        />
    );
};