/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { memo, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch"; 
import {
    IReaderSettings,
    ReaderPagerProps,
    ReaderPageSpreadState,
    ReaderResumeMode,
    ReaderStatePages,
    ReaderTransitionPageMode,
    ReadingDirection,
    ReadingMode,
} from '@/features/reader/Reader.types.ts';
import { getDoublePageModePages } from '@/features/reader/viewer/pager/ReaderPager.utils.tsx';
import { ReaderControls } from '@/features/reader/services/ReaderControls.ts';
import {
    getPagerForReadingMode,
    isContinuousReadingMode,
    isContinuousVerticalReadingMode,
    shouldApplyReaderWidth,
} from '@/features/reader/settings/ReaderSettings.utils.tsx';
import { createHandleReaderPageLoadError, createUpdateReaderPageLoadState } from '@/features/reader/Reader.utils.ts';
import { useReaderConvertPagesForReadingMode } from '@/features/reader/viewer/hooks/useReaderConvertPagesForReadingMode.ts';
import { ReaderTransitionPage } from '@/features/reader/viewer/components/ReaderTransitionPage.tsx';
import { applyStyles } from '@/base/utils/ApplyStyles.ts';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { useReaderSetPagesState } from '@/features/reader/viewer/hooks/useReaderSetPagesState.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { getErrorMessage, noOp } from '@/lib/HelperFunctions.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { ReaderInfiniteScrollUpdateChapter } from '@/features/reader/infinite-scroll/ReaderInfiniteScrollUpdateChapter.tsx';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { ChapterIdInfo } from '@/features/chapter/Chapter.types.ts';

import { READER_DEFAULT_PAGES_STATE } from '@/features/reader/stores/ReaderPagesStore.ts';
import { getReaderChaptersStore } from '@/features/reader/stores/ReaderStore.ts';

const BaseReaderChapterViewer = ({
    currentPageIndex,
    setPages: setContextPages,
    setPageLoadStates: setContextPageLoadStates,
    setTotalPages: setContextTotalPages,
    setCurrentPageIndex: setContextCurrentPageIndex,
    updateCurrentPageIndex,
    setPageToScrollToIndex,
    transitionPageMode,
    retryFailedPagesKeyPrefix,
    setTransitionPageMode,
    readingMode,
    readerWidth,
    pageScaleMode,
    shouldOffsetDoubleSpreads,
    readingDirection,
    imagePreLoadAmount,
    pageGap,
    chapterId,
    previousChapterId,
    nextChapterId,
    isPreviousChapterVisible,
    isNextChapterVisible,
    lastPageRead,
    isInitialChapter,
    isCurrentChapter,
    isPreviousChapter,
    isNextChapter,
    isLeadingChapter,
    isTrailingChapter,
    isPreloadMode,
    imageRefs: globalImageRefs,
    scrollIntoView,
    resumeMode,
    customFilter,
    shouldStretchPage,
    readerNavBarWidth,
    onSizeChange,
    minWidth,
    minHeight,
    scrollElement,
}: Pick<
    ReaderStatePages,
    | 'currentPageIndex'
    | 'setPages'
    | 'setPageLoadStates'
    | 'setTotalPages'
    | 'setCurrentPageIndex'
    | 'setPageToScrollToIndex'
    | 'transitionPageMode'
    | 'retryFailedPagesKeyPrefix'
    | 'setTransitionPageMode'
> &
    Omit<ReaderPagerProps, 'pages' | 'totalPages' | 'pageLoadStates' | 'handleAsInitialRender' | 'resumeMode'> &
    Pick<
        IReaderSettings,
        'readingMode' | 'shouldOffsetDoubleSpreads' | 'readingDirection' | 'readerWidth' | 'pageScaleMode'
    > & {
        updateCurrentPageIndex: ReturnType<typeof ReaderControls.useUpdateCurrentPageIndex>;
        chapterId: ChapterIdInfo['id'];
        previousChapterId?: ChapterIdInfo['id'];
        nextChapterId?: ChapterIdInfo['id'];
        isPreviousChapterVisible: boolean;
        isNextChapterVisible: boolean;
        lastPageRead: number;
        isInitialChapter: boolean;
        isCurrentChapter: boolean;
        isPreviousChapter: boolean;
        isNextChapter: boolean;
        isLeadingChapter: boolean;
        isTrailingChapter: boolean;
        imageRefs: MutableRefObject<(HTMLElement | null)[]>;
        scrollIntoView: boolean;
        resumeMode: ReaderResumeMode;
        onSizeChange: (width: number, height: number, chapterId: ChapterIdInfo['id']) => void;
        minWidth: number;
        minHeight: number;
        scrollElement: HTMLElement | null;
    }) => {
    const { t } = useTranslation();
    const { direction: themeDirection } = useTheme();

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // --- ZOOM STATE ---
    const [scale, setScale] = useState(1);
    const zoomRef = useRef<ReactZoomPanPinchRef | null>(null);

    const onInteractionStart = () => {
        if (isMobile) document.body.classList.add('ocr-interaction');
    };
    const onInteractionStop = () => {
        if (isMobile) {
            document.body.classList.remove('ocr-interaction');
            window.dispatchEvent(new Event('resize')); 
        }
    };

    const isScaleChanged = Math.abs(scale - 1) > 0.01;

    // Manual Input Listener (from TextBox dragging)
    useEffect(() => {
        if (!isMobile) return;
        const handleManualMove = (e: Event) => {
            const { dx, dy } = (e as CustomEvent).detail;
            if (isScaleChanged && zoomRef.current) {
                const { state, instance } = zoomRef.current;
                const newX = state.positionX - dx; 
                const newY = state.positionY - dy;
                instance.setTransformState(state.scale, newX, newY);
            }
        };
        window.addEventListener('ocr-input-move', handleManualMove);
        return () => window.removeEventListener('ocr-input-move', handleManualMove);
    }, [isMobile, isScaleChanged]);

    const [fetchPages, pagesResponse] = requestManager.useGetChapterPagesFetch(chapterId ?? -1);
    const [arePagesFetched, setArePagesFetched] = useState(false);
    const [totalPages, setTotalPages] = useState<ReaderStatePages['totalPages']>(READER_DEFAULT_PAGES_STATE.totalPages);
    const [pageUrls, setPageUrls] = useState<ReaderStatePages['pageUrls']>(READER_DEFAULT_PAGES_STATE.pageUrls);
    const [pages, setPages] = useState<ReaderStatePages['pages']>(READER_DEFAULT_PAGES_STATE.pages);
    const [pageLoadStates, setPageLoadStates] = useState<ReaderStatePages['pageLoadStates']>(
        READER_DEFAULT_PAGES_STATE.pageLoadStates,
    );
    const [pagesToSpreadState, setPagesToSpreadState] = useState<ReaderPageSpreadState[]>(
        pageLoadStates.map(({ url }) => ({ url, isSpread: false })),
    );

    const ref = useRef<HTMLDivElement>(null);
    const isCurrentChapterRef = useRef(isCurrentChapter);
    const imageRefs = useRef<(HTMLElement | null)[]>(pages.map(() => null));
    const pagerRef = useRef<HTMLDivElement>(null);

    const actualPages = useMemo(() => {
        const arePagesLoaded = !!totalPages;
        if (!arePagesLoaded) return pages;
        const isSpreadStateUpdated = totalPages === pagesToSpreadState.length;
        if (!isSpreadStateUpdated) return pages;
        if (readingMode === ReadingMode.DOUBLE_PAGE) {
            return getDoublePageModePages(pageUrls, pagesToSpreadState, shouldOffsetDoubleSpreads, readingDirection);
        }
        return pages;
    }, [pagesToSpreadState, readingMode, shouldOffsetDoubleSpreads, readingDirection, totalPages]);

    const Pager = useMemo(() => getPagerForReadingMode(readingMode), [readingMode]);
    const isLtrReadingDirection = readingDirection === ReadingDirection.LTR;
    const isContinuousReadingModeActive = isContinuousReadingMode(readingMode);
    const shouldHideChapter = (!isContinuousReadingModeActive && !isCurrentChapter) || isPreloadMode;

    const isCurrentChapterInSinglePager = !isContinuousReadingModeActive && isCurrentChapter;
    const showPreviousTransitionPage =
        !shouldHideChapter &&
        (isCurrentChapterInSinglePager || (isContinuousReadingModeActive && (isInitialChapter || isLeadingChapter)));
    const showNextTransitionPage =
        !shouldHideChapter &&
        (isCurrentChapterInSinglePager || (isContinuousReadingModeActive && (isInitialChapter || isTrailingChapter)));

    isCurrentChapterRef.current = isCurrentChapter;
    if (isCurrentChapter) {
        // eslint-disable-next-line no-param-reassign
        globalImageRefs.current = imageRefs.current;
    }

    const doFetchPages = useCallback(() => {
        if (!chapterId) return;
        setArePagesFetched(false);
        fetchPages({ variables: { input: { chapterId } } }).catch(
            defaultPromiseErrorHandler(`ReaderChapterViewer(${chapterId})::fetchPages`),
        );
    }, [fetchPages, chapterId]);

    const onLoad = useMemo(
        () =>
            createUpdateReaderPageLoadState(
                actualPages,
                setPagesToSpreadState,
                (value) => {
                    if (isCurrentChapterRef.current) setContextPageLoadStates(value);
                    setPageLoadStates(value);
                },
                readingMode,
            ),
        [actualPages, readingMode],
    );

    const onError = useMemo(
        () =>
            createHandleReaderPageLoadError((value) => {
                if (isCurrentChapterRef.current) setContextPageLoadStates(value);
                setPageLoadStates(value);
            }),
        [],
    );

    useEffect(() => {
        doFetchPages();
    }, [chapterId]);

    useResizeObserver(
        ref,
        useCallback(
            (entries) => {
                const { clientWidth, clientHeight } = entries[0].target;
                onSizeChange(clientWidth, clientHeight, chapterId);
            },
            [onSizeChange, ref.current, chapterId],
        ),
    );

    const updateState = <T,>(
        value: T,
        setLocalState: (value: T) => void,
        setGlobalState: (value: T) => void,
        forceLocal: boolean = false,
    ) => {
        if (forceLocal || !arePagesFetched) setLocalState(value);
        if (isCurrentChapter) setGlobalState(value);
    };
    useReaderSetPagesState(
        isCurrentChapter,
        pagesResponse,
        resumeMode,
        lastPageRead,
        actualPages,
        pageLoadStates,
        pagesToSpreadState,
        arePagesFetched,
        setArePagesFetched,
        (value) => updateState(value, noOp, getReaderChaptersStore().setReaderStateChapters),
        (value) => updateState(value, setTotalPages, setContextTotalPages),
        (value) => updateState(value, setPages, setContextPages),
        (value) => updateState(value, setPageUrls, noOp),
        (value) => updateState(value, setPageLoadStates, setContextPageLoadStates),
        (value) => updateState(value, setPagesToSpreadState, noOp),
        (value) => updateState(value, noOp, setContextCurrentPageIndex),
        (value) => {
            if ((isInitialChapter && !arePagesFetched) || scrollIntoView) {
                setPageToScrollToIndex(value);
                getReaderChaptersStore().setReaderStateChapters((prevState) => ({
                    ...prevState,
                    visibleChapters: { ...prevState.visibleChapters, scrollIntoView: false, resumeMode: undefined },
                }));
            }
        },
        (value) => updateState(value, noOp, setTransitionPageMode),
    );

    useReaderConvertPagesForReadingMode(
        currentPageIndex,
        actualPages,
        pageUrls,
        (value) => updateState(value, setPages, setContextPages, true),
        (value) => updateState(value, setPagesToSpreadState, noOp, true),
        (value) => updateState(value, noOp, updateCurrentPageIndex),
        readingMode,
    );

    const shouldRenderChapterViewer =
        isContinuousReadingModeActive || isCurrentChapter || isPreviousChapter || isNextChapter;
    if (!shouldRenderChapterViewer) {
        return null;
    }

    if (pagesResponse.error) {
        if (shouldHideChapter) return null;
        return (
            <Box
                sx={{
                    minHeight: '100%',
                    minWidth: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    position: 'relative',
                }}
            >
                <EmptyViewAbsoluteCentered
                    message={t('global.error.label.failed_to_load_data')}
                    messageExtra={getErrorMessage(pagesResponse.error)}
                    retry={() => {
                        doFetchPages();
                    }}
                />
            </Box>
        );
    }

    if (pagesResponse.loading || !arePagesFetched) {
        if (shouldHideChapter) return null;
        return (
            <Box
                sx={{
                    minHeight: '100%',
                    minWidth: '100%',
                    display: 'grid',
                    placeItems: 'center',
                }}
            >
                <LoadingPlaceholder />
            </Box>
        );
    }

    if (chapterId != null && !totalPages) {
        if (shouldHideChapter) return null;
        return (
            <Box sx={{ minWidth: '100%', minHeight: '100%', position: 'relative' }}>
                <EmptyViewAbsoluteCentered message={t('reader.error.label.no_pages_found')} retry={doFetchPages} />
            </Box>
        );
    }

    const PagerContent = (
        <>
            {showPreviousTransitionPage && (
                <ReaderTransitionPage chapterId={chapterId} type={ReaderTransitionPageMode.PREVIOUS} />
            )}
            <Pager
                ref={pagerRef}
                totalPages={totalPages}
                currentPageIndex={currentPageIndex}
                pages={actualPages}
                transitionPageMode={transitionPageMode}
                pageLoadStates={pageLoadStates}
                retryFailedPagesKeyPrefix={retryFailedPagesKeyPrefix}
                imageRefs={imageRefs}
                onLoad={onLoad}
                onError={onError}
                isCurrentChapter={isCurrentChapter}
                isPreviousChapter={isPreviousChapter}
                isNextChapter={isNextChapter}
                readingMode={readingMode}
                imagePreLoadAmount={imagePreLoadAmount}
                readingDirection={readingDirection}
                pageScaleMode={pageScaleMode}
                pageGap={pageGap}
                customFilter={customFilter}
                shouldStretchPage={shouldStretchPage}
                readerWidth={readerWidth}
                readerNavBarWidth={readerNavBarWidth}
                isPreloadMode={isPreloadMode}
                resumeMode={resumeMode}
                handleAsInitialRender={scrollIntoView}
            />
            {showNextTransitionPage && (
                <ReaderTransitionPage chapterId={chapterId} type={ReaderTransitionPageMode.NEXT} />
            )}
        </>
    );

    // --- DETERMINE STYLES ---
    const isVertical = isContinuousVerticalReadingMode(readingMode);
    const isHorizontalContinuous = readingMode === ReadingMode.CONTINUOUS_HORIZONTAL;
    
    const contentStyle = {
        // Horizontal Continuous needs AUTO width so it can expand sideways
        // Vertical needs 100% width so it fits screen width
        width: isVertical ? '100%' : (isHorizontalContinuous ? 'auto' : '100%'),
        height: isVertical ? 'auto' : '100%',
    };

    // Determine correct touch-action for native browser scrolling
    let nativeTouchAction = 'auto';
    if (isVertical) nativeTouchAction = 'pan-y'; // Webtoon: Browser handles Y
    else if (isHorizontalContinuous) nativeTouchAction = 'pan-x'; // Horizontal Strip: Browser handles X
    else nativeTouchAction = 'pan-x pan-y'; // Single/Double: Browser handles everything

    return (
        <Stack
            ref={ref}
            sx={{
                width: isVertical ? '100%' : 'fit-content',
                height: isHorizontalContinuous ? '100%' : 'fit-content',
                margin: 'auto',
                flexWrap: 'nowrap',
                ...applyStyles(isHorizontalContinuous, {
                    minHeight,
                }),
                ...applyStyles(isVertical, {
                    minWidth,
                }),
                ...applyStyles(shouldHideChapter, {
                    maxWidth: 0,
                    maxHeight: 0,
                    minWidth: 'unset',
                    minHeight: 'unset',
                    overflow: 'hidden',
                    margin: 'unset',
                }),
                ...applyStyles(
                    isVertical && shouldApplyReaderWidth(readerWidth, pageScaleMode),
                    { alignItems: 'center' },
                ),
                ...applyStyles(readingMode === ReadingMode.CONTINUOUS_HORIZONTAL, {
                    ...applyStyles(themeDirection === 'ltr', {
                        flexDirection: isLtrReadingDirection ? 'row' : 'row-reverse',
                    }),
                    ...applyStyles(themeDirection === 'rtl', {
                        flexDirection: isLtrReadingDirection ? 'row-reverse' : 'row',
                    }),
                }),
            }}
        >
            {!isPreloadMode && (
                <ReaderInfiniteScrollUpdateChapter
                    chapterId={chapterId}
                    previousChapterId={previousChapterId}
                    nextChapterId={nextChapterId}
                    isCurrentChapter={isCurrentChapter}
                    isPreviousChapterVisible={isPreviousChapterVisible}
                    isNextChapterVisible={isNextChapterVisible}
                    imageWrapper={pagerRef.current}
                    scrollElement={scrollElement}
                />
            )}
            
            <TransformWrapper
                ref={zoomRef}
                key={chapterId}
                initialScale={1}
                minScale={1}
                maxScale={5}
                limitToBounds={true} 
                disablePadding={true} 
                centerOnInit={true}
                
                doubleClick={{ mode: 'toggle', step: 2, disabled: false, animationTime: 0 }}

                disabled={!isMobile || !isCurrentChapter} 
                
                panning={{ 
                    disabled: !isScaleChanged, 
                    velocityDisabled: false 
                }}
                
                wheel={{ disabled: true }}

                onTransformed={(ref) => {
                    const newScale = ref.state.scale;
                    setScale(newScale);
                    
                    if (newScale > 1.01) {
                        document.body.classList.add('disable-native-scroll');
                    } else {
                        document.body.classList.remove('disable-native-scroll');
                    }
                    if (scrollElement) scrollElement.dispatchEvent(new Event('scroll'));
                }}
                
                onZoomStart={onInteractionStart}
                onPanningStart={onInteractionStart}
                onZoomStop={onInteractionStop}
                onPanningStop={onInteractionStop}
            >
                <TransformComponent
                    wrapperStyle={{ 
                        width: '100%', 
                        height: '100%', 
                        overflow: 'hidden',
                        // CSS Magic: Block browser if zoomed, otherwise allow mode-specific scroll
                        touchAction: isScaleChanged ? 'none' : nativeTouchAction,
                        // REMOVED Flex centering to prevent top-clipping in long strips
                        display: 'block' 
                    }}
                    contentStyle={contentStyle}
                >
                    {PagerContent}
                </TransformComponent>
            </TransformWrapper>
        </Stack>
    );
};

export const ReaderChapterViewer = memo(BaseReaderChapterViewer);