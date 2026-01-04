import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { OcrStatus, OcrBlock } from '@/Mangatan/types'; 
import { apiRequest } from '@/Mangatan/utils/api';
import { TextBox } from '@/Mangatan/components/TextBox';
import { StatusIcon } from '@/Mangatan/components/StatusIcon';
import { useReaderOverlayStore } from '@/features/reader/stores/ReaderStore.ts';

export const ImageOverlay: React.FC<{ img: HTMLImageElement }> = ({ img }) => {
    const { settings, serverSettings, ocrCache, updateOcrData, setActiveImageSrc, mergeAnchor, ocrStatusMap, setOcrStatus, dictPopup } = useOCR();
    const [data, setData] = useState<OcrBlock[] | null>(null);

    // Access Reader Overlay visibility state
    const isReaderOverlayVisible = useReaderOverlayStore((state) => state.overlay.isVisible);

    const currentStatus: OcrStatus = ocrCache.has(img.src) ? 'success' : (ocrStatusMap.get(img.src) || 'idle');
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [pageOffset, setPageOffset] = useState({ top: 0, left: 0 });
    const [isVisible, setIsVisible] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<number | null>(null);
    const isHoveringRef = useRef(false);
    
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
                setData(result);
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
            setData(ocrCache.get(img.src)!);
            if (ocrStatusMap.get(img.src) !== 'success') {
                setOcrStatus(img.src, 'success');
            }
            return;
        }
        if (currentStatus === 'loading' || currentStatus === 'error') return;

        if (img.complete) fetchOCR();
        else img.onload = fetchOCR;
    }, [fetchOCR, img.complete, ocrCache, img.src, currentStatus, setOcrStatus, ocrStatusMap]);

    useEffect(() => {
        const updateRect = () => {
            const r = img.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                setRect(r);
                setPageOffset({ top: window.scrollY + r.top, left: window.scrollX + r.left });
            }
        };

        updateRect();
        const observer = new ResizeObserver(updateRect);
        observer.observe(img);

        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, { capture: true });

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, { capture: true });
        };
    }, [img]);

    useEffect(() => {
        const clearHideTimer = () => {
            if (hideTimerRef.current) {
                window.clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
        };

        const show = () => {
            clearHideTimer();
            isHoveringRef.current = true;
            setIsVisible(true);
            setActiveImageSrc(img.src);
        };

        const hide = () => {
            clearHideTimer();
            hideTimerRef.current = window.setTimeout(() => {
                if (!mergeAnchor && !isHoveringRef.current && !isPopupOpenRef.current) {
                    setIsVisible(false);
                }
            }, 400);
        };

        const onImgEnter = () => {
            isHoveringRef.current = true;
            show();
        };
        const onImgLeave = (e: MouseEvent) => {
            if (
                containerRef.current &&
                e.relatedTarget instanceof Node &&
                containerRef.current.contains(e.relatedTarget)
            ) {
                return;
            }
            isHoveringRef.current = false;
            hide();
        };

        img.addEventListener('mouseenter', onImgEnter);
        img.addEventListener('mouseleave', onImgLeave);

        return () => {
            img.removeEventListener('mouseenter', onImgEnter);
            img.removeEventListener('mouseleave', onImgLeave);
            clearHideTimer();
        };
    }, [img, mergeAnchor, setActiveImageSrc]);

    const handleUpdate = (index: number, newText: string) => {
        if (!data) return;
        const newData = [...data];
        newData[index] = { ...newData[index], text: newText };
        updateOcrData(img.src, newData);
        setData(newData);
    };

    const handleMerge = (idx1: number, idx2: number) => {
        if (!data) return;
        const b1 = data[idx1];
        const b2 = data[idx2];
        const separator = settings.addSpaceOnMerge ? ' ' : '\u200B';
        const newText = b1.text + separator + b2.text;
        const x = Math.min(b1.tightBoundingBox.x, b2.tightBoundingBox.x);
        const y = Math.min(b1.tightBoundingBox.y, b2.tightBoundingBox.y);
        const right = Math.max(
            b1.tightBoundingBox.x + b1.tightBoundingBox.width,
            b2.tightBoundingBox.x + b2.tightBoundingBox.width,
        );
        const bottom = Math.max(
            b1.tightBoundingBox.y + b1.tightBoundingBox.height,
            b2.tightBoundingBox.y + b2.tightBoundingBox.height,
        );

        const newBlock: OcrBlock = {
            text: newText,
            tightBoundingBox: { x, y, width: right - x, height: bottom - y },
            isMerged: true,
            forcedOrientation: 'auto',
        };
        const newData = data.filter((_, i) => i !== idx1 && i !== idx2);
        newData.push(newBlock);
        updateOcrData(img.src, newData);
        setData(newData);
    };

    const handleDelete = (index: number) => {
        if (!data) return;
        const newData = data.filter((_, i) => i !== index);
        updateOcrData(img.src, newData);
        setData(newData);
    };

    if (!rect) return null;

    const isImgDisplayed = img.offsetParent !== null; 
    const isImgInViewport = rect.top < window.innerHeight && rect.bottom > 0; 

    // Hide overlay if the Reader Menu is open
    const shouldShowOverlay = (data || currentStatus === 'loading' || currentStatus === 'error')
        && isImgDisplayed
        && isImgInViewport
        && !isReaderOverlayVisible;

    if (!shouldShowOverlay) return null;

    const onOverlayEnter = () => {
        isHoveringRef.current = true;
        if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
        setIsVisible(true);
    };

    const onOverlayLeave = () => {
        isHoveringRef.current = false;
        hideTimerRef.current = window.setTimeout(() => {
            if (!mergeAnchor && !isPopupOpenRef.current) setIsVisible(false);
        }, 400);
    };

    // FIX: RESTORED SOLO MODE FOR MOBILE
    // Removed the "&& !settings.mobileMode" check so 'solo-mode' class is applied if enabled.
    // Also added onTouchStart to the container to ensure overlay becomes visible immediately on touch.
    const containerClasses = [
        'ocr-overlay-container',
        isVisible ? 'visible' : '',
        settings.soloHoverMode ? 'solo-mode' : '', 
    ].filter(Boolean).join(' ');

    return createPortal(
        <div
            ref={containerRef}
            className={containerClasses}
            style={{
                position: 'absolute',
                top: pageOffset.top,
                left: pageOffset.left,
                width: rect.width,
                height: rect.height,
                pointerEvents: 'none',
                zIndex: 99999,
                opacity: (isVisible || settings.interactionMode === 'click' || settings.mobileMode || settings.debugMode || currentStatus === 'loading' || currentStatus === 'error' || dictPopup.visible) ? 1 : 0,
            }}
            onMouseEnter={onOverlayEnter}
            onMouseLeave={onOverlayLeave}
            onTouchStart={onOverlayEnter} // FIX: Reveal overlay instantly on touch
        >
            <StatusIcon status={currentStatus} onRetry={fetchOCR} />
            {settings.enableOverlay && (isVisible || settings.interactionMode === 'click' || settings.mobileMode || settings.debugMode || dictPopup.visible) &&
                data?.map((block, i) => (
                    <TextBox
                        // eslint-disable-next-line react/no-array-index-key
                        key={`${i}-${block.text.substring(0, 5)}`}
                        index={i}
                        block={block}
                        imgSrc={img.src}
                        containerRect={rect}
                        onUpdate={handleUpdate}
                        onMerge={handleMerge}
                        onDelete={handleDelete}
                    />
                ))}
        </div>,
        document.body,
    );
};