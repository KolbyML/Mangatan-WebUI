import React, { useEffect, useState } from 'react';
import { checkChapterStatus, preprocessChapter, ChapterStatus } from '@/Mangatan/utils/api';

interface ChapterProcessButtonProps {
    chapterPath: string; 
}

export const ChapterProcessButton: React.FC<ChapterProcessButtonProps> = ({ chapterPath }) => {
    const [status, setStatus] = useState<ChapterStatus | 'checking'>('idle');
    const apiBaseUrl = `${window.location.origin}/api/v1${chapterPath}/page/`;

    useEffect(() => {
        let mounted = true;
        let intervalId: number | null = null;

        const check = async () => {
            // If we are already done, don't check (unless we are just starting up/idle)
            if (status === 'processed') return;

            const currentStatus = await checkChapterStatus(apiBaseUrl);
            
            if (mounted) {
                // Only update state if it's different to prevent loops, 
                // but always allow updating FROM 'processing' TO 'processed'
                if (currentStatus !== status) {
                    setStatus(currentStatus);
                }
                
                // If the server says it's still processing, ensure we are polling
                if (currentStatus === 'processing') {
                    if (!intervalId) {
                        intervalId = window.setInterval(check, 2000);
                    }
                } else {
                    // Stop polling if done or idle
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }
                }
            }
        };

        // Run immediately on mount or status change
        check();

        return () => { 
            mounted = false; 
            if (intervalId) clearInterval(intervalId);
        };
    // FIX: Add 'status' to dependency array so polling restarts when user clicks 'Process'
    }, [apiBaseUrl, status]); 

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (status !== 'idle') return;

        setStatus('processing'); // This trigger will now restart the useEffect polling
        
        try {
            await preprocessChapter(apiBaseUrl);
            // No need for manual setTimeout here anymore; 
            // the useEffect will catch the 'processing' state naturally.
        } catch (err) {
            console.error(err);
            setStatus('idle');
        }
    };

    if (status === 'checking') return <span className="ocr-chapter-btn loading">...</span>;

    if (status === 'processed') {
        return (
            <button className="ocr-chapter-btn done" disabled title="OCR already processed for this chapter">
                OCR Processed
            </button>
        );
    }

    return (
        <button 
            className={`ocr-chapter-btn process ${status === 'processing' ? 'busy' : ''}`} 
            onClick={handleClick}
            disabled={status === 'processing'}
            title={status === 'processing' ? 'Processing in background...' : 'Pre-process OCR for this chapter'}
        >
            {status === 'processing' ? 'Processing...' : 'Process OCR'}
        </button>
    );
};
