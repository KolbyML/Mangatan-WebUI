/**
 * Virtual Reader - Mode Switcher with UI Management
 */

import React, { useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { Settings } from '@/Manatan/types';
import { PagedReader } from './PagedReader';
import { ContinuousReader } from './ContinuousReader';
import { useUIVisibility } from '../hooks/useUIVisibility';
import { ProgressData } from '../hooks/useReadingProgress';

interface VirtualReaderProps {
    items: string[];
    settings: Settings;
    onRelocated?: (chapterIndex: number, pageIndex?: number, progressData?: ProgressData) => void;
    initialIndex?: number;
    initialPage?: number;
    initialProgress?: { textOffset?: number; totalProgress?: number; sentenceText?: string };
    renderHeader?: (showUI: boolean, toggleUI: () => void) => ReactNode;
}

export const VirtualReader: React.FC<VirtualReaderProps> = ({
    items,
    settings,
    onRelocated,
    initialIndex = 0,
    initialPage = 0,
    initialProgress,
    renderHeader,
}) => {
    const currentIndexRef = useRef(initialIndex);
    const currentPageRef = useRef(initialPage);

    const { showUI, toggleUI } = useUIVisibility({
        autoHideDelay: 5000,
        initialVisible: false,
    });

    const isPaged = settings.lnPaginationMode === 'paginated';

    const handleRelocated = useCallback((chapterIndex: number, pageIndex?: number, progressData?: ProgressData) => {
        if (progressData || currentIndexRef.current !== chapterIndex || currentPageRef.current !== pageIndex) {
            currentIndexRef.current = chapterIndex;
            currentPageRef.current = pageIndex;
            onRelocated?.(chapterIndex, pageIndex, progressData);
        }
    }, [onRelocated]);

    const commonProps = {
        chapters: items,
        settings,
        onRelocated: handleRelocated,
        onToggleUI: toggleUI,
        showNavigation: showUI,
        initialChapter: initialIndex,
        initialProgress: initialProgress, // Pass down
    };

    return (
        <>
            {isPaged ? (
                <PagedReader
                    {...commonProps}
                    initialPage={initialPage}
                />
            ) : (
                <ContinuousReader
                    {...commonProps}
                />
            )}

            {renderHeader?.(showUI, toggleUI)}
        </>
    );
};