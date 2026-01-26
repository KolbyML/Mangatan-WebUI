import React, { useRef, useLayoutEffect, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOCR } from '@/Manatan/context/OCRContext';
import { findNotes, addNote, guiBrowse, imageUrlToBase64Webp } from '@/Manatan/utils/anki';
import { DictionaryResult } from '@/Manatan/types';
import { CropperModal } from '@/Manatan/components/CropperModal';

export const StructuredContent: React.FC<{ contentString: string }> = ({ contentString }) => {
    const parsedData = useMemo(() => {
        if (!contentString) return null;
        try {
            return JSON.parse(contentString);
        } catch (e) {
            return contentString;
        }
    }, [contentString]);

    if (parsedData === null || parsedData === undefined) return null;
    return <ContentNode node={parsedData} />;
};

const ContentNode: React.FC<{ node: any }> = ({ node }) => {
    if (node === null || node === undefined) return null;
    if (typeof node === 'string' || typeof node === 'number') return <>{node}</>;
    if (Array.isArray(node)) return <>{node.map((item, i) => <ContentNode key={i} node={item} />)}</>;
    if (node.type === 'structured-content') return <ContentNode node={node.content} />;

    const { tag, content, style, href } = node;
    const s = style || {};

    const cellStyle: React.CSSProperties = { border: '1px solid #777', padding: '2px 8px', textAlign: 'center' };
    const tableStyle: React.CSSProperties = { 
        borderCollapse: 'collapse', 
        border: '1px solid #555', 
        margin: '4px 0', 
        fontSize: '0.9em', 
        width: '100%' 
    };
    
    const listStyle: React.CSSProperties = { paddingLeft: '20px', margin: '2px 0', listStyleType: 'disc' };

    switch (tag) {
        case 'ul': return <ul style={{ ...s, ...listStyle }}><ContentNode node={content} /></ul>;
        case 'ol': return <ol style={{ ...s, ...listStyle, listStyleType: 'decimal' }}><ContentNode node={content} /></ol>;
        case 'li': return <li style={{ ...s }}><ContentNode node={content} /></li>;
        case 'table': return <table style={{ ...s, ...tableStyle }}><tbody><ContentNode node={content} /></tbody></table>;
        case 'tr': return <tr style={s}><ContentNode node={content} /></tr>;
        case 'th': return <th style={{ ...s, ...cellStyle, fontWeight: 'bold' }}><ContentNode node={content} /></th>;
        case 'td': return <td style={{ ...s, ...cellStyle }}><ContentNode node={content} /></td>;
        case 'span': return <span style={s}><ContentNode node={content} /></span>;
        case 'div': return <div style={s}><ContentNode node={content} /></div>;
        case 'a': return <a href={href} style={{ ...s, color: '#4890ff', textDecoration: 'underline' }} target="_blank" rel="noreferrer"><ContentNode node={content} /></a>;
        default: return <ContentNode node={content} />;
    }
};

const tagStyle: React.CSSProperties = {
    display: 'inline-block', padding: '1px 5px', borderRadius: '3px',
    fontSize: '0.75em', fontWeight: 'bold', marginRight: '6px',
    color: '#fff', verticalAlign: 'middle', lineHeight: '1.2'
};

const AnkiButtons: React.FC<{ 
    entry: DictionaryResult 
}> = ({ entry }) => {
    const { settings, dictPopup, showAlert } = useOCR();
    const [status, setStatus] = useState<'unknown' | 'loading' | 'missing' | 'exists'>('unknown');
    const [existingNoteId, setExistingNoteId] = useState<number | null>(null);
    const [showCropper, setShowCropper] = useState(false);

    // Identify which Anki field is mapped to 'Target Word' for precise checking
    const targetField = useMemo(() => {
        return Object.keys(settings.ankiFieldMap || {}).find(key => settings.ankiFieldMap?.[key] === 'Target Word');
    }, [settings.ankiFieldMap]);

    const checkStatus = async () => {
        if (!settings.ankiConnectEnabled || !settings.ankiCheckDuplicates) return;
        
        try {
            const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
            
            let query = `deck:"${settings.ankiDeck}"`;
            if (targetField) {
                query += ` "${targetField}:${entry.headword}"`;
            } else {
                query += ` "${entry.headword}"`; 
            }
            
            const ids = await findNotes(url, query);
            if (ids.length > 0) {
                setStatus('exists');
                setExistingNoteId(ids[0]);
            } else {
                setStatus('missing');
                setExistingNoteId(null);
            }
        } catch (e) {
            console.error("Anki check failed", e);
            setStatus('unknown'); 
        }
    };

    useEffect(() => {
        if (settings.ankiCheckDuplicates) {
            setStatus('loading');
            checkStatus();
        } else {
            setStatus('missing'); 
        }
    }, [entry.headword, settings.ankiCheckDuplicates, targetField]);

    const handleAddClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!settings.ankiDeck || !settings.ankiModel) {
            showAlert("Anki Settings Missing", "Please select a Deck and Model in settings.");
            return;
        }

        const map = settings.ankiFieldMap || {};
        const hasImageField = Object.values(map).includes('Image');

        if (settings.ankiEnableCropper && hasImageField && dictPopup.context?.imgSrc) {
            setShowCropper(true);
        } else {
            addNoteToAnki();
        }
    };

    const addNoteToAnki = async (croppedBase64?: string) => {
        const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
        const fields: Record<string, string> = {};
        const map = settings.ankiFieldMap || {};

        // --- HTML GENERATION HELPERS ---
        
        const styleToString = (style: any) => {
            if (!style) return '';
            return Object.entries(style).map(([k, v]) => {
                const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${key}:${v}`;
            }).join(';');
        };

        const generateHTML = (node: any): string => {
            if (node === null || node === undefined) return '';
            if (typeof node === 'string' || typeof node === 'number') return String(node);
            if (Array.isArray(node)) return node.map(generateHTML).join('');
            if (node.type === 'structured-content') return generateHTML(node.content);

            const { tag, content, style, href } = node;
            const customStyle = styleToString(style);
            
            let baseStyle = '';
            
            if (tag === 'ul') {
                baseStyle = 'padding-left: 20px; margin: 2px 0; list-style-type: disc;';
                return `<ul style="${baseStyle}${customStyle}">${generateHTML(content)}</ul>`;
            }
            if (tag === 'ol') {
                baseStyle = 'padding-left: 20px; margin: 2px 0; list-style-type: decimal;';
                return `<ol style="${baseStyle}${customStyle}">${generateHTML(content)}</ol>`;
            }
            if (tag === 'li') return `<li style="${customStyle}">${generateHTML(content)}</li>`;
            if (tag === 'table') {
                baseStyle = 'border-collapse: collapse; width: 100%; border: 1px solid #777;';
                return `<table style="${baseStyle}${customStyle}"><tbody>${generateHTML(content)}</tbody></table>`;
            }
            if (tag === 'tr') return `<tr style="${customStyle}">${generateHTML(content)}</tr>`;
             if (tag === 'th') {
                baseStyle = 'border: 1px solid #777; padding: 2px 8px; text-align: center; font-weight: bold;';
                return `<th style="${baseStyle}${customStyle}">${generateHTML(content)}</th>`;
            }
            if (tag === 'td') {
                baseStyle = 'border: 1px solid #777; padding: 2px 8px; text-align: center;';
                return `<td style="${baseStyle}${customStyle}">${generateHTML(content)}</td>`;
            }
            if (tag === 'span') return `<span style="${customStyle}">${generateHTML(content)}</span>`;
            if (tag === 'div') return `<div style="${customStyle}">${generateHTML(content)}</div>`;
            if (tag === 'a') {
                baseStyle = 'text-decoration: underline;'; 
                return `<a href="${href}" target="_blank" style="${baseStyle}${customStyle}">${generateHTML(content)}</a>`;
            }
            
            return generateHTML(content);
        };

        // --- FURIGANA GENERATION HELPER ---
        const generateAnkiFurigana = (furiganaData: string[][]): string => {
            if (!furiganaData || furiganaData.length === 0) {
                return entry.headword;
            }
            return furiganaData.map(segment => {
                const kanji = segment[0];
                const kana = segment[1];
                if (kana && kana !== kanji) {
                    return `${kanji}[${kana}]`;
                }
                return kanji;
            }).join('');
        };

        const getLowestFrequency = (): string => {
            if (!entry.frequencies || entry.frequencies.length === 0) return '';
            
            const numbers = entry.frequencies
                .map(f => {
                    // Extract numeric part from string like "12345" or "12,345"
                    const cleaned = f.value.replace(/[^\d]/g, '');
                    return parseInt(cleaned, 10);
                })
                .filter(n => !isNaN(n));
            
            if (numbers.length === 0) return '';
            return Math.min(...numbers).toString();
        };

        const definitionHTML = entry.definitions.map((def, idx) => {
            const tagsHTML = def.tags.map(t => 
                `<span style="display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; font-weight: bold; margin-right: 6px; color: #fff; background-color: #666; vertical-align: middle;">${t}</span>`
            ).join('');
            
            const dictHTML = `<span style="display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 0.75em; font-weight: bold; margin-right: 6px; color: #fff; background-color: #9b59b6; vertical-align: middle;">${def.dictionaryName}</span>`;

            const contentHTML = def.content.map(c => {
                try {
                    const parsed = JSON.parse(c);
                    return `<div style="margin-bottom: 2px;">${generateHTML(parsed)}</div>`;
                } catch {
                    return `<div>${c}</div>`;
                }
            }).join('');

            return `
                <div style="margin-bottom: 12px; display: flex;">
                    <div style="flex-shrink: 0; width: 24px; font-weight: bold;">${idx + 1}.</div>
                    <div style="flex-grow: 1;">
                        <div style="margin-bottom: 4px;">${tagsHTML}${dictHTML}</div>
                        <div>${contentHTML}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Collect all tags from all definitions
        const allTags = new Set(['manatan']);
        entry.definitions.forEach(def => def.tags.forEach(t => allTags.add(t)));
        // Safely add termTags by checking if they are strings or objects
        entry.termTags?.forEach((t: any) => {
            if (typeof t === 'string') allTags.add(t);
            else if (t && typeof t === 'object' && t.name) allTags.add(t.name);
        });

        // Populate Fields
        for (const [ankiField, mapType] of Object.entries(map)) {
            if (mapType === 'Target Word') fields[ankiField] = entry.headword;
            else if (mapType === 'Reading') fields[ankiField] = entry.reading;
            else if (mapType === 'Furigana') fields[ankiField] = generateAnkiFurigana(entry.furigana || []);
            else if (mapType === 'Definition') fields[ankiField] = definitionHTML;
            else if (mapType === 'Frequency') fields[ankiField] = getLowestFrequency();
            else if (mapType === 'Sentence') fields[ankiField] = dictPopup.context?.sentence || '';
        }

        try {
            setStatus('loading');
            
            let pictureData;
            const imgField = Object.keys(map).find(k => map[k] === 'Image');

            if (imgField && dictPopup.context?.imgSrc) {
                if (croppedBase64) {
                    pictureData = {
                        data: croppedBase64.split(';base64,')[1],
                        filename: `manatan_card_${Date.now()}.webp`,
                        fields: [imgField]
                    };
                } else {
                    const b64 = await imageUrlToBase64Webp(dictPopup.context.imgSrc, settings.ankiImageQuality || 0.92);
                    if (b64) {
                        pictureData = {
                            data: b64.split(';base64,')[1],
                            filename: `manatan_card_${Date.now()}.webp`,
                            fields: [imgField]
                        };
                    }
                }
            }

            const res = await addNote(
                url, 
                settings.ankiDeck!, 
                settings.ankiModel!, 
                fields, 
                Array.from(allTags), 
                pictureData
            );

            if (res) {
                setStatus('exists');
                setExistingNoteId(res);
            } else {
                throw new Error("Anki returned null result");
            }
        } catch (e: any) {
            console.error(e);
            showAlert("Add Failed", String(e));
            setStatus('missing');
        }
    };

    const handleOpen = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
            let query = '';
            if (existingNoteId) {
                query = `nid:${existingNoteId}`;
            } else if (targetField) {
                query = `deck:"${settings.ankiDeck}" "${targetField}:${entry.headword}"`;
            } else {
                query = `deck:"${settings.ankiDeck}" "${entry.headword}"`;
            }
            await guiBrowse(url, query);
        } catch(e) { console.error(e); }
    };

    if (status === 'unknown') return null;

    return (
        <>
            <button 
                onClick={status === 'exists' ? handleOpen : handleAddClick}
                disabled={status === 'loading'}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '5px',
                    fontSize: '1.2em', color: status === 'exists' ? '#2ecc71' : 'var(--ocr-accent)',
                    opacity: status === 'loading' ? 0.5 : 1,
                    marginLeft: '10px'
                }}
                title={status === 'exists' ? "Open in Anki" : "Add to Anki"}
            >
                {status === 'exists' ? '📖' : '➕'}
            </button>

            {showCropper && createPortal(
                <CropperModal 
                    imageSrc={dictPopup.context?.imgSrc || ''}
                    spreadData={dictPopup.context?.spreadData}
                    onComplete={(b64) => {
                        setShowCropper(false);
                        addNoteToAnki(b64);
                    }}
                    onCancel={() => setShowCropper(false)}
                    quality={settings.ankiImageQuality || 0.92}
                />,
                document.body
            )}
        </>
    );
}

export const YomitanPopup = () => {
    const { dictPopup, setDictPopup, notifyPopupClosed, settings } = useOCR();
    const popupRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const [posStyle, setPosStyle] = useState<React.CSSProperties>({});

    useLayoutEffect(() => {
        if (!dictPopup.visible) return;
        const viewportW = window.visualViewport?.width || window.innerWidth;
        const viewportH = window.visualViewport?.height || window.innerHeight;
        const { x, y } = dictPopup;

        let finalTop: string | number = y + 20;
        let finalLeft: string | number = Math.min(x, viewportW - 360); 
        const MAX_HEIGHT = 450;

        if (y > viewportH * 0.6) finalTop = Math.max(10, y - MAX_HEIGHT - 10); 

        setPosStyle({ top: finalTop, left: Math.max(10, finalLeft), maxHeight: `${MAX_HEIGHT}px` });
    }, [dictPopup.visible, dictPopup.x, dictPopup.y]);

    useLayoutEffect(() => {
        const el = backdropRef.current;
        if (!el || !dictPopup.visible) return;

        const closePopup = () => {
            notifyPopupClosed();
            setDictPopup(prev => ({ ...prev, visible: false }));
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            closePopup();
        };

        const onClick = (e: MouseEvent) => {
            e.stopPropagation();
            closePopup();
        };

        const onBlock = (e: Event) => e.stopPropagation();

        const opts = { passive: false };

        el.addEventListener('touchstart', onTouchStart, opts);
        el.addEventListener('touchend', onTouchEnd, opts);
        el.addEventListener('click', onClick, opts);
        el.addEventListener('mousedown', onBlock, opts);
        el.addEventListener('contextmenu', onClick, opts);

        return () => {
            el.removeEventListener('touchstart', onTouchStart, opts as any);
            el.removeEventListener('touchend', onTouchEnd, opts as any);
            el.removeEventListener('click', onClick, opts as any);
            el.removeEventListener('mousedown', onBlock, opts as any);
            el.removeEventListener('contextmenu', onClick, opts as any);
        };
    }, [dictPopup.visible, setDictPopup, notifyPopupClosed]);

    if (!dictPopup.visible) return null;

    const popupStyle: React.CSSProperties = {
        position: 'fixed', zIndex: 2147483647, width: '340px', overflowY: 'auto',
        backgroundColor: '#1a1d21', color: '#eee', border: '1px solid #444',
        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        padding: '16px', fontFamily: 'sans-serif', fontSize: '14px', lineHeight: '1.5',
        ...posStyle
    };

    return createPortal(
        <>
            <div 
                ref={backdropRef}
                className="yomitan-backdrop"
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 2147483646, 
                    cursor: 'default',
                    outline: 'none',
                    backgroundColor: 'transparent',
                    touchAction: 'none', 
                }}
            />

            <div 
                ref={popupRef} 
                className="yomitan-popup"
                style={popupStyle} 
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()} 
            >
                {dictPopup.isLoading && <div style={{ textAlign: 'center', padding: '20px', color: '#aaa' }}>Scanning...</div>}

                {!dictPopup.isLoading && dictPopup.results.map((entry, i) => (
                    <div key={i} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: i < dictPopup.results.length - 1 ? '1px solid #333' : 'none' }}>
                        {/* --- HEADER: WORD + TERM TAGS + ANKI BUTTON --- */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '1.8em', lineHeight: '1', marginRight: '10px' }}>
                                    {entry.furigana && entry.furigana.length > 0 ? (
                                        <ruby style={{ rubyPosition: 'over' }}>
                                            {entry.furigana.map((seg, idx) => (
                                                <React.Fragment key={idx}>
                                                    {seg[0]}<rt style={{ fontSize: '0.5em', color: '#aaa' }}>{seg[1]}</rt>
                                                </React.Fragment>
                                            ))}
                                        </ruby>
                                    ) : (
                                        <ruby>
                                            {entry.headword}
                                            <rt style={{ fontSize: '0.5em', color: '#aaa' }}>{entry.reading}</rt>
                                        </ruby>
                                    )}
                                </div>
                                {entry.termTags && entry.termTags.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {entry.termTags.map((tag: any, idx) => {
                                            const label = (typeof tag === 'object' && tag !== null && tag.name) 
                                                ? tag.name 
                                                : tag;
                                                
                                            return (
                                                <span key={idx} style={{ ...tagStyle, backgroundColor: '#666', marginRight: 0 }}>
                                                    {String(label)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            
                            {settings.ankiConnectEnabled && <AnkiButtons entry={entry} />}
                        </div>

                        {/* --- FREQUENCIES --- */}
                        {entry.frequencies && entry.frequencies.length > 0 && (
                            <div style={{ marginBottom: '10px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {entry.frequencies.map((freq, fIdx) => (
                                    <div key={fIdx} style={{ 
                                        display: 'inline-flex', 
                                        fontSize: '0.75em', 
                                        borderRadius: '4px', 
                                        overflow: 'hidden', 
                                        border: '1px solid rgba(255,255,255,0.2)' 
                                    }}>
                                        <div style={{ 
                                            backgroundColor: '#2ecc71', 
                                            color: '#000', 
                                            fontWeight: 'bold', 
                                            padding: '2px 6px' 
                                        }}>
                                            {freq.dictionaryName}
                                        </div>
                                        <div style={{ 
                                            backgroundColor: '#333', 
                                            color: '#eee', 
                                            padding: '2px 6px',
                                            fontWeight: 'bold'
                                        }}>
                                            {freq.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* --- DEFINITIONS --- */}
                        {entry.definitions && (
                            <div>
                                {entry.definitions.map((def, defIdx) => (
                                    <div key={defIdx} style={{ display: 'flex', marginBottom: '12px' }}>
                                        <div style={{ flexShrink: 0, width: '24px', color: '#888', fontWeight: 'bold' }}>
                                            {defIdx + 1}.
                                        </div>
                                        <div style={{ flexGrow: 1 }}>
                                            <div style={{ marginBottom: '4px' }}>
                                                {def.tags?.map((t, ti) => (
                                                    <span key={ti} style={{ ...tagStyle, backgroundColor: '#666' }}>{t}</span>
                                                ))}
                                                <span style={{ ...tagStyle, backgroundColor: '#9b59b6' }}>
                                                    {def.dictionaryName}
                                                </span>
                                            </div>
                                            <div style={{ color: '#ddd' }}>
                                                {def.content.map((jsonString, idx) => (
                                                    <div key={idx} style={{ marginBottom: '2px' }}>
                                                        <StructuredContent contentString={jsonString} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                
                {!dictPopup.isLoading && dictPopup.results.length === 0 && (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#777' }}>No results found</div>
                )}
            </div>
        </>,
        document.body
    );
};
