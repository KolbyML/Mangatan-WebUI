

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Settings } from '@/Manatan/types';
import { ReaderNavigationUI } from './ReaderNavigationUI';
import { useReaderCore } from '../hooks/useReaderCore';
import { buildTypographyStyles } from '../utils/styles';
import { handleKeyNavigation, NavigationCallbacks } from '../utils/navigation';
import { PagedReaderProps } from '../types/reader';
import { BookStats } from '@/lib/storage/AppStorage';
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
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const wheelTimeoutRef = useRef<number | null>(null);
    const hasRestoredRef = useRef(false);


    const pendingNavigationRef = useRef<{
        targetSection: number;
        goToLastPage: boolean;
    } | null>(null);

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
        containerRef: scrollRef,
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


    useEffect(() => {
        if (!contentRef.current || !scrollRef.current || contentWidth <= 0) return;

        const timer = setTimeout(() => {
            const content = contentRef.current;
            const scroll = scrollRef.current;
            if (!content || !scroll) return;

            void content.offsetHeight;

            const scrollSize = isVertical ? content.scrollHeight : content.scrollWidth;
            const viewportSize = isVertical ? dimensions.height : dimensions.width;

            let calculatedPages = 1;
            if (scrollSize > viewportSize + 5) {
                const pageWidth = columnWidth + COLUMN_GAP;
                calculatedPages = Math.max(1, Math.round(scrollSize / pageWidth));
            }

            setTotalPages(calculatedPages);


            if (pendingNavigationRef.current) {
                const { goToLastPage } = pendingNavigationRef.current;
                pendingNavigationRef.current = null;

                if (goToLastPage) {
                    const lastPage = calculatedPages - 1;
                    const pageSize = columnWidth + COLUMN_GAP;
                    const targetScroll = lastPage * pageSize;

                    if (isVertical) {
                        scroll.scrollTop = targetScroll;
                    } else {
                        scroll.scrollLeft = targetScroll;
                    }

                    setCurrentPage(lastPage);

                    requestAnimationFrame(() => {
                        setIsTransitioning(false);
                        setContentReady(true);
                    });
                } else {
                    if (isVertical) {
                        scroll.scrollTop = 0;
                    } else {
                        scroll.scrollLeft = 0;
                    }
                    setCurrentPage(0);

                    requestAnimationFrame(() => {
                        setIsTransitioning(false);
                        setContentReady(true);
                    });
                }
            } else {
                setContentReady(true);
            }
        }, 30);

        return () => clearTimeout(timer);
    }, [currentHtml, dimensions, contentWidth, columnWidth, isVertical]);


    useEffect(() => {
        if (!contentReady || hasRestoredRef.current || isTransitioning) return;

        hasRestoredRef.current = true;

        if (initialPage > 0 && initialPage < totalPages) {
            const scroll = scrollRef.current;
            if (scroll) {
                const pageSize = columnWidth + COLUMN_GAP;
                const targetScroll = initialPage * pageSize;

                if (isVertical) {
                    scroll.scrollTop = targetScroll;
                } else {
                    scroll.scrollLeft = targetScroll;
                }
                setCurrentPage(initialPage);
            }
        }
    }, [contentReady, totalPages, initialPage, columnWidth, isVertical, isTransitioning]);


    const scrollToPage = useCallback(
        (page: number, smooth = true) => {
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
        },
        [columnWidth, isVertical]
    );


    useEffect(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl || isTransitioning) return;

        let scrollTimeout: number | undefined;

        const handleScroll = () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);

            scrollTimeout = window.setTimeout(() => {
                const pageSize = columnWidth + COLUMN_GAP;
                const scrollPos = isVertical ? scrollEl.scrollTop : scrollEl.scrollLeft;
                const page = Math.round(scrollPos / pageSize);

                if (page !== currentPage) {
                    setCurrentPage(page);
                }

                reportPageChange(page, totalPages);
            }, 100);
        };

        scrollEl.addEventListener('scroll', handleScroll, { passive: true });

        const initialTimer = setTimeout(() => {
            reportPageChange(currentPage, totalPages);
        }, 200);

        return () => {
            scrollEl.removeEventListener('scroll', handleScroll);
            if (scrollTimeout) clearTimeout(scrollTimeout);
            clearTimeout(initialTimer);
        };
    }, [columnWidth, isVertical, currentPage, totalPages, reportPageChange, isTransitioning]);


    const goToPage = useCallback(
        (page: number) => {
            const clamped = Math.max(0, Math.min(page, totalPages - 1));
            if (clamped !== currentPage) {
                scrollToPage(clamped);
                reportPageChange(clamped, totalPages);
            }
        },
        [totalPages, currentPage, scrollToPage, reportPageChange]
    );

    const goToSection = useCallback(
        (section: number, goToLastPage = false) => {
            const clamped = Math.max(0, Math.min(section, chapters.length - 1));
            if (clamped === currentSection) return;

            setIsTransitioning(true);
            pendingNavigationRef.current = {
                targetSection: clamped,
                goToLastPage,
            };

            setTimeout(() => {
                hasRestoredRef.current = true;
                setCurrentSection(clamped);
                setContentReady(false);
                reportChapterChange(clamped, goToLastPage ? -1 : 0);
            }, 50);
        },
        [chapters.length, currentSection, reportChapterChange]
    );

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


    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

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

        scroll.addEventListener('wheel', handleWheel, { passive: false });
        return () => scroll.removeEventListener('wheel', handleWheel);
    }, [isVertical, goNext, goPrev, isTransitioning]);


    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (isTransitioning) return;
            touchHandlers.handleTouchEnd(e, navCallbacks);
        },
        [touchHandlers, navCallbacks, isTransitioning]
    );


    if (dimensions.width === 0 || dimensions.height === 0) {

        return (
            <div
                ref={wrapperRef}
                className="paged-reader-wrapper"
                style={{ backgroundColor: theme.bg }}
            />
        );
    }

    const progressPercent =
        totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0;
    const typographyStyles = buildTypographyStyles(settings, isVertical);


    const contentOpacity = isTransitioning ? 0 : 1;

    return (
        <div
            ref={wrapperRef}
            className="paged-reader-wrapper"
            style={{ backgroundColor: theme.bg, color: theme.fg }}
        >
            <div
                ref={scrollRef}
                className="paged-scroll"
                style={{
                    overflowX: isVertical ? 'hidden' : 'auto',
                    overflowY: isVertical ? 'auto' : 'hidden',
                    scrollbarWidth: 'none',

                    opacity: contentOpacity,
                    transition: 'opacity 0.1s ease-out',
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
                    className={`paged-content ${!settings.lnEnableFurigana ? 'furigana-hidden' : ''
                        }`}
                    style={{
                        ...typographyStyles,
                        padding: `${padding}px`,
                        columnWidth: `${columnWidth}px`,
                        columnGap: `${COLUMN_GAP}px`,
                        columnFill: 'auto',
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


            {!contentReady && !isTransitioning && (
                <div
                    className="paged-loading"
                    style={{ backgroundColor: theme.bg, color: theme.fg }}
                >
                    <div className="loading-spinner" />
                </div>
            )}


            {(contentReady || isTransitioning) && (
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