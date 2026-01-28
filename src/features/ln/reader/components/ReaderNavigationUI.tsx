/**
 * Shared Reader Navigation UI
 */

import React from 'react';
import './ReaderNavigationUI.css';

interface ReaderNavigationUIProps {
    visible: boolean;
    onNext: () => void;
    onPrev: () => void;
    canGoNext: boolean;
    canGoPrev: boolean;
    currentPage?: number;
    totalPages?: number;
    currentChapter: number;
    totalChapters: number;
    progress: number;
    totalBookProgress?: number; 
    showSlider?: boolean;
    onPageChange?: (page: number) => void;
    theme: { bg: string; fg: string };
    isVertical: boolean;
    mode: 'paged' | 'continuous';
}

export const ReaderNavigationUI: React.FC<ReaderNavigationUIProps> = ({
    visible,
    onNext,
    onPrev,
    canGoNext,
    canGoPrev,
    currentPage,
    totalPages,
    currentChapter,
    totalChapters,
    progress,
    totalBookProgress,
    showSlider = false,
    onPageChange,
    theme,
    isVertical,
    mode,
}) => {
    if (!visible) return null;

    // Prefer global progress if available
    const displayProgress = totalBookProgress !== undefined ? totalBookProgress : progress;

    return (
        <div className="reader-navigation-ui">
            <button
                className={`nav-btn prev ${isVertical ? 'vertical' : 'horizontal'}`}
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                disabled={!canGoPrev}
            >
                ‹
            </button>

            <button
                className={`nav-btn next ${isVertical ? 'vertical' : 'horizontal'}`}
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                disabled={!canGoNext}
            >
                ›
            </button>

            <div
                className="reader-progress"
                style={{ backgroundColor: `${theme.bg}dd`, color: theme.fg }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="progress-row">
                    {mode === 'paged' && currentPage !== undefined && totalPages !== undefined ? (
                        <>
                            <span className="progress-text">{currentPage + 1}/{totalPages}</span>
                            <span className="progress-sep">·</span>
                        </>
                    ) : null}
                    <span className="progress-chapter">Ch {currentChapter + 1}/{totalChapters}</span>
                    <span className="progress-sep">·</span>
                    <span className="progress-percent">{displayProgress.toFixed(1)}%</span>
                </div>
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${displayProgress}%`, backgroundColor: theme.fg }}
                    />
                </div>
            </div>

            {showSlider && mode === 'paged' && totalPages && totalPages > 1 && onPageChange && currentPage !== undefined && (
                <div
                    className="reader-slider-wrap"
                    style={{ backgroundColor: `${theme.bg}cc`, color: theme.fg }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        type="range"
                        className="reader-slider"
                        min={0}
                        max={totalPages - 1}
                        value={currentPage}
                        onChange={(e) => onPageChange(parseInt(e.target.value, 10))}
                        style={{ color: theme.fg }}
                    />
                </div>
            )}
        </div>
    );
};