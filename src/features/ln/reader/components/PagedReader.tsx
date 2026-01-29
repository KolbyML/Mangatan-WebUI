import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Settings } from '@/Manatan/types';
import { ReaderNavigationUI } from './ReaderNavigationUI';
import { useReaderCore } from '../hooks/useReaderCore';
import { buildTypographyStyles } from '../utils/styles';
import { handleKeyNavigation, NavigationCallbacks } from '../utils/navigation';
import { PagedReaderProps } from '../types/reader';
import './PagedReader.css';

const COLUMN_GAP = 40;

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

    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [currentSection, setCurrentSection] = useState(initialChapter);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [totalPages, setTotalPages] = useState(1);
    const [contentReady, setContentReady] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const padding = settings.lnPageMargin || 24;
    const contentWidth = dimensions.width - padding * 2;
    const contentHeight = dimensions.height - padding * 2;
    const columnWidth = isVertical ? contentHeight : contentWidth;

    const currentHtml = useMemo(
        () => chapters[currentSection] || '',
        [chapters, currentSection]
    );

    const {
        theme,
        navOptions,
        isReady,
        currentProgress,
        reportScroll,
        reportChapterChange,
        reportPageChange,
        handleContentClick,
        touchHandlers,
        saveNow,
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
    useEffect(() => {
        if (!contentRef.current || contentWidth <= 0) return;

        setContentReady(false);

        const content = contentRef.current;

        // Wait for images to load
        const images = content.querySelectorAll('img');
        const imagePromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 100); // Timeout fallback
            });
        });

        Promise.all(imagePromises).then(() => {
            requestAnimationFrame(() => {
                // Force layout
                void content.offsetHeight;

                const scrollSize = isVertical ? content.scrollHeight : content.scrollWidth;
                const viewportSize = isVertical ? dimensions.height : dimensions.width;

                let calculatedPages = 1;
                if (scrollSize > viewportSize + 5) {
                    const pageWidth = columnWidth + COLUMN_GAP;
                    calculatedPages = Math.max(1, Math.ceil(scrollSize / pageWidth));
                }

                setTotalPages(calculatedPages);
                setContentReady(true);
                setIsTransitioning(false);
            });
        });
    }, [currentHtml, dimensions, contentWidth, columnWidth, isVertical]);

    // Report page changes
    useEffect(() => {
        if (contentReady && !isTransitioning) {
            reportPageChange(currentPage, totalPages);
        }
    }, [currentPage, totalPages, contentReady, isTransitioning, reportPageChange]);

    // Navigation functions
    const goToPage = useCallback(
        (page: number) => {
            const clamped = Math.max(0, Math.min(page, totalPages - 1));
            if (clamped !== currentPage) {
                setCurrentPage(clamped);
            }
        },
        [totalPages, currentPage]
    );

    const goToSection = useCallback(
        (section: number, goToLastPage = false) => {
            const clamped = Math.max(0, Math.min(section, chapters.length - 1));
            if (clamped === currentSection) return;

            setIsTransitioning(true);
            setContentReady(false);
            setCurrentSection(clamped);
            setCurrentPage(goToLastPage ? -1 : 0); // -1 = go to last page once calculated
            reportChapterChange(clamped, goToLastPage ? -1 : 0);
        },
        [chapters.length, currentSection, reportChapterChange]
    );

    // Fix page if going to last page of new chapter
    useEffect(() => {
        if (currentPage === -1 && totalPages > 0 && contentReady) {
            setCurrentPage(totalPages - 1);
        }
    }, [currentPage, totalPages, contentReady]);

    const goNext = useCallback(() => {
        if (currentPage < totalPages - 1) {
            goToPage(currentPage + 1);
        } else if (currentSection < chapters.length - 1) {
            goToSection(currentSection + 1, false);
        }
    }, [currentPage, totalPages, currentSection, chapters.length, goToPage, goToSection]);

    const goPrev = useCallback(() => {
        if (currentPage > 0) {
            goToPage(currentPage - 1);
        } else if (currentSection > 0) {
            goToSection(currentSection - 1, true);
        }
    }, [currentPage, currentSection, goToPage, goToSection]);

    const navCallbacks: NavigationCallbacks = useMemo(
        () => ({
            goNext,
            goPrev,
            goToStart: () => goToPage(0),
            goToEnd: () => goToPage(totalPages - 1),
        }),
        [goNext, goPrev, goToPage, totalPages]
    );

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
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (wheelTimeoutRef.current || isTransitioning) return;

            const delta = isVertical ? e.deltaY : e.deltaX || e.deltaY;
            if (Math.abs(delta) > 20) {
                if (delta > 0) goNext();
                else goPrev();

                wheelTimeoutRef.current = window.setTimeout(() => {
                    wheelTimeoutRef.current = null;
                }, 200);
            }
        };

        wrapper.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            wrapper.removeEventListener('wheel', handleWheel);
            if (wheelTimeoutRef.current) {
                clearTimeout(wheelTimeoutRef.current);
                wheelTimeoutRef.current = null;
            }
        };
    }, [isVertical, goNext, goPrev, isTransitioning]);

    // Touch handlers wrapper
    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (isTransitioning) return;
            touchHandlers.handleTouchEnd(e, navCallbacks);
        },
        [touchHandlers, navCallbacks, isTransitioning]
    );

    // Calculate transform for current page
    const pageOffset = currentPage === -1 ? 0 : currentPage * (columnWidth + COLUMN_GAP);
    const transform = isVertical
        ? `translateY(-${pageOffset}px)`
        : `translateX(-${pageOffset}px)`;

    const typographyStyles = buildTypographyStyles(settings, isVertical);
    const progressPercent = totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;

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
            <div
                className="paged-viewport"
                style={{
                    position: 'absolute',
                    inset: 0,
                    overflow: 'hidden',
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
                        padding: `${padding}px`,
                        columnWidth: `${columnWidth}px`,
                        columnGap: `${COLUMN_GAP}px`,
                        columnFill: 'auto',

                        // Use transform instead of scroll
                        transform: transform,
                        transition: settings.lnDisableAnimations
                            ? 'none'
                            : 'transform 0.3s ease-out',

                        willChange: 'transform',

                        ...(isVertical
                            ? {
                                width: `${dimensions.width}px`,
                                height: 'auto',
                                minHeight: `${dimensions.height}px`,
                            }
                            : {
                                height: `${dimensions.height}px`,
                                width: 'auto',
                                minWidth: `${dimensions.width}px`,
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
                    canGoNext={
                        currentPage < totalPages - 1 ||
                        currentSection < chapters.length - 1
                    }
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