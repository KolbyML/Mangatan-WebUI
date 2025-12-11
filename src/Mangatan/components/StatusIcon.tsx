import React from 'react';
import { OcrStatus } from '@/Mangatan/context/OCRContext';

interface StatusIconProps {
    status: OcrStatus;
    onRetry: () => void;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status, onRetry }) => {
    if (status === 'success' || status === 'idle') return null;

    return (
        <div className={`ocr-status-icon-container ${status}`}>
            {status === 'loading' && (
                // Simple CSS Spinner SVG
                <svg className="ocr-spinner" viewBox="0 0 50 50">
                    <circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5" />
                </svg>
            )}

            {status === 'error' && (
                // Clickable Retry Icon (Red X)
                <button type="button" onClick={onRetry} className="ocr-retry-button" title="OCR Failed. Click to retry.">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" stroke="red" opacity="0.5" />
                        <path d="M15 9l-6 6M9 9l6 6" stroke="red" />
                    </svg>
                </button>
            )}
        </div>
    );
};
