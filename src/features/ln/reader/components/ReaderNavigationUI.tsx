import React from 'react';
import './ReaderNavigationUI.css';

interface ReaderNavigationUIProps {
    visible: boolean;
    onNext: () => void;
    onPrev: () => void;
    // onOpenToc removed from here to prevent errors
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
    progress,
    totalBookProgress,
    showSlider = false,
    onPageChange,
    theme,
    isVertical,
    mode,
}) => {
    if (!visible) return null;

    const displayProgress = totalBookProgress !== undefined ? totalBookProgress : progress;

    return (
        <div className="reader-navigation-ui">
            {/* Nav Buttons */}
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

            {/* Progress Bar */}
            <div
                className="reader-progress"
                style={{ backgroundColor: `${theme.bg}dd`, color: theme.fg }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="progress-row" style={{ justifyContent: 'center' }}>

                    {/* Visual Page Count (Only visible in Paged Mode) */}
                    {mode === 'paged' && currentPage !== undefined && totalPages !== undefined ? (
                        <>
                            <span className="progress-text">
                                Page {currentPage + 1} / {totalPages}
                            </span>
                            <span className="progress-sep" style={{ margin: '0 8px' }}>·</span>
                        </>
                    ) : null}

                    <span className="progress-percent" style={{ fontWeight: 'bold' }}>
                        {displayProgress.toFixed(1)}%
                    </span>

                </div>

                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${displayProgress}%`, backgroundColor: theme.fg }}
                    />
                </div>
            </div>

            {/* Slider */}
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