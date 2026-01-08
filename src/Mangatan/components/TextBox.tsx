import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { OcrBlock } from '@/Mangatan/types';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { cleanPunctuation, lookupYomitan } from '@/Mangatan/utils/api';
import { createCard, updateLastCard, imageUrlToBase64Webp } from '@/Mangatan/utils/anki';
import { CropperModal } from '@/Mangatan/components/CropperModal';
import { createPortal } from 'react-dom';

const calculateFontSize = (text: string, w: number, h: number, isVertical: boolean, settings: any) => {
    const lines = text.split('\n');
    const lineCount = lines.length || 1;
    const maxLineLength = Math.max(...lines.map((l) => l.length)) || 1;
    let size = 16;
    const safeW = w * 0.85;
    const safeH = h * 0.85;

    if (isVertical) {
        // In vertical text:
        // Width dictates how many columns (lines) fit
        // Height dictates how long a column can be
        const maxFontSizeByWidth = safeW / lineCount;
        const maxFontSizeByHeight = safeH / maxLineLength;
        size = Math.min(maxFontSizeByWidth, maxFontSizeByHeight);
        size *= settings.fontMultiplierVertical;
    } else {
        const maxFontSizeByHeight = safeH / lineCount;
        const maxFontSizeByWidth = safeW / maxLineLength;
        size = Math.min(maxFontSizeByHeight, maxFontSizeByWidth);
        size *= settings.fontMultiplierHorizontal;
    }
    return Math.max(10, Math.min(size, 200));
};

export const TextBox: React.FC<{
    block: OcrBlock;
    index: number;
    imgSrc: string;
    containerRect: DOMRect;
    onUpdate: (idx: number, txt: string) => void;
    onMerge: (src: number, target: number) => void;
    onDelete: (idx: number) => void;
}> = ({ block, index, imgSrc, containerRect, onUpdate, onMerge, onDelete }) => {
    const { 
        settings, 
        mergeAnchor, 
        setMergeAnchor, 
        setDictPopup,
        dictPopup,
        wasPopupClosedRecently,
        showConfirm,
        showProgress,
        showAlert,
        closeDialog,
        serverSettings
    } = useOCR();
    const [isEditing, setIsEditing] = useState(false);
    const [isActive, setIsActive] = useState(false); 
    const [fontSize, setFontSize] = useState(16);
    const [showCropper, setShowCropper] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // FIX: Track if we just activated the box to prevent "1-click" lookup on Android
    const justActivated = useRef(false);

    // Track popup state via ref to access inside event listeners safely
    const dictPopupRef = useRef(dictPopup.visible);
    useEffect(() => { dictPopupRef.current = dictPopup.visible; }, [dictPopup.visible]);

    const isVertical =
        block.forcedOrientation === 'vertical' ||
        (settings.textOrientation === 'smart' && block.tightBoundingBox.height > block.tightBoundingBox.width * 1.5) ||
        settings.textOrientation === 'forceVertical';

    const adj = settings.boundingBoxAdjustment || 0;

    const bgColor = settings.brightnessMode === 'dark' ? '#1a1d21' : '#ffffff';
    const activeBgColor = settings.brightnessMode === 'dark' ? '#2d3436' : '#e3f2fd';

    useLayoutEffect(() => {
        if (!ref.current) return;
        const pxW = block.tightBoundingBox.width * containerRect.width;
        const pxH = block.tightBoundingBox.height * containerRect.height;

        if (!isEditing) {
            // Respect newlines added by the backend
            const displayTxt = cleanPunctuation(block.text, settings.addSpaceOnMerge).replace(/\u200B/g, '\n');
            setFontSize(calculateFontSize(displayTxt, pxW + adj, pxH + adj, isVertical, settings));
        }
    }, [block, containerRect, settings, isEditing, isVertical]);

    let displayContent = isEditing ? block.text : cleanPunctuation(block.text, settings.addSpaceOnMerge);
    displayContent = displayContent.replace(/\u200B/g, '\n');

    // --- NATIVE SELECTION HANDLER ---
    useLayoutEffect(() => {
        const selection = window.getSelection();
        if (!selection) return;

        // Explicitly clear selection when popup closes to remove the highlight pins/color
        if (!dictPopup.visible) {
            // Only clear selection if WE are the active box
            if (isActive) selection.removeAllRanges();
            return;
        }

        const highlight = dictPopup.highlight;
        if (!highlight || highlight.imgSrc !== imgSrc || highlight.index !== index) {
            return;
        }

        const node = ref.current?.firstChild;

        if (node && node.nodeType === Node.TEXT_NODE) {
            try {
                const range = document.createRange();
                const start = Math.max(0, Math.min(highlight.startChar, node.textContent?.length || 0));
                const end = Math.max(0, Math.min(start + highlight.length, node.textContent?.length || 0));
                
                range.setStart(node, start);
                range.setEnd(node, end);
                
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (e) {
                // Silently fail
            }
        }
    }, [dictPopup.visible, dictPopup.highlight, imgSrc, index, displayContent, isActive]);

    // --- GLOBAL CLICK LISTENER ---
    useEffect(() => {
        if (!isActive || !settings.mobileMode) return;
        
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Element;

            // If popup is open or was just closed, ignore this click to prevent closing the text box
            if (dictPopupRef.current || wasPopupClosedRecently()) return;

            if (target && (target.closest('.yomitan-popup') || target.closest('.yomitan-backdrop'))) {
                return; 
            }

            if (ref.current && !ref.current.contains(target as Node)) {
                setIsActive(false);
                setIsEditing(false);
            }
        };

        document.addEventListener('touchstart', handleGlobalClick);
        document.addEventListener('mousedown', handleGlobalClick);
        return () => {
            document.removeEventListener('touchstart', handleGlobalClick);
            document.removeEventListener('mousedown', handleGlobalClick);
        };
    }, [isActive, settings.mobileMode, wasPopupClosedRecently]);

    useEffect(() => {
        if (!isActive && !isEditing && settings.mobileMode) {
             const raw = ref.current?.innerText || '';
             if (raw !== displayContent) {
                 onUpdate(index, raw.replace(/\n/g, '\u200B'));
             }
        }
    }, [isActive, isEditing, settings.mobileMode, index, onUpdate, displayContent]);

    const handleAnkiRequest = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!settings.ankiConnectEnabled) {
            showAlert('Anki Disabled', 'AnkiConnect integration is disabled in settings.');
            return;
        }

        let content = cleanPunctuation(block.text, settings.addSpaceOnMerge);
        content = content.replace(/\u200B/g, '\n');

        if (settings.ankiEnableCropper) {
            // Show cropper modal
            setShowCropper(true);
        } else {
            // Direct update without cropper
            showConfirm(
                'Update Anki Card?',
                'This will overwrite the image and text of the last added card in Anki.',
                async () => {
                    try {
                        showProgress('Updating Anki card...');

                        const { updateLastCard } = await import('@/Mangatan/utils/anki');

                        await updateLastCard(
                            settings.ankiConnectUrl || 'http://127.0.0.1:8765',
                            imgSrc,
                            content,
                            settings.ankiImageField || '',
                            settings.ankiSentenceField || '',
                            settings.ankiImageQuality || 0.92
                        );
                        
                        closeDialog();
                        showAlert('Success', 'Anki card updated successfully!');

                    } catch (err: any) {
                        closeDialog();
                        showAlert('Anki Error', err.message || 'Failed to update Anki card');
                    }
                }
            );
        }
    };

    const handleCropperComplete = async (croppedImage: string) => {
        setShowCropper(false);

        let content = cleanPunctuation(block.text, settings.addSpaceOnMerge);
        content = content.replace(/\u200B/g, '\n');

        showConfirm(
            'Update Anki Card?',
            'This will overwrite the image and text of the last added card in Anki.',
            async () => {
                try {
                    showProgress('Updating Anki card...');

                    // Manually construct the update since we already have the cropped image
                    const id = await (async () => {
                        const ankiConnectUrl = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
                        const res = await fetch(ankiConnectUrl, {
                            method: 'POST',
                            body: JSON.stringify({ 
                                action: 'findNotes', 
                                params: { query: 'added:1' }, 
                                version: 6 
                            })
                        });
                        const json = await res.json();
                        if (!json.result || !Array.isArray(json.result)) return undefined;
                        return json.result.sort().at(-1);
                    })();

                    if (!id) {
                        throw new Error('Could not find recent card (no cards created today)');
                    }

                    const cardAge = Math.floor((Date.now() - id) / 60000);
                    if (cardAge >= 5) {
                        throw new Error('Card created over 5 minutes ago');
                    }

                    const fields: Record<string, any> = {};
                    const updatePayload: any = {
                        note: {
                            id,
                            fields
                        }
                    };

                    // Handle sentence field
                    if (settings.ankiSentenceField && settings.ankiSentenceField.trim() && content) {
                        fields[settings.ankiSentenceField] = content;
                    }

                    // Handle picture field with cropped image
                    if (settings.ankiImageField && settings.ankiImageField.trim()) {
                        fields[settings.ankiImageField] = '';

                        updatePayload.note.picture = {
                            filename: `mangatan_${id}.webp`,
                            data: croppedImage.split(';base64,')[1],
                            fields: [settings.ankiImageField]
                        };
                    }

                    // Make the request
                    const ankiConnectUrl = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
                    const res = await fetch(ankiConnectUrl, {
                        method: 'POST',
                        body: JSON.stringify({ 
                            action: 'updateNoteFields', 
                            params: updatePayload, 
                            version: 6 
                        })
                    });
                    const json = await res.json();

                    if (json.error) {
                        throw new Error(json.error);
                    }
                    
                    closeDialog();
                    showAlert('Success', 'Anki card updated successfully!');

                } catch (err: any) {
                    closeDialog();
                    showAlert('Anki Error', err.message || 'Failed to update Anki card');
                }
            }
        );
    };

    // FIX: HANDLE FIRST TAP (ACTIVATION)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (!settings.mobileMode) return;
        
        if (!isActive) {
            setIsActive(true);
            
            // Set flag to block the subsequent click event from triggering lookup
            justActivated.current = true;
            setTimeout(() => justActivated.current = false, 500);

            if (e.cancelable) e.preventDefault();
        }
    };

    const handleInteract = async (e: React.MouseEvent) => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && !dictPopup.visible) return;

        if (isEditing) return;
        e.stopPropagation();
        if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();

        const isDelete = settings.deleteModifierKey === 'Alt' ? e.altKey : e.ctrlKey;
        const isMerge = settings.mergeModifierKey === 'Control' ? e.ctrlKey : e.altKey;

        if (isDelete) {
            e.preventDefault();
            onDelete(index);
        } else if (isMerge) {
            e.preventDefault();
            if (!mergeAnchor) setMergeAnchor({ imgSrc, index });
            else {
                if (mergeAnchor.imgSrc === imgSrc && mergeAnchor.index !== index) onMerge(mergeAnchor.index, index);
                setMergeAnchor(null);
            }
        } else {
            // FIX: ANDROID 2-CLICK GUARD
            // If we just activated this box (via touchStart), OR if isActive is somehow false,
            // STOP here. Do not lookup.
            if (settings.mobileMode && (justActivated.current || !isActive)) {
                if (!isActive) setIsActive(true);
                return;
            }

            if (!settings.enableYomitan) return;

            // --- YOMITAN LOOKUP ---
            let charOffset = 0;
            let range: Range | null = null;
            
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (range) charOffset = range.startOffset;
            } else if ((document as any).caretPositionFromPoint) {
                const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
                if (pos) charOffset = pos.offset;
            }

            if (range && range.startContainer.nodeType === Node.TEXT_NODE && charOffset > 0) {
                try {
                    const testRange = document.createRange();
                    testRange.setStart(range.startContainer, charOffset - 1);
                    testRange.setEnd(range.startContainer, charOffset);
                    const rects = testRange.getClientRects();
                    for (let i = 0; i < rects.length; i++) {
                        const rect = rects[i];
                        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            charOffset -= 1;
                            break;
                        }
                    }
                } catch (err) {}
            }

            let content = cleanPunctuation(block.text, settings.addSpaceOnMerge);
            content = content.replace(/\u200B/g, '\n');

            const encoder = new TextEncoder();
            const prefix = content.substring(0, charOffset);
            const byteIndex = encoder.encode(prefix).length;

            setDictPopup({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                results: [],
                isLoading: true,
                systemLoading: false,
                highlight: undefined 
            });

            const results = await lookupYomitan(content, byteIndex);

            if (results === 'loading') {
                 setDictPopup(prev => ({ ...prev, results: [], isLoading: false, systemLoading: true }));
            } else {
                const matchLen = (results && results.length > 0 && results[0].matchLen) ? results[0].matchLen : 1;
                
                setDictPopup(prev => ({ 
                    ...prev, 
                    results: results, 
                    isLoading: false, 
                    systemLoading: false,
                    highlight: {
                        imgSrc,
                        index,
                        startChar: charOffset,
                        length: matchLen
                    }
                }));
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditing) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsEditing(true);
        }
        if (e.key === 'Delete') {
            e.preventDefault();
            onDelete(index);
        }
    };

    const isMergedTarget = mergeAnchor?.imgSrc === imgSrc && mergeAnchor?.index === index;

    // Check if this box is the one currently being looked up
    const isLookingUp = dictPopup.visible && 
                        dictPopup.highlight?.imgSrc === imgSrc && 
                        dictPopup.highlight?.index === index;

    const classes = [
        'gemini-ocr-text-box',
        isVertical ? 'vertical' : '',
        isEditing ? 'editing' : '',
        isMergedTarget ? 'merge-target' : '',
        isActive ? 'mobile-active' : '',
        isLookingUp ? 'active-lookup' : '' // FIX: Added class to force visibility
    ].filter(Boolean).join(' ');

    return (
        <>
            <div
                ref={ref}
                role="button"
                tabIndex={settings.mobileMode ? -1 : 0}
                onKeyDown={handleKeyDown}
                className={classes}
                contentEditable={isEditing}
                suppressContentEditableWarning
                onDoubleClick={() => setIsEditing(true)}
                onContextMenu={(e) => {
                    // Check if user holds Shift or other logic if needed
                    if (settings.ankiConnectEnabled && !e.shiftKey) { 
                        handleAnkiRequest(e);
                    }
                }}
                onBlur={() => {
                    if (settings.mobileMode) return;
                    setIsEditing(false);
                    setIsActive(false); 
                    const raw = ref.current?.innerText || '';
                    if (raw !== displayContent) onUpdate(index, raw.replace(/\n/g, '\u200B'));
                }}
                onClick={handleInteract}
                onTouchStart={handleTouchStart}
                style={{
                    left: `calc(${block.tightBoundingBox.x * 100}% - ${adj / 2}px)`,
                    top: `calc(${block.tightBoundingBox.y * 100}% - ${adj / 2}px)`,
                    minWidth: `calc(${block.tightBoundingBox.width * 100}% + ${adj}px)`,
                    minHeight: `calc(${block.tightBoundingBox.height * 100}% + ${adj}px)`,
                    width: 'fit-content',
                    height: 'fit-content',
                    fontSize: `${fontSize}px`,
                    color: settings.focusFontColor === 'difference' ? 'white' : 'var(--ocr-text-color)',
                    mixBlendMode: settings.focusFontColor === 'difference' ? 'difference' : 'normal',
                    whiteSpace: 'pre',
                    overflow: isEditing ? 'auto' : 'visible', 
                    touchAction: 'pan-y', 
                    backgroundColor: isActive ? activeBgColor : bgColor,
                    outline: isActive ? '2px solid var(--ocr-accent, #4890ff)' : 'none',
                    lineHeight: isVertical ? '1.5' : '1.1',
                }}
            >
                {displayContent}
            </div>

            {showCropper && createPortal(
                <CropperModal
                    imageSrc={imgSrc}
                    onComplete={handleCropperComplete}
                    onCancel={() => setShowCropper(false)}
                    quality={settings.ankiImageQuality || 0.92}
                />,
                document.body
            )}
        </>
    );
};
