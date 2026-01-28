/**
 * Continuous Reader Component
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Settings } from '@/Manatan/types';
import { useChapterLoader } from '../hooks/useChapterLoader';
import { ReaderNavigationUI } from './ReaderNavigationUI';
import { useReadingProgress, ProgressData } from '../hooks/useReadingProgress';
import { useTextLookup } from '../hooks/useTextLookup';
import {
    getClickZone,
    scrollToStart,
    calculateProgress,
    NavigationOptions,
} from '../utils/navigation';
import './ContinuousReader.css';

const THEMES = {
    light: { bg: '#FFFFFF', fg: '#1a1a1a' },
    sepia: { bg: '#F4ECD8', fg: '#5C4B37' },
    dark: { bg: '#2B2B2B', fg: '#E0E0E0' },
    black: { bg: '#000000', fg: '#CCCCCC' },
} as const;

interface ContinuousReaderProps {
    chapters: string[];
    settings: Settings;
    onRelocated?: (chapterIndex: number, pageIndex?: number, progressData?: ProgressData) => void;
    initialChapter?: number;
    initialProgress?: { textOffset?: number; totalProgress?: number; sentenceText?: string };
    onToggleUI?: () => void;
    showNavigation?: boolean;
}

const ChapterBlock: React.FC<{
    html: string | null;
    index: number;
    isLoading: boolean;
    isVertical: boolean;
    settings: Settings;
}> = React.memo(({ html, index, isLoading, isVertical, settings }) => {
    if (isLoading || !html) {
        return (
            <div
                className={`chapter-loading ${isVertical ? 'vertical' : 'horizontal'}`}
                data-chapter={index}
            >
                <div className="loading-spinner" />
                <span>Loading chapter {index + 1}...</span>
            </div>
        );
    }

    return (
        <section
            className={`chapter-block ${isVertical ? 'vertical' : 'horizontal'} ${!settings.lnEnableFurigana ? 'furigana-hidden' : ''}`}
            data-chapter={index}
            style={{
                padding: `${settings.lnPageMargin || 20}px`,
                maxWidth: !isVertical ? `${settings.lnPageWidth || 800}px` : undefined,
                textAlign: (settings.lnTextAlign as any) || 'justify',
            }}
        >
            <div
                className="chapter-content"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </section>
    );
});
ChapterBlock.displayName = 'ChapterBlock';

export const ContinuousReader: React.FC<ContinuousReaderProps> = ({
    chapters,
    settings,
    onRelocated,
    initialChapter = 0,
    initialProgress,
    onToggleUI,
    showNavigation = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const hasScrolledToInitial = useRef(false);
    const lastReportedChapter = useRef(initialChapter);
    const isUserScrolling = useRef(false);
    const isDraggingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });

    const [currentChapter, setCurrentChapter] = useState(initialChapter);
    const [scrollProgress, setScrollProgress] = useState(0);

    const isVertical = settings.lnReadingDirection?.includes('vertical');
    const isRTL = settings.lnReadingDirection === 'vertical-rtl';

    const theme = useMemo(() => {
        const key = (settings.lnTheme || 'dark') as keyof typeof THEMES;
        return THEMES[key] || THEMES.dark;
    }, [settings.lnTheme]);

    const navOptions: NavigationOptions = useMemo(() => ({
        isVertical: !!isVertical,
        isRTL: !!isRTL,
        isPaged: false,
    }), [isVertical, isRTL]);

    const { tryLookup } = useTextLookup();

    const {
        loadChaptersAround,
        getChapterHtml,
        loadingState,
    } = useChapterLoader({
        chapters,
        preloadCount: 3,
    });

    const { currentProgress, updateProgress } = useReadingProgress({
        chapters,
        currentChapterIndex: currentChapter,
        containerRef,
        isVertical: !!isVertical,
        onSaveProgress: (data) => {
            onRelocated?.(data.chapterIndex, undefined, data);
        }
    });

    useEffect(() => {
        loadChaptersAround(initialChapter);
    }, []);

    // Restoration Logic
    useEffect(() => {
        if (hasScrolledToInitial.current || !containerRef.current || !contentRef.current) return;

        const timer = setTimeout(() => {
            if (!containerRef.current || !contentRef.current) return;
            if (hasScrolledToInitial.current) return;

            hasScrolledToInitial.current = true;
            const container = containerRef.current;

            // 1. Try to restore by sentence text
            if (initialProgress?.sentenceText) {
                const chapterEl = contentRef.current.querySelector(`[data-chapter="${initialChapter}"]`);
                if (chapterEl) {
                    const walker = document.createTreeWalker(chapterEl, NodeFilter.SHOW_TEXT);
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent && node.textContent.includes(initialProgress.sentenceText)) {
                            const range = document.createRange();
                            range.selectNode(node);
                            const rect = range.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();

                            if (isVertical) {
                                // Vertical: Scroll X
                                const targetX = rect.left - containerRect.left + container.scrollLeft;
                                container.scrollLeft = targetX - (containerRect.width / 2);
                            } else {
                                // Horizontal: Scroll Y
                                const targetY = rect.top - containerRect.top + container.scrollTop;
                                container.scrollTop = targetY - (containerRect.height / 4);
                            }
                            console.log('[ContinuousReader] Restored position via sentence:', initialProgress.sentenceText);
                            return;
                        }
                    }
                }
            }

            // 2. Fallback to chapter start
            if (initialChapter > 0) {
                const chapter = contentRef.current.querySelector(`[data-chapter="${initialChapter}"]`);
                if (chapter) {
                    chapter.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' });
                }
            } else {
                scrollToStart(container, navOptions);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [initialChapter, navOptions, isVertical, isRTL, initialProgress]);

    // Smooth scroll
    const scrollSmall = useCallback((forward: boolean) => {
        const container = containerRef.current;
        if (!container) return;
        const amount = 100;
        if (isVertical) {
            const delta = forward ? (isRTL ? -amount : amount) : (isRTL ? amount : -amount);
            container.scrollBy({ left: delta, behavior: 'smooth' });
        } else {
            container.scrollBy({ top: forward ? amount : -amount, behavior: 'smooth' });
        }
    }, [isVertical, isRTL]);

    // Scroll handler
    useEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return;

        let rafId: number;
        let debounceTimer: number;

        const findCurrentChapter = (): number => {
            const chapterElements = content.querySelectorAll('[data-chapter]');
            const containerRect = container.getBoundingClientRect();
            let bestChapter = 0;
            let bestScore = -Infinity;
            const viewportCenter = isVertical
                ? containerRect.left + containerRect.width / 2
                : containerRect.top + containerRect.height / 2;

            chapterElements.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const chapterIndex = parseInt(el.getAttribute('data-chapter') || '0', 10);
                const isVisible = isVertical
                    ? (rect.right > containerRect.left && rect.left < containerRect.right)
                    : (rect.bottom > containerRect.top && rect.top < containerRect.bottom);
                if (!isVisible) return;
                const chapterCenter = isVertical ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
                const distance = Math.abs(viewportCenter - chapterCenter);
                const score = -distance;
                if (score > bestScore) {
                    bestScore = score;
                    bestChapter = chapterIndex;
                }
            });
            return bestChapter;
        };

        const handleScroll = () => {
            isUserScrolling.current = true;
            updateProgress();

            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const progress = calculateProgress(container, navOptions);
                setScrollProgress(progress);
            });

            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => {
                const chapter = findCurrentChapter();
                if (chapter !== lastReportedChapter.current) {
                    lastReportedChapter.current = chapter;
                    setCurrentChapter(chapter);

                    onRelocated?.(chapter);

                    loadChaptersAround(chapter);
                }

                isUserScrolling.current = false;
            }, 200);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', handleScroll);
            cancelAnimationFrame(rafId);
            clearTimeout(debounceTimer);
        };
    }, [navOptions, isVertical, onRelocated, loadChaptersAround, updateProgress, currentProgress]);

    const handleClick = useCallback(async (e: React.MouseEvent) => {
        if (isDraggingRef.current) return;

        const target = e.target as HTMLElement;
        if (target.closest('a, button, img, ruby rt, .nav-btn, .reader-progress, .reader-slider-wrap')) return;

        const didLookup = await tryLookup(e);
        if (!didLookup) onToggleUI?.();
    }, [onToggleUI, tryLookup]);

    const handlePointerDown = (e: React.PointerEvent) => {
        isDraggingRef.current = false;
        startPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) {
            const dx = Math.abs(e.clientX - startPosRef.current.x);
            const dy = Math.abs(e.clientY - startPosRef.current.y);
            if (dx > 10 || dy > 10) {
                isDraggingRef.current = true;
            }
        }
    };

    return (
        <div className={`continuous-reader-wrapper ${isRTL ? 'rtl-mode' : 'ltr-mode'}`} style={{ backgroundColor: theme.bg, color: theme.fg, direction: isRTL ? 'rtl' : 'ltr' }}>
            <div ref={containerRef} className={`continuous-reader-container ${isVertical ? 'vertical' : 'horizontal'}`} style={{
                fontFamily: settings.lnFontFamily || "'Noto Serif JP', serif",
                fontSize: `${settings.lnFontSize || 18}px`,
                lineHeight: settings.lnLineHeight || 1.8,
                letterSpacing: `${settings.lnLetterSpacing || 0}px`,
                direction: isVertical ? (isRTL ? 'rtl' : 'ltr') : 'ltr',
            }}
                onClick={handleClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
            >
                <div ref={contentRef} className={`continuous-content ${isVertical ? 'vertical' : 'horizontal'} ${!settings.lnEnableFurigana ? 'furigana-hidden' : ''}`} style={{
                    writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                    textOrientation: isVertical ? 'mixed' : undefined,
                    direction: 'ltr',
                }}>
                    {chapters.map((_, index) => (
                        <ChapterBlock key={index} html={getChapterHtml(index)} index={index} isLoading={loadingState.get(index) || false} isVertical={!!isVertical} settings={settings} />
                    ))}
                </div>
            </div>
            <ReaderNavigationUI
                visible={showNavigation}
                onNext={() => scrollSmall(true)}
                onPrev={() => scrollSmall(false)}
                canGoNext={scrollProgress < 100}
                canGoPrev={scrollProgress > 0}
                currentChapter={currentChapter}
                totalChapters={chapters.length}
                progress={scrollProgress}
                totalBookProgress={currentProgress}
                theme={theme}
                isVertical={isVertical}
                mode="continuous"
            />
        </div>
    );
};