/**
 * Paginated Reader - CSS Columns (Complete with Restoration)
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Settings } from '@/Manatan/types';
import { ReaderNavigationUI } from './ReaderNavigationUI';
import { useReadingProgress, ProgressData } from '../hooks/useReadingProgress';
import { useTextLookup } from '../hooks/useTextLookup';
import {
    getClickZone,
    handleKeyNavigation,
    handleTouchEnd,
    createTouchState,
    NavigationOptions,
    NavigationCallbacks,
    TouchState,
} from '../utils/navigation';
import './PagedReader.css';

const THEMES = {
    light: { bg: '#FFFFFF', fg: '#1a1a1a' },
    sepia: { bg: '#F4ECD8', fg: '#5C4B37' },
    dark: { bg: '#2B2B2B', fg: '#E0E0E0' },
    black: { bg: '#000000', fg: '#CCCCCC' },
} as const;

interface PagedReaderProps {
    chapters: string[];
    settings: Settings;
    onRelocated?: (chapterIndex: number, pageIndex: number, progressData?: ProgressData) => void;
    initialChapter?: number;
    initialPage?: number;
    initialProgress?: { textOffset?: number; totalProgress?: number; sentenceText?: string };
    onToggleUI?: () => void;
    showNavigation?: boolean;
}

const COLUMN_GAP = 40;

export const PagedReader: React.FC<PagedReaderProps> = ({
    chapters,
    settings,
    onRelocated,
    initialChapter = 0,
    initialPage = 0,
    initialProgress,
    onToggleUI,
    showNavigation = false,
}) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<TouchState | null>(null);
    const wheelTimeoutRef = useRef<number | null>(null);
    const hasNavigatedToInitial = useRef(false);
    const isDraggingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });

    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [currentSection, setCurrentSection] = useState(initialChapter);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [isReady, setIsReady] = useState(false);

    const isVertical = settings.lnReadingDirection?.includes('vertical');
    const isRTL = settings.lnReadingDirection === 'vertical-rtl';
    const padding = settings.lnPageMargin || 24;

    const theme = useMemo(() => {
        const key = (settings.lnTheme || 'dark') as keyof typeof THEMES;
        return THEMES[key] || THEMES.dark;
    }, [settings.lnTheme]);

    const navOptions: NavigationOptions = useMemo(() => ({
        isVertical: !!isVertical,
        isRTL: !!isRTL,
        isPaged: true,
    }), [isVertical, isRTL]);

    const contentWidth = dimensions.width - padding * 2;
    const contentHeight = dimensions.height - padding * 2;
    const columnWidth = isVertical ? contentHeight : contentWidth;

    const currentHtml = useMemo(() => {
        return chapters[currentSection] || '';
    }, [chapters, currentSection]);

    const { tryLookup } = useTextLookup();

    // Integrated Progress Tracking
    const { currentProgress, updateProgress } = useReadingProgress({
        chapters,
        currentChapterIndex: currentSection,
        containerRef: scrollRef,
        isVertical: !!isVertical,
        onSaveProgress: (data) => {
            onRelocated?.(data.chapterIndex, currentPage, data);
        }
    });

    // Measure wrapper dimensions
    useEffect(() => {
        const updateDimensions = () => {
            if (wrapperRef.current) {
                const rect = wrapperRef.current.getBoundingClientRect();
                const newDimensions = {
                    width: Math.floor(rect.width),
                    height: Math.floor(rect.height),
                };

                setDimensions(prev => {
                    if (Math.abs(prev.width - newDimensions.width) > 5 ||
                        Math.abs(prev.height - newDimensions.height) > 5) {
                        return newDimensions;
                    }
                    return prev;
                });
            }
        };

        updateDimensions();

        const resizeObserver = new ResizeObserver(updateDimensions);
        if (wrapperRef.current) {
            resizeObserver.observe(wrapperRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Calculate pages when content or dimensions change
    useEffect(() => {
        if (!contentRef.current || !scrollRef.current || contentWidth <= 0) return;

        const timer = setTimeout(() => {
            const content = contentRef.current;
            const scroll = scrollRef.current;
            if (!content || !scroll) return;

            // Force reflow
            void content.offsetHeight;

            const scrollSize = isVertical ? content.scrollHeight : content.scrollWidth;
            const viewportSize = isVertical ? dimensions.height : dimensions.width;

            // If content fits in single page
            if (scrollSize <= viewportSize + 5) {
                setTotalPages(1);
                setIsReady(true);
                return;
            }

            const pageWidth = columnWidth + COLUMN_GAP;
            const calculatedPages = scrollSize / pageWidth;
            const pages = Math.max(1, Math.round(calculatedPages));

            setTotalPages(pages);
            setIsReady(true);
        }, 50);

        return () => clearTimeout(timer);
    }, [currentHtml, dimensions, contentWidth, contentHeight, columnWidth, isVertical, padding]);

    // Recalculate when settings change
    useEffect(() => {
        if (isReady) setIsReady(false);
    }, [
        settings.lnFontSize,
        settings.lnLineHeight,
        settings.lnLetterSpacing,
        settings.lnFontFamily,
        settings.lnPageMargin,
        settings.lnTextAlign,
        settings.lnReadingDirection,
        settings.lnTheme,
        settings.lnEnableFurigana
    ]);

    // Scroll to page
    const scrollToPage = useCallback((page: number, smooth = true) => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        const pageSize = columnWidth + COLUMN_GAP;
        const target = page * pageSize;

        if (isVertical) {
            scroll.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
        } else {
            scroll.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
        }

        setCurrentPage(page);
    }, [columnWidth, isVertical]);

    // Navigate to initial position
    useEffect(() => {
        if (isReady && !hasNavigatedToInitial.current && initialPage !== undefined) {
            hasNavigatedToInitial.current = true;

            const timer = setTimeout(() => {
                if (!contentRef.current || !scrollRef.current) return;
                // Use Page Index
                if (initialPage > 0) {
                    scrollToPage(initialPage, false);
                }
            }, 50);

            return () => clearTimeout(timer);
        }
    }, [isReady, initialPage, scrollToPage, initialProgress]);

    // Reset flag on chapter change
    useEffect(() => {
        if (currentSection !== initialChapter) {
            hasNavigatedToInitial.current = false;
        }
    }, [currentSection, initialChapter]);

    // Track scroll position
    useEffect(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;

        let scrollTimeout: number | undefined;

        const handleScroll = () => {
            // Update sentence-based progress logic
            updateProgress();

            const pageSize = columnWidth + COLUMN_GAP;
            const scrollPos = isVertical ? scrollEl.scrollTop : scrollEl.scrollLeft;
            const page = Math.round(scrollPos / pageSize);

            if (page !== currentPage) {
                setCurrentPage(page);
                onRelocated?.(currentSection, page);
            }
        };

        const debounced = () => {
            if (scrollTimeout) window.clearTimeout(scrollTimeout);
            scrollTimeout = window.setTimeout(handleScroll, 100);
        };

        scrollEl.addEventListener('scroll', debounced, { passive: true });

        return () => {
            scrollEl.removeEventListener('scroll', debounced);
            if (scrollTimeout) window.clearTimeout(scrollTimeout);
        };
    }, [columnWidth, isVertical, currentPage, currentSection, onRelocated, updateProgress]);
    // Navigation functions
    const goToPage = useCallback((page: number) => {
        const clamped = Math.max(0, Math.min(page, totalPages - 1));
        if (clamped !== currentPage) {
            scrollToPage(clamped);
            onRelocated?.(currentSection, clamped);
        }
    }, [totalPages, currentPage, currentSection, scrollToPage, onRelocated]);

    const goToSection = useCallback((section: number, goToLastPage = false) => {
        const clamped = Math.max(0, Math.min(section, chapters.length - 1));
        setCurrentSection(clamped);
        setCurrentPage(0);
        setIsReady(false);
        hasNavigatedToInitial.current = false;

        setTimeout(() => {
            if (goToLastPage && scrollRef.current) {
                const scroll = scrollRef.current;
                const maxScroll = isVertical
                    ? scroll.scrollHeight - scroll.clientHeight
                    : scroll.scrollWidth - scroll.clientWidth;

                if (isVertical) {
                    scroll.scrollTo({ top: maxScroll, behavior: 'auto' });
                } else {
                    scroll.scrollTo({ left: maxScroll, behavior: 'auto' });
                }
            } else {
                scrollToPage(0, false);
            }
        }, 100);

        onRelocated?.(clamped, 0);
    }, [chapters.length, isVertical, scrollToPage, onRelocated]);

    const goNext = useCallback(() => {
        if (currentPage < totalPages - 1) {
            goToPage(currentPage + 1);
        } else if (currentSection < chapters.length - 1) {
            goToSection(currentSection + 1);
        }
    }, [currentPage, totalPages, currentSection, chapters.length, goToPage, goToSection]);

    const goPrev = useCallback(() => {
        if (currentPage > 0) {
            goToPage(currentPage - 1);
        } else if (currentSection > 0) {
            goToSection(currentSection - 1, true);
        }
    }, [currentPage, currentSection, goToPage, goToSection]);

    const navCallbacks: NavigationCallbacks = useMemo(() => ({
        goNext,
        goPrev,
        goToStart: () => goToPage(0),
        goToEnd: () => goToPage(totalPages - 1),
    }), [goNext, goPrev, goToPage, totalPages]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (handleKeyNavigation(e, navOptions, navCallbacks)) {
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navOptions, navCallbacks]);

    // Wheel navigation
    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (wheelTimeoutRef.current) return;

            const delta = isVertical ? e.deltaY : (e.deltaX || e.deltaY);
            if (Math.abs(delta) > 20) {
                if (delta > 0) goNext();
                else goPrev();

                wheelTimeoutRef.current = window.setTimeout(() => {
                    wheelTimeoutRef.current = null;
                }, 200);
            }
        };

        scroll.addEventListener('wheel', handleWheel, { passive: false });
        return () => scroll.removeEventListener('wheel', handleWheel);
    }, [isVertical, goNext, goPrev]);

    // Click handler - only center zone toggles UI
    const handleClick = useCallback(async (e: React.MouseEvent) => {
        if (isDraggingRef.current) return;

        const target = e.target as HTMLElement;
        if (target.closest('a, button, img, ruby rt, .nav-btn, .reader-progress, .reader-slider-wrap')) return;

        const didLookup = await tryLookup(e);
        if (!didLookup) onToggleUI?.();
    }, [onToggleUI, tryLookup]);

    // Touch handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        isDraggingRef.current = false;
        startPosRef.current = { x: e.nativeEvent.touches[0].clientX, y: e.nativeEvent.touches[0].clientY };
        touchStartRef.current = createTouchState(e.nativeEvent);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const dx = Math.abs(e.nativeEvent.touches[0].clientX - startPosRef.current.x);
        const dy = Math.abs(e.nativeEvent.touches[0].clientY - startPosRef.current.y);
        if (dx > 10 || dy > 10) {
            isDraggingRef.current = true;
        }
    }, []);

    const handleTouchEndEvent = useCallback((e: React.TouchEvent) => {
        if (!touchStartRef.current || !scrollRef.current) return;

        const result = handleTouchEnd(e.nativeEvent, touchStartRef.current, navOptions, navCallbacks);
        touchStartRef.current = null;

        if (!result && !isDraggingRef.current) {
            onToggleUI?.();
        }
    }, [navOptions, navCallbacks, onToggleUI]);

    const progressPercent = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

    // Don't render until we have dimensions
    if (dimensions.width === 0 || dimensions.height === 0) {
        return (
            <div
                ref={wrapperRef}
                className="paged-reader-wrapper"
                style={{ backgroundColor: theme.bg }}
            />
        );
    }

    return (
        <div
            ref={wrapperRef}
            className="paged-reader-wrapper"
            style={{ backgroundColor: theme.bg, color: theme.fg }}
        >
            {/* Scroll container */}
            <div
                ref={scrollRef}
                className="paged-scroll"
                style={{
                    overflowX: isVertical ? 'hidden' : 'auto',
                    overflowY: isVertical ? 'auto' : 'hidden',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
                onClick={handleClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEndEvent}
            >
                {/* Content with CSS columns */}
                <div
                    ref={contentRef}
                    className={`paged-content ${!settings.lnEnableFurigana ? 'furigana-hidden' : ''}`}
                    style={{
                        // Typography
                        fontFamily: settings.lnFontFamily || "'Noto Serif JP', serif",
                        fontSize: `${settings.lnFontSize || 18}px`,
                        lineHeight: settings.lnLineHeight || 1.8,
                        letterSpacing: `${settings.lnLetterSpacing || 0}px`,
                        textAlign: (settings.lnTextAlign as any) || 'justify',

                        // Writing mode
                        writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                        textOrientation: isVertical ? 'mixed' : undefined,

                        // Padding
                        padding: `${padding}px`,

                        // CSS Columns
                        columnWidth: `${columnWidth}px`,
                        columnGap: `${COLUMN_GAP}px`,
                        columnFill: 'auto',

                        // Container dimensions
                        ...(isVertical ? {
                            // Vertical: width is fixed (viewport), height expands for columns
                            width: `${dimensions.width}px`,
                            height: 'auto',
                            minHeight: `${dimensions.height}px`,
                        } : {
                            // Horizontal: height is fixed (viewport), width expands for columns  
                            height: `${dimensions.height}px`,
                            width: 'auto',
                            minWidth: `${dimensions.width}px`,
                        }),
                    }}
                    dangerouslySetInnerHTML={{ __html: currentHtml }}
                />
            </div>

            {/* Loading */}
            {!isReady && (
                <div className="paged-loading" style={{ backgroundColor: theme.bg, color: theme.fg }}>
                    <div className="loading-spinner" />
                </div>
            )}

            {/* Navigation UI */}
            {isReady && (
                <ReaderNavigationUI
                    visible={showNavigation}
                    onNext={goNext}
                    onPrev={goPrev}
                    canGoNext={currentPage < totalPages - 1 || currentSection < chapters.length - 1}
                    canGoPrev={currentPage > 0 || currentSection > 0}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    currentChapter={currentSection}
                    totalChapters={chapters.length}
                    progress={progressPercent}
                    totalBookProgress={currentProgress}
                    showSlider={totalPages > 1}
                    onPageChange={goToPage}
                    theme={theme}
                    isVertical={isVertical}
                    mode="paged"
                />
            )}
        </div>
    );
};