

import React, { ReactNode, useRef, useEffect, useState, useCallback } from 'react';
import { Settings } from '@/Manatan/types';
import { PagedReader } from './PagedReader';
import { ContinuousReader } from './ContinuousReader';
import { useUIVisibility } from '../hooks/useUIVisibility';
import { BookStats, AppStorage } from '@/lib/storage/AppStorage';

interface VirtualReaderProps {
    bookId: string;
    items: string[];
    stats: BookStats | null;
    settings: Settings;
    initialIndex?: number;
    initialPage?: number;
    initialProgress?: {
        sentenceText?: string;
        chapterIndex?: number;
        pageIndex?: number;
        chapterCharOffset?: number;
        totalProgress?: number;
    };
    renderHeader?: (showUI: boolean, toggleUI: () => void) => ReactNode;
    onOpenToc?: () => void;
}

interface SharedPosition {
    chapterIndex: number;
    pageIndex: number;
    chapterCharOffset: number;
    sentenceText: string;
    totalProgress: number;
    timestamp: number;
}

export const VirtualReader: React.FC<VirtualReaderProps> = ({
    bookId,
    items,
    stats,
    settings,
    initialIndex = 0,
    initialPage = 0,
    initialProgress: externalInitialProgress,
    renderHeader,
    onOpenToc,
}) => {
    const { showUI, toggleUI } = useUIVisibility({
        autoHideDelay: 5000,
        initialVisible: false,
    });


    const sharedPositionRef = useRef<SharedPosition>({
        chapterIndex: externalInitialProgress?.chapterIndex ?? initialIndex,
        pageIndex: externalInitialProgress?.pageIndex ?? initialPage,
        chapterCharOffset: externalInitialProgress?.chapterCharOffset ?? 0,
        sentenceText: externalInitialProgress?.sentenceText ?? '',
        totalProgress: externalInitialProgress?.totalProgress ?? 0,
        timestamp: Date.now(),
    });


    const forceSaveRef = useRef<(() => Promise<void>) | null>(null);
    const prevSettingsRef = useRef({
        direction: settings.lnReadingDirection,
        mode: settings.lnPaginationMode,
    });

    const [readerKey, setReaderKey] = useState(0);
    const [activeProgress, setActiveProgress] = useState(externalInitialProgress);
    const [currentIndex, setCurrentIndex] = useState(
        externalInitialProgress?.chapterIndex ?? initialIndex
    );
    const [currentPage, setCurrentPage] = useState(
        externalInitialProgress?.pageIndex ?? initialPage
    );
    const [pendingRemount, setPendingRemount] = useState(false);

    const isPaged = settings.lnPaginationMode === 'paginated';
    const isVertical = settings.lnReadingDirection?.includes('vertical');
    const isRTL = settings.lnReadingDirection === 'vertical-rtl';


    const handlePositionUpdate = useCallback(
        (position: {
            chapterIndex: number;
            pageIndex?: number;
            chapterCharOffset?: number;
            sentenceText: string;
            totalProgress: number;
        }) => {
            if (position.chapterCharOffset || position.sentenceText) {
                sharedPositionRef.current = {
                    chapterIndex: position.chapterIndex,
                    pageIndex: position.pageIndex ?? 0,
                    chapterCharOffset: position.chapterCharOffset ?? 0,
                    sentenceText: position.sentenceText,
                    totalProgress: position.totalProgress,
                    timestamp: Date.now(),
                };

                console.log('[VirtualReader] Position updated:', {
                    chapter: position.chapterIndex,
                    charOffset: position.chapterCharOffset,
                    sentence: position.sentenceText?.substring(0, 30) + '...',
                });
            }
        },
        []
    );


    const handleRegisterSave = useCallback((saveFn: () => Promise<void>) => {
        forceSaveRef.current = saveFn;
    }, []);


    useEffect(() => {
        const prevDirection = prevSettingsRef.current.direction;
        const prevMode = prevSettingsRef.current.mode;

        const directionChanged = prevDirection !== settings.lnReadingDirection;
        const modeChanged = prevMode !== settings.lnPaginationMode;

        if (directionChanged || modeChanged) {
            console.log('[VirtualReader] Settings changed, triggering save before switch');

            prevSettingsRef.current = {
                direction: settings.lnReadingDirection,
                mode: settings.lnPaginationMode,
            };

            setPendingRemount(true);

            const doSaveAndSwitch = async () => {
                if (forceSaveRef.current) {
                    await forceSaveRef.current();
                }

                await new Promise(resolve => setTimeout(resolve, 50));
                const pos = sharedPositionRef.current;

                console.log('[VirtualReader] After save, position:', {
                    chapter: pos.chapterIndex,
                    page: pos.pageIndex,
                    charOffset: pos.chapterCharOffset,
                });

                if (pos.sentenceText || pos.chapterCharOffset > 0) {
                    await AppStorage.saveLnProgress(bookId, {
                        chapterIndex: pos.chapterIndex,
                        pageNumber: pos.pageIndex,
                        chapterCharOffset: pos.chapterCharOffset,
                        totalCharsRead: 0,
                        sentenceText: pos.sentenceText,
                        chapterProgress: 0,
                        totalProgress: pos.totalProgress,
                    });
                }

                setActiveProgress({
                    chapterIndex: pos.chapterIndex,
                    pageIndex: pos.pageIndex,
                    chapterCharOffset: pos.chapterCharOffset,
                    sentenceText: pos.sentenceText,
                    totalProgress: pos.totalProgress,
                });
                setCurrentIndex(pos.chapterIndex);
                setCurrentPage(pos.pageIndex);

                setReaderKey((k) => k + 1);
                setPendingRemount(false);
            };

            doSaveAndSwitch();
        }
    }, [settings.lnReadingDirection, settings.lnPaginationMode, bookId]);



    if (pendingRemount) {
        return (
            <div style={{
                backgroundColor: '#2B2B2B',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>

            </div>
        );
    }

    const commonProps = {
        bookId,
        chapters: items,
        stats,
        settings,
        isVertical: !!isVertical,
        isRTL: !!isRTL,
        onToggleUI: toggleUI,
        showNavigation: showUI,
        initialChapter: currentIndex,
        initialProgress: activeProgress,
        onPositionUpdate: handlePositionUpdate,
        onRegisterSave: handleRegisterSave,
        onOpenToc: onOpenToc,

    };

    return (
        <>
            {isPaged ? (
                <PagedReader
                    key={`paged-${readerKey}`}
                    {...commonProps}
                    initialPage={currentPage}
                />
            ) : (
                <ContinuousReader key={`continuous-${readerKey}`} {...commonProps} />
            )}
            {renderHeader?.(showUI, toggleUI)}
        </>
    );
};