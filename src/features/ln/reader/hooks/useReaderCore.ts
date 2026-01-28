

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { Settings } from '@/Manatan/types';
import { BookStats } from '@/lib/storage/AppStorage';
import { useTextLookup } from './useTextLookup';
import { useProgressManager } from './useProgressManager';
import { getReaderTheme, ReaderTheme } from '../utils/themes';
import {
    NavigationOptions,
    NavigationCallbacks,
    TouchState,
    createTouchState,
    handleTouchEnd,
} from '../utils/navigation';

interface UseReaderCoreProps {
    bookId: string;
    chapters: string[];
    stats: BookStats | null;
    settings: Settings;
    containerRef: React.RefObject<HTMLElement>;
    isVertical: boolean;
    isRTL: boolean;
    isPaged: boolean;
    currentChapter: number;
    currentPage?: number;
    totalPages?: number;
    initialProgress?: {
        sentenceText?: string;
        chapterIndex?: number;
        pageIndex?: number;
        chapterCharOffset?: number;
        totalProgress?: number;
    };
    onToggleUI?: () => void;
    onRestoreComplete?: () => void;
    onPositionUpdate?: (position: {
        chapterIndex: number;
        pageIndex?: number;
        chapterCharOffset?: number;
        sentenceText: string;
        totalProgress: number;
    }) => void;
    onRegisterSave?: (saveFn: () => Promise<void>) => void;
}

interface TouchHandlers {
    handlePointerDown: (e: React.PointerEvent) => void;
    handlePointerMove: (e: React.PointerEvent) => void;
    handleTouchStart: (e: React.TouchEvent) => void;
    handleTouchMove: (e: React.TouchEvent) => void;
    handleTouchEnd: (e: React.TouchEvent, navCallbacks: NavigationCallbacks) => void;
}

interface UseReaderCoreReturn {
    theme: ReaderTheme;
    navOptions: NavigationOptions;
    isReady: boolean;
    currentProgress: number;
    reportScroll: () => void;
    reportChapterChange: (chapter: number, page?: number) => void;
    reportPageChange: (page: number, total?: number) => void;
    saveNow: () => Promise<void>;
    tryLookup: (e: React.MouseEvent) => Promise<boolean>;
    handleContentClick: (e: React.MouseEvent) => Promise<void>;
    touchHandlers: TouchHandlers;
    isDragging: () => boolean;
}

const DRAG_THRESHOLD = 10;

export function useReaderCore({
    bookId,
    chapters,
    stats,
    settings,
    containerRef,
    isVertical,
    isRTL,
    isPaged,
    currentChapter,
    currentPage,
    totalPages,
    initialProgress,
    onToggleUI,
    onRestoreComplete,
    onPositionUpdate,
    onRegisterSave,
}: UseReaderCoreProps): UseReaderCoreReturn {
    const isDraggingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const touchStartRef = useRef<TouchState | null>(null);

    const theme = useMemo(() => getReaderTheme(settings.lnTheme), [settings.lnTheme]);

    const navOptions: NavigationOptions = useMemo(
        () => ({
            isVertical,
            isRTL,
            isPaged,
        }),
        [isVertical, isRTL, isPaged]
    );

    const { tryLookup } = useTextLookup();

    const {
        isReady,
        currentProgress,
        currentPosition,
        reportScroll,
        reportChapterChange,
        reportPageChange,
        saveNow,
    } = useProgressManager({
        bookId,
        chapters,
        stats,
        containerRef,
        isVertical,
        isRTL,
        isPaged,
        currentChapter,
        currentPage,
        totalPages,
        initialProgress,
        onRestoreComplete,
    });


    useEffect(() => {
        if (onRegisterSave) {
            onRegisterSave(saveNow);
        }
    }, [onRegisterSave, saveNow]);


    useEffect(() => {
        if (currentPosition && onPositionUpdate) {
            onPositionUpdate({
                chapterIndex: currentPosition.chapterIndex,
                pageIndex: currentPosition.pageIndex,
                chapterCharOffset: currentPosition.chapterCharOffset,
                sentenceText: currentPosition.sentenceText,
                totalProgress: currentPosition.totalProgress,
            });
        }
    }, [currentPosition, onPositionUpdate]);


    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        isDraggingRef.current = false;
        startPosRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) {
            const dx = Math.abs(e.clientX - startPosRef.current.x);
            const dy = Math.abs(e.clientY - startPosRef.current.y);
            if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
                isDraggingRef.current = true;
            }
        }
    }, []);


    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        isDraggingRef.current = false;
        startPosRef.current = {
            x: e.nativeEvent.touches[0].clientX,
            y: e.nativeEvent.touches[0].clientY,
        };
        touchStartRef.current = createTouchState(e.nativeEvent);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDraggingRef.current) {
            const dx = Math.abs(e.nativeEvent.touches[0].clientX - startPosRef.current.x);
            const dy = Math.abs(e.nativeEvent.touches[0].clientY - startPosRef.current.y);
            if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
                isDraggingRef.current = true;
            }
        }
    }, []);

    const handleTouchEndEvent = useCallback(
        (e: React.TouchEvent, navCallbacks: NavigationCallbacks) => {
            if (!touchStartRef.current) return;

            const result = handleTouchEnd(
                e.nativeEvent,
                touchStartRef.current,
                navOptions,
                navCallbacks
            );
            touchStartRef.current = null;

            if (!result && !isDraggingRef.current) {
                onToggleUI?.();
            }
        },
        [navOptions, onToggleUI]
    );


    const handleContentClick = useCallback(
        async (e: React.MouseEvent) => {
            if (isDraggingRef.current) return;

            const target = e.target as HTMLElement;
            if (
                target.closest(
                    'a, button, img, ruby rt, .nav-btn, .reader-progress, .reader-slider-wrap'
                )
            ) {
                return;
            }

            const didLookup = await tryLookup(e);
            if (!didLookup) {
                onToggleUI?.();
            }
        },
        [tryLookup, onToggleUI]
    );

    const isDragging = useCallback(() => isDraggingRef.current, []);


    const touchHandlers: TouchHandlers = useMemo(
        () => ({
            handlePointerDown,
            handlePointerMove,
            handleTouchStart,
            handleTouchMove,
            handleTouchEnd: handleTouchEndEvent,
        }),
        [
            handlePointerDown,
            handlePointerMove,
            handleTouchStart,
            handleTouchMove,
            handleTouchEndEvent,
        ]
    );


    return {
        theme,
        navOptions,
        isReady,
        currentProgress,
        reportScroll,
        reportChapterChange,
        reportPageChange,
        saveNow,
        tryLookup,
        handleContentClick,
        touchHandlers,
        isDragging,
    };
}