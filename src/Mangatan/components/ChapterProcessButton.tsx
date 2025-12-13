import React, { useEffect, useState, useRef } from 'react';
import { checkChapterStatus, preprocessChapter, ChapterStatus, AuthCredentials } from '@/Mangatan/utils/api';

interface ChapterProcessButtonProps {
    chapterPath: string; 
    creds?: AuthCredentials;
}

export const ChapterProcessButton: React.FC<ChapterProcessButtonProps> = ({ chapterPath, creds }) => {
    const [status, setStatus] = useState<ChapterStatus>('idle');
    const apiBaseUrl = `${window.location.origin}/api/v1${chapterPath}/page/`;
    const startingRef = useRef(false);

    useEffect(() => {
        let mounted = true;
        let intervalId: number | null = null;

        const check = async () => {
            if (status === 'processed') return;

            const res = await checkChapterStatus(apiBaseUrl, creds);
            
            if (mounted) {
                if (startingRef.current && res === 'idle') {
                    if (!intervalId) intervalId = window.setInterval(check, 500); // Retry quickly
                    return;
                }

                let hasChanged = false;
                if (typeof res === 'object' && res.status === 'processing') {
                    if (typeof status === 'object' && status.status === 'processing' &&
                        status.progress === res.progress && status.total === res.total) {
                        hasChanged = false;
                    } else {
                        hasChanged = true;
                    }
                } else {
                    hasChanged = (res !== status);
                }

                if (hasChanged) {
                    setStatus(res);
                }
                
                const isProcessing = (typeof res === 'object' && res.status === 'processing');

                if (isProcessing || startingRef.current) {
                    if (!intervalId) {
                        intervalId = window.setInterval(check, 500);
                    }
                } else {
                    if (intervalId) {
                        clearInterval(intervalId);
                        intervalId = null;
                    }
                }
            }
        };

        check();

        return () => { 
            mounted = false; 
            if (intervalId) clearInterval(intervalId);
        };
    }, [apiBaseUrl, status, creds]); 

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (status !== 'idle') return;

        startingRef.current = true;
        setStatus({ status: 'processing', progress: 0, total: 0 }); 
        
        try {
            await preprocessChapter(apiBaseUrl, chapterPath, creds);
            
            // Keep the "starting" flag true for a buffer period to ignore initial 404s/idles
            setTimeout(() => {
                startingRef.current = false;
            }, 2000);

        } catch (err) {
            console.error(err);
            startingRef.current = false;
            setStatus('idle');
        }
    };

    const renderButtonContent = () => {
        if (status === 'processed') return "OCR Processed";
        
        if (typeof status === 'object' && status.status === 'processing') {
            if (status.total > 0) {
                return `Processing (${status.progress}/${status.total})`;
            }
            return "Processing...";
        }

        return "Process OCR";
    };

    const isProcessing = (typeof status === 'object' && status.status === 'processing');
    const isProcessed = status === 'processed';

    if (isProcessed) {
        return (
            <button className="ocr-chapter-btn done" disabled title="OCR already processed">
                {renderButtonContent()}
            </button>
        );
    }

    return (
        <button 
            className={`ocr-chapter-btn process ${isProcessing ? 'busy' : ''}`} 
            onClick={handleClick}
            disabled={isProcessing}
        >
            {renderButtonContent()}
        </button>
    );
};