import React, { useRef, useLayoutEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useOCR } from '@/Mangatan/context/OCRContext';
import { DictionaryResult } from '@/Mangatan/types';

const StructuredContent: React.FC<{ contentString: string }> = ({ contentString }) => {
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

    const tableStyle: React.CSSProperties = { borderCollapse: 'collapse', border: '1px solid #777', margin: '4px 0', fontSize: '0.9em', backgroundColor: '#fff', color: '#000' };
    const cellStyle: React.CSSProperties = { border: '1px solid #777', padding: '2px 8px', textAlign: 'center' };
    const listStyle: React.CSSProperties = { paddingLeft: '20px', margin: '2px 0', listStyleType: 'disc' };

    switch (tag) {
        case 'ul': return <ul style={{ ...s, ...listStyle }}><ContentNode node={content} /></ul>;
        case 'ol': return <ol style={{ ...s, ...listStyle, listStyleType: 'decimal' }}><ContentNode node={content} /></ol>;
        case 'li': return <li style={{ ...s }}><ContentNode node={content} /></li>;
        case 'table': return <table style={{ ...s, ...tableStyle }}><tbody><ContentNode node={content} /></tbody></table>;
        case 'tr': return <tr style={s}><ContentNode node={content} /></tr>;
        case 'th': return <th style={{ ...s, ...cellStyle, backgroundColor: '#eee', fontWeight: 'bold' }}><ContentNode node={content} /></th>;
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

export const YomitanPopup = () => {
    const { dictPopup, setDictPopup, notifyPopupClosed } = useOCR();
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

        // --- CLOSING LOGIC ---
        const closePopup = () => {
            notifyPopupClosed();
            setDictPopup(prev => ({ ...prev, visible: false }));
        };

        // --- MOBILE HANDLERS ---
        // CRITICAL FIX: preventDefault on touchstart kills the browser's 
        // emulation of mousedown/click events. This stops the "Ghost Click"
        // from bubbling up to the Text Box.
        const onTouchStart = (e: TouchEvent) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            closePopup();
        };

        // --- DESKTOP HANDLER ---
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
                    touchAction: 'none', // Prevents scrolling/zooming gestures on backdrop
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
                        <div style={{ fontSize: '1.8em', marginBottom: '8px', lineHeight: '1' }}>
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
