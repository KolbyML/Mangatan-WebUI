import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Settings } from '@/Manatan/types';
import { ReaderNavigationUI } from './ReaderNavigationUI';
import { useReaderCore } from '../hooks/useReaderCore';
import { buildTypographyStyles } from '../utils/styles';
import { handleKeyNavigation, NavigationCallbacks } from '../utils/navigation';
import { PagedReaderProps } from '../types/reader';
import './PagedReader.css';

export const PagedReader: React.FC<PagedReaderProps> = ({
    bookId,
    chapters,
    stats,
    settings,
    isVertical,
    isRTL,
    initialChapter = 0,
    initialPage = 0,
    initialProgress,
    onToggleUI,
    showNavigation = false,
    onPositionUpdate,
    onRegisterSave,
}) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const wheelTimeoutRef = useRef<number | null>(null);

    // --- State ---
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [currentSection, setCurrentSection] = useState(initialChapter);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const [contentReady, setContentReady] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // --- 1. UNIFIED CALCULATION SOURCE ---
    const layout = useMemo(() => {
        // Safe defaults if dimensions aren't ready
        if (dimensions.width === 0 || dimensions.height === 0) return null;

        const gap = 80; // Large safety gap
        const padding = settings.lnPageMargin || 24;

        // Content Area dimensions
        const contentW = dimensions.width - (padding * 2);
        const contentH = dimensions.height - (padding * 2);

        const columnWidth = isVertical ? contentH : contentW;

        const pageSize = columnWidth + gap;

        return {
            gap,
            padding,
            width: dimensions.width,
            height: dimensions.height,
            contentW,
            contentH,
            columnWidth,
            pageSize
        };
    }, [dimensions, settings.lnPageMargin, isVertical]);

    const currentHtml = useMemo(
        () => chapters[currentSection] || '',
        [chapters, currentSection]
    );

    const typographyStyles = useMemo(() =>
        buildTypographyStyles(settings, isVertical),
        [settings, isVertical]);

    const {
        theme,
        navOptions,
        currentProgress,
        reportChapterChange,
        reportPageChange,
        handleContentClick,
        touchHandlers,
    } = useReaderCore({
        bookId,
        chapters,
        stats,
        settings,
        containerRef: wrapperRef,
        isVertical,
        isRTL,
        isPaged: true,
        currentChapter: currentSection,
        currentPage,
        totalPages,
        initialProgress,
        onToggleUI,
        onPositionUpdate,
        onRegisterSave,
    });

    // Update dimensions
    // --- Resize Observer ---
    useEffect(() => {
        const updateDimensions = () => {
            if (wrapperRef.current) {
                const rect = wrapperRef.current.getBoundingClientRect();
                setDimensions({
                    width: Math.floor(rect.width),
                    height: Math.floor(rect.height),
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

    // Calculate total pages
    const navigationIntentRef = useRef<{ goToLastPage: boolean } | null>(null);

    // --- Page Calculation Logic ---
    useEffect(() => {
        if (!contentRef.current || !layout) return;

        setContentReady(false);

        const content = contentRef.current;
        const images = content.querySelectorAll('img');

        const imagePromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 50);
            });
        });

        Promise.all(imagePromises).then(() => {
            requestAnimationFrame(() => {
                // Force Reflow
                void content.offsetHeight;

                const scrollSize = isVertical ? content.scrollHeight : content.scrollWidth;
                const viewportSize = isVertical ? layout.height : layout.width;

                let calculatedPages = 1;

                // Use layout.pageSize for uniform calculation
                if (scrollSize > viewportSize + 2) {
                    calculatedPages = Math.max(1, Math.ceil(scrollSize / layout.pageSize));
                }

                setTotalPages(calculatedPages);

                const intent = navigationIntentRef.current;
                navigationIntentRef.current = null;

                if (intent?.goToLastPage) {
                    setCurrentPage(calculatedPages - 1);
                } else {
                    setCurrentPage(p => Math.min(p, calculatedPages - 1));
                }

                requestAnimationFrame(() => {
                    setIsTransitioning(false);
                    setContentReady(true);
                });
            });
        });
    }, [currentHtml, layout, isVertical, typographyStyles, settings]);

    // --- Reporting ---
    useEffect(() => {
        if (contentReady && !isTransitioning) {
            reportPageChange(currentPage, totalPages);
        }
    }, [currentPage, totalPages, contentReady, isTransitioning, reportPageChange]);

    // --- Navigation ---
    const goToPage = useCallback((page: number) => {
        const clamped = Math.max(0, Math.min(page, totalPages - 1));
        if (clamped !== currentPage) setCurrentPage(clamped);
    }, [totalPages, currentPage]);

    const goToSection = useCallback((section: number, goToLastPage = false) => {
        const clamped = Math.max(0, Math.min(section, chapters.length - 1));
        if (clamped === currentSection) return;

        setIsTransitioning(true);
        setContentReady(false);
        navigationIntentRef.current = { goToLastPage };
        setCurrentSection(clamped);
        setCurrentPage(0);
        reportChapterChange(clamped, goToLastPage ? -1 : 0);
    }, [chapters.length, currentSection, reportChapterChange]);

    const goNext = useCallback(() => {
        if (!contentReady || isTransitioning) return;
        if (currentPage < totalPages - 1) {
            goToPage(currentPage + 1);
        } else if (currentSection < chapters.length - 1) {
            goToSection(currentSection + 1, false);
        }
    }, [currentPage, totalPages, currentSection, chapters.length, goToPage, goToSection, contentReady, isTransitioning]);

    const goPrev = useCallback(() => {
        if (!contentReady || isTransitioning) return;
        if (currentPage > 0) {
            goToPage(currentPage - 1);
        } else if (currentSection > 0) {
            goToSection(currentSection - 1, true);
        }
    }, [currentPage, currentSection, goToPage, goToSection, contentReady, isTransitioning]);

    // Keyboard navigation
    const navCallbacks: NavigationCallbacks = useMemo(() => ({
        goNext,
        goPrev,
        goToStart: () => goToPage(0),
        goToEnd: () => goToPage(totalPages - 1),
    }), [goNext, goPrev, goToPage, totalPages]);

    // --- Inputs ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            if (!contentReady || isTransitioning) return;
            if (handleKeyNavigation(e, navOptions, navCallbacks)) e.preventDefault();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navOptions, navCallbacks, contentReady, isTransitioning]);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (wheelTimeoutRef.current || isTransitioning || !contentReady) return;
            const delta = isVertical ? e.deltaY : e.deltaX || e.deltaY;
            if (Math.abs(delta) > 20) {
                if (delta > 0) goNext();
                else goPrev();
                wheelTimeoutRef.current = window.setTimeout(() => wheelTimeoutRef.current = null, 200);
            }
        };
        wrapper.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            wrapper.removeEventListener('wheel', handleWheel);
            if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        };
    }, [isVertical, goNext, goPrev, isTransitioning, contentReady]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (isTransitioning || !contentReady) return;
        touchHandlers.handleTouchEnd(e, navCallbacks);
    }, [touchHandlers, navCallbacks, isTransitioning, contentReady]);

    // --- Early Return ---
    if (!layout) {
        return <div ref={wrapperRef} className="paged-reader-wrapper" style={{ backgroundColor: theme.bg }} />;
    }

    // --- Render Logic ---
    const pageOffset = currentPage === -1 ? 0 : Math.round(currentPage * layout.pageSize);

    const transform = isVertical
        ? `translateY(-${pageOffset}px)`
        : `translateX(-${pageOffset}px)`;

    const progressPercent = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

    return (
        <div
            ref={wrapperRef}
            className="paged-reader-wrapper"
            style={{ backgroundColor: theme.bg, color: theme.fg }}
        >
            <style>{`
                .paged-content img {
                    max-width: 100%;
                    height: auto;
                    display: block;
                }
            `}</style>

            <div
                className="paged-viewport"
                style={{
                    position: 'absolute',
                    inset: 0,
                    overflow: 'hidden',
                    // Clip path ensures strict cutting of overflow (no leftover text from prev page)
                    clipPath: 'inset(0px)',
                }}
                onClick={handleContentClick}
                onPointerDown={touchHandlers.handlePointerDown}
                onPointerMove={touchHandlers.handlePointerMove}
                onTouchStart={touchHandlers.handleTouchStart}
                onTouchMove={touchHandlers.handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div
                    ref={contentRef}
                    className={`paged-content ${!settings.lnEnableFurigana ? 'furigana-hidden' : ''}`}
                    style={{
                        ...typographyStyles,

                        padding: `${layout.padding}px`,
                        columnWidth: `${layout.columnWidth}px`,
                        columnGap: `${layout.gap}px`,
                        columnRule: `${layout.gap}px solid ${theme.bg}`,
                        columnFill: 'auto',

                        boxSizing: 'border-box',
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',

                        transform: transform,
                        transition: settings.lnDisableAnimations
                            ? 'none'
                            : 'transform 0.3s ease-out',
                        willChange: 'transform',

                        ...(isVertical
                            ? {
                                width: `${layout.width}px`,
                                height: 'auto',
                                minHeight: `${layout.height}px`,
                            }
                            : {
                                height: `${layout.height}px`,
                                width: 'auto',
                                minWidth: `${layout.width}px`,
                            }),
                    }}
                    dangerouslySetInnerHTML={{ __html: currentHtml }}
                />
            </div>

            {(!contentReady || isTransitioning) && (
                <div
                    className="paged-loading"
                    style={{ backgroundColor: theme.bg, color: theme.fg }}
                >
                    <div className="loading-spinner" />
                </div>
            )}

            {contentReady && (
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