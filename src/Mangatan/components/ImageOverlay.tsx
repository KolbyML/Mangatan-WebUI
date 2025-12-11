import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOCR, OcrStatus } from '@/Mangatan/context/OCRContext';
import { apiRequest } from '@/Mangatan/utils/api';
import { OcrBlock } from '@/Mangatan/types';
import { TextBox } from '@/Mangatan/components/TextBox';
import { StatusIcon } from '@/Mangatan/components/StatusIcon';

export const ImageOverlay: React.FC<{ img: HTMLImageElement }> = ({ img }) => {
    const { settings, ocrCache, updateOcrData, setActiveImageSrc, mergeAnchor, ocrStatusMap, setOcrStatus } = useOCR();
    const [data, setData] = useState<OcrBlock[] | null>(null);

    const currentStatus: OcrStatus = ocrCache.has(img.src) ? 'success' : (ocrStatusMap.get(img.src) || 'idle');

    // Coordinates for Absolute Positioning
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [pageOffset, setPageOffset] = useState({ top: 0, left: 0 });

    // Visibility State
    const [isVisible, setIsVisible] = useState(false);

    // Refs for Stability (Fixes the "hover stops working" bug)
    const containerRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<number | null>(null);
    const isHoveringRef = useRef(false); // Tracks if mouse is physically over Image OR Overlay

    const fetchOCR = useCallback(async () => {
        if (!img.src || ocrCache.has(img.src)) return;

        try {
            setOcrStatus(img.src, 'loading');
            // eslint-disable-next-line no-console
            console.log(`Fetching OCR for: ${img.src}`);

            const url = `/api/ocr/ocr?url=${encodeURIComponent(img.src)}`;
            const result = await apiRequest<OcrBlock[]>(url);

            if (Array.isArray(result)) {
                // updateOcrData automatically sets status to 'success'
                updateOcrData(img.src, result);
                setData(result);
            } else {
                 throw new Error("Invalid response format");
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("OCR Failed:", err);
            setOcrStatus(img.src, 'error');
        }
    }, [img.src, ocrCache, setOcrStatus, updateOcrData]);

    // 1. Fetch OCR Data
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

    // 3. Robust Hover Logic (Attached to Native Image)
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
            // Add a delay to allow moving from Image -> TextBox
            clearHideTimer();
            hideTimerRef.current = window.setTimeout(() => {
                // Only hide if we aren't holding a merge anchor and we aren't technically hovering
                if (!mergeAnchor && !isHoveringRef.current) {
                    setIsVisible(false);
                }
            }, 400); // 400ms grace period
        };

        // Native Image Listeners
        const onImgEnter = () => {
            isHoveringRef.current = true;
            show();
        };
        const onImgLeave = (e: MouseEvent) => {
            // Check if we moved into the overlay container (React Portal)
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
    }, [img, mergeAnchor]);

    // Data Handlers
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
    const shouldShowOverlay = data || currentStatus === 'loading' || currentStatus === 'error';
    if (!shouldShowOverlay) return null;

    // React Overlay Events
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
            if (!mergeAnchor) setIsVisible(false);
        }, 400);
    };

    // Class construction for Solo Mode
    const containerClasses = [
        'ocr-overlay-container',
        isVisible ? 'visible' : '',
        settings.soloHoverMode ? 'solo-mode' : '',
    ]
        .filter(Boolean)
        .join(' ');

    // Opacity Logic
    // If Debug/Click/Mobile: Always 1
    // If Hover Mode: 1 if active, 0 if inactive
    const opacity =
        isVisible || settings.interactionMode === 'click' || settings.debugMode || settings.mobileMode ? 1 : 0;

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
                pointerEvents: 'none', // Lets clicks pass through to image
                zIndex: 99999,
                opacity: (isVisible || settings.interactionMode === 'click' || settings.mobileMode || settings.debugMode || currentStatus === 'loading' || currentStatus === 'error') ? 1 : 0,
            }}
            onMouseEnter={onOverlayEnter}
            onMouseLeave={onOverlayLeave}
        >
            {/* Logic: If we are visible, map the boxes. 
         We do NOT filter data based on hover here; CSS handles the hiding in Solo Mode. 
      */}
            <StatusIcon status={currentStatus} onRetry={fetchOCR} />
            {settings.enableOverlay && (isVisible || settings.interactionMode === 'click' || settings.mobileMode || settings.debugMode) &&
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