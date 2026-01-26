import React, { useRef, useState, useLayoutEffect, useEffect, memo } from 'react';
import { COLOR_THEMES, OcrBlock } from '@/Manatan/types';
import { useOCR } from '@/Manatan/context/OCRContext';
import { cleanPunctuation, lookupYomitan } from '@/Manatan/utils/api';
import { updateLastCard } from '@/Manatan/utils/anki';
import { CropperModal } from '@/Manatan/components/CropperModal';
import { createPortal } from 'react-dom';
import { makeToast } from '@/base/utils/Toast';

const calculateFontSize = (text: string, w: number, h: number, isVertical: boolean, settings: any) => {
    const lines = text.split('\n');
    const lineCount = lines.length || 1;
    const maxLineLength = Math.max(...lines.map((l) => l.length)) || 1;
    let size = 16;
    const safeW = w * 0.85;
    const safeH = h * 0.85;

    if (isVertical) {
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
    
    // Lower minimum font size for mobile to prevent overflow in small bubbles
    const minSize = settings.mobileMode ? 5 : 10;
    return Math.max(minSize, Math.min(size, 200));
};

export const TextBox: React.FC<{
    block: OcrBlock;
    index: number;
    imgSrc: string;
    spreadData?: { leftSrc: string; rightSrc: string };
    containerWidth: number;
    containerHeight: number;
    onUpdate: (idx: number, txt: string) => void;
    onMerge: (src: number, target: number) => void;
    onDelete: (idx: number) => void;
    parentVisible?: boolean; 
}> = memo(({ block, index, imgSrc, spreadData, containerWidth, containerHeight, onUpdate, onMerge, onDelete, parentVisible = true }) => {
    const { 
        settings, 
        mergeAnchor, 
        setMergeAnchor, 
        setDictPopup,
        dictPopup,
        wasPopupClosedRecently,
        showConfirm,
        showProgress,
        closeDialog,
    } = useOCR();
    const [isEditing, setIsEditing] = useState(false);
    const [isActive, setIsActive] = useState(false); 
    const [isLocalHover, setIsLocalHover] = useState(false); 
    const [fontSize, setFontSize] = useState(16);
    const [showCropper, setShowCropper] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const justActivated = useRef(false);
    const dictPopupRef = useRef(dictPopup.visible);
    useEffect(() => { dictPopupRef.current = dictPopup.visible; }, [dictPopup.visible]);

    const isVertical =
        block.forcedOrientation === 'vertical' ||
        (settings.textOrientation === 'smart' && block.tightBoundingBox.height > block.tightBoundingBox.width * 1.5) ||
        settings.textOrientation === 'forceVertical';

    const adj = settings.boundingBoxAdjustment || 0;

    // --- COLOR THEME LOGIC ---
    const theme = COLOR_THEMES[settings.colorTheme] || COLOR_THEMES.white;
    const isDarkTheme = settings.colorTheme === 'dark';
    const isWhiteTheme = settings.colorTheme === 'white';

    // Background Color Logic
    const bgColor = isDarkTheme 
        ? '#1a1d21' 
        : (isWhiteTheme ? '#ffffff' : theme.background);

    // Active Background Logic
    // Dark Theme: slightly lighter dark
    // Other Themes: Theme background (or white if White theme)
    const activeBgColor = isDarkTheme 
        ? '#2d3436' 
        : (isWhiteTheme ? '#ffffff' : theme.background);

    // Border Logic
    // White/Dark themes: use a neutral gray border unless active
    // Colored themes: Always use accent color for border (as per request to not use gray)
    const borderColor = (isWhiteTheme || isDarkTheme) 
        ? theme.accent 
        : theme.accent;

    const handleMouseUpFix = (e: React.MouseEvent) => {
        if (settings.mobileMode) return; 

        const wrapper = document.querySelector('.reader-zoom-wrapper');
        if (wrapper) {
            const event = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: e.clientX,
                clientY: e.clientY,
                buttons: 0
            });
            wrapper.dispatchEvent(event);
        }
    };

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const preventBrowserZoom = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        element.addEventListener('wheel', preventBrowserZoom, { passive: false });
        return () => element.removeEventListener('wheel', preventBrowserZoom);
    }, []);

    useLayoutEffect(() => {
        if (!ref.current) return;
        const pxW = block.tightBoundingBox.width * containerWidth;
        const pxH = block.tightBoundingBox.height * containerHeight;

        if (!isEditing) {
            const displayTxt = cleanPunctuation(block.text, settings.addSpaceOnMerge).replace(/\u200B/g, '\n');
            setFontSize(calculateFontSize(displayTxt, pxW + adj, pxH + adj, isVertical, settings));
        }
    }, [block, containerWidth, containerHeight, settings, isEditing, isVertical]);

    let displayContent = isEditing ? block.text : cleanPunctuation(block.text, settings.addSpaceOnMerge);
    displayContent = displayContent.replace(/\u200B/g, '\n');

    useLayoutEffect(() => {
        const selection = window.getSelection();
        if (!selection) return;

        if (!dictPopup.visible) {
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

    useEffect(() => {
        if (!isActive || !settings.mobileMode) return;
        
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Element;
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

    const getTargetField = (type: 'Image' | 'Sentence') => {
        if (settings.ankiFieldMap) {
            const mapped = Object.keys(settings.ankiFieldMap).find(key => settings.ankiFieldMap![key] === type);
            if (mapped) return mapped;
        }
        return '';
    };

    const handleAnkiRequest = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!settings.ankiConnectEnabled) {
            makeToast('AnkiConnect integration is disabled in settings.', 'warning');
            return;
        }

        let content = cleanPunctuation(block.text, settings.addSpaceOnMerge);
        content = content.replace(/\u200B/g, '\n');

        if (settings.ankiEnableCropper) {
            setShowCropper(true);
        } else {
            showConfirm(
                'Update Anki Card?',
                'This will overwrite the image and text of the last added card in Anki.',
                async () => {
                    try {
                        showProgress('Updating Anki card...');
                        
                        const imgField = getTargetField('Image');
                        const sentField = getTargetField('Sentence');

                        await updateLastCard(
                            settings.ankiConnectUrl || 'http://127.0.0.1:8765',
                            imgSrc,
                            content,
                            imgField || '',
                            sentField || '',
                            settings.ankiImageQuality || 0.92
                        );
                        
                        closeDialog();
                        makeToast('Anki card updated successfully!', { variant: 'success', autoHideDuration: 1500 });
                    } catch (err: any) {
                        closeDialog();
                        makeToast('Failed to update Anki card', 'error', err.message);
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
                    
                    const imgField = getTargetField('Image');
                    const sentField = getTargetField('Sentence');

                    // Manually construct the update since we already have the cropped image
                    const id = await (async () => {
                        const ankiConnectUrl = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
                        const res = await fetch(ankiConnectUrl, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'findNotes', params: { query: 'added:1' }, version: 6 })
                        });
                        const json = await res.json();
                        if (!json.result || !Array.isArray(json.result)) return undefined;
                        return json.result.sort().at(-1);
                    })();

                    if (!id) throw new Error('Could not find recent card (no cards created today)');

                    const updatePayload: any = { note: { id, fields: {} } };
                    
                    if (sentField && sentField.trim() && content) {
                        updatePayload.note.fields[sentField] = content;
                    }
                    
                    if (imgField && imgField.trim()) {
                        updatePayload.note.fields[imgField] = ''; 
                        updatePayload.note.picture = {
                            filename: `manatan_${id}.webp`,
                            data: croppedImage.split(';base64,')[1],
                            fields: [imgField]
                        };
                    }

                    const ankiConnectUrl = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
                    const res = await fetch(ankiConnectUrl, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'updateNoteFields', params: updatePayload, version: 6 })
                    });
                    const json = await res.json();
                    if (json.error) throw new Error(json.error);
                    
                    closeDialog();
                    makeToast('Anki card updated successfully!', { variant: 'success', autoHideDuration: 1500 });
                } catch (err: any) {
                    closeDialog();
                    makeToast('Failed to update Anki card', 'error', err.message);
                }
            }
        );
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!settings.mobileMode) return;
        if (!isActive) {
            setIsActive(true);
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
            if (settings.mobileMode) {
                if (!isActive) {
                    setIsActive(true);
                    return;
                }
                if (justActivated.current) {
                    return;
                }
            }

            if (!settings.enableYomitan) return;

            let charOffset = 0;
            let range: Range | null = null;
            
            // FIX: Robust hit-testing to fix "Next Character" scanning issue.
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
                    charOffset = range.startOffset;
                    
                    // If caret is > 0, check if we clicked on the *previous* character
                    if (charOffset > 0) {
                        const checkRange = document.createRange();
                        checkRange.setStart(range.startContainer, charOffset - 1);
                        checkRange.setEnd(range.startContainer, charOffset);
                        const rect = checkRange.getBoundingClientRect();
                        
                        // If click is inside the previous character's box, effectively select IT.
                        if (e.clientX >= rect.left && e.clientX <= rect.right &&
                            e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            charOffset -= 1;
                        }
                    }
                }
            } else if ((document as any).caretPositionFromPoint) {
                // Fallback for Firefox
                const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
                if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE) {
                    charOffset = pos.offset;
                    if (charOffset > 0) {
                        const checkRange = document.createRange();
                        checkRange.setStart(pos.offsetNode, charOffset - 1);
                        checkRange.setEnd(pos.offsetNode, charOffset);
                        const rect = checkRange.getBoundingClientRect();
                        
                        if (e.clientX >= rect.left && e.clientX <= rect.right &&
                            e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            charOffset -= 1;
                        }
                    }
                }
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
                highlight: undefined,
                context: { imgSrc, sentence: content, spreadData }
            });

            // Pass the resultGroupingMode setting here
            const results = await lookupYomitan(content, byteIndex, settings.resultGroupingMode);

            if (results === 'loading') {
                 setDictPopup(prev => ({ ...prev, results: [], isLoading: false, systemLoading: true }));
            } else {
                setDictPopup(prev => ({ 
                    ...prev, 
                    results: results, 
                    isLoading: false, 
                    systemLoading: false, 
                    highlight: { imgSrc, index, startChar: charOffset, length: (results && results[0]?.matchLen) || 1 }
                }));
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditing) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditing(true); }
        if (e.key === 'Delete') { e.preventDefault(); onDelete(index); }
    };

    const handleCopy = (e: React.ClipboardEvent) => {
        if (isEditing) return;

        e.preventDefault();
        const selection = window.getSelection();
        if (!selection) return;

        const cleanText = selection.toString().replace(/(\r\n|\n|\r)/gm, "");
        e.clipboardData.setData('text/plain', cleanText);
    };

    const isMergedTarget = mergeAnchor?.imgSrc === imgSrc && mergeAnchor?.index === index;
    const isLookingUp = dictPopup.visible && dictPopup.highlight?.imgSrc === imgSrc && dictPopup.highlight?.index === index;

    const classes = ['gemini-ocr-text-box', isVertical ? 'vertical' : '', isEditing ? 'editing' : '', isMergedTarget ? 'merge-target' : '', isActive ? 'mobile-active' : '', isLookingUp ? 'active-lookup' : ''].filter(Boolean).join(' ');

    const shouldBeVisible = !settings.soloHoverMode || parentVisible || isLocalHover || isEditing || isActive || isLookingUp;

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
                    if (settings.ankiConnectEnabled && !e.shiftKey) handleAnkiRequest(e);
                }}
                onCopy={handleCopy}
                
                onBlur={() => {
                    if (settings.mobileMode) return;
                    setIsEditing(false);
                    setIsActive(false); 
                    const raw = ref.current?.innerText || '';
                    if (raw !== displayContent) onUpdate(index, raw.replace(/\n/g, '\u200B'));
                }}
                onClick={handleInteract}
                onTouchStart={handleTouchStart}
                
                onMouseEnter={() => setIsLocalHover(true)}
                onMouseLeave={() => setIsLocalHover(false)}
                
                onMouseUp={handleMouseUpFix}
                onMouseDown={(e) => {
                    if (!settings.mobileMode) {
                        e.stopPropagation();
                    }
                }}

                style={{
                    left: `calc(${block.tightBoundingBox.x * 100}% - ${adj / 2}px)`,
                    top: `calc(${block.tightBoundingBox.y * 100}% - ${adj / 2}px)`,
                    minWidth: `calc(${block.tightBoundingBox.width * 100}% + ${adj}px)`,
                    minHeight: `calc(${block.tightBoundingBox.height * 100}% + ${adj}px)`,
                    width: 'fit-content',
                    height: 'fit-content',
                    fontSize: `${fontSize}px`,
                    color: 'var(--ocr-text-color)',
                    whiteSpace: 'pre',
                    overflow: isEditing ? 'auto' : 'visible', 
                    touchAction: 'pan-y', 
                    
                    // Style Overrides
                    backgroundColor: isActive ? activeBgColor : bgColor,
                    border: `1px solid ${isActive ? theme.accent : borderColor}`,
                    outline: isActive ? `2px solid ${theme.accent}` : 'none',
                    borderRadius: '3px',
                    
                    lineHeight: isVertical ? '1.5' : '1.1',
                    
                    opacity: shouldBeVisible ? 1 : 0,
                    transition: 'opacity 0.2s',
                }}
            >
                {displayContent}
            </div>
            {showCropper && createPortal(
                <CropperModal
                    imageSrc={imgSrc}
                    spreadData={spreadData}
                    onComplete={handleCropperComplete}
                    onCancel={() => setShowCropper(false)}
                    quality={settings.ankiImageQuality || 0.92}
                />,
                document.body
            )}
        </>
    );
});