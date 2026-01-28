import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Fade, IconButton, Typography, LinearProgress } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';

import { useOCR } from '@/Manatan/context/OCRContext';
import ManatanLogo from '@/Manatan/assets/manatan_logo.png';
import { AppStorage } from '@/lib/storage/AppStorage';
import { useBookParser } from "../hooks/useBookParser";
import { VirtualReader } from "../components/VirtualReader";
import { ReaderControls } from "../components/ReaderControls";
import { ProgressData } from '../hooks/useReadingProgress';
import { YomitanPopup } from '@/Manatan/components/YomitanPopup';

const THEMES = {
    light: { bg: '#FFFFFF', fg: '#1a1a1a' },
    sepia: { bg: '#F4ECD8', fg: '#5C4B37' },
    dark: { bg: '#2B2B2B', fg: '#E0E0E0' },
    black: { bg: '#000000', fg: '#CCCCCC' },
} as const;

export const LNReaderScreen: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { settings, setSettings, openSettings } = useOCR();

    const [fileBlob, setFileBlob] = useState<Blob | null>(null);
    const [lastReadIndex, setLastReadIndex] = useState(0);
    const [lastReadPage, setLastReadPage] = useState(0);
    const [initialProgress, setInitialProgress] = useState<{ textOffset?: number; totalProgress?: number; sentenceText?: string } | undefined>(undefined);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Load file and progress - RESET when id changes
    useEffect(() => {
        if (!id) return;

        console.log('[LNReaderScreen] Loading book:', id);

        // Reset state
        setFileBlob(null);
        setLastReadIndex(0);
        setLastReadPage(0);
        setInitialProgress(undefined);

        const load = async () => {
            try {
                const blob = await AppStorage.files.getItem<Blob>(id);
                console.log('[LNReaderScreen] Blob loaded:', blob?.size);
                setFileBlob(blob);

                const progressData = await AppStorage.lnProgress.getItem<any>(id);
                console.log('[LNReaderScreen] Progress data:', progressData);

                if (progressData?.chapterIndex != null) {
                    setLastReadIndex(progressData.chapterIndex);

                    const page = progressData.pageNumber ?? progressData.pageIndex ?? 0;
                    setLastReadPage(page);
                    // Load advanced progress
                    if (progressData.sentenceText) {
                        setInitialProgress({
                            textOffset: progressData.textOffset,
                            totalProgress: progressData.totalProgress,
                            sentenceText: progressData.sentenceText
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to load book:", err);
            }
        };

        load();
    }, [id]); // Re-run when id changes

    // Parse book
    const { items, metadata, isReady, error, progress } = useBookParser(fileBlob, id);

    console.log('[LNReaderScreen] Parse status:', {
        isReady,
        itemsCount: items.length,
        progress,
        hasBlob: !!fileBlob
    });

    // Get theme
    const themeKey = (settings.lnTheme || 'dark') as keyof typeof THEMES;
    const theme = THEMES[themeKey] || THEMES.dark;

    // Save progress
    const handleSaveProgress = (chapterIndex: number, pageIndex?: number, extraData?: any) => {
        if (!id) return;

        // Only accept real "sentence commit" saves.
        const sentence = (extraData?.sentenceText || '').trim();
        if (!sentence) return;

        AppStorage.saveLnProgress(id, {
            chapterId: 'chapter',
            chapterIndex,
            // use your field name consistently:
            pageNumber: typeof pageIndex === 'number' ? pageIndex : undefined,
            textOffset: extraData?.textOffset,
            totalProgress: extraData?.totalProgress,
            sentenceText: sentence,
            lastRead: Date.now(),
        });
    };

    // Loading state
    if (!fileBlob || !isReady) {
        return (
            <Box sx={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: theme.bg,
                color: theme.fg,
                gap: 2
            }}>
                <CircularProgress sx={{ color: theme.fg }} />

                {progress > 0 && progress < 100 && (
                    <Box sx={{ width: '60%', maxWidth: 300 }}>
                        <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: `${theme.fg}22`,
                                '& .MuiLinearProgress-bar': { bgcolor: theme.fg }
                            }}
                        />
                        <Typography variant="caption" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                            Loading... {progress}%
                        </Typography>
                    </Box>
                )}

                {error && (
                    <Box sx={{ textAlign: 'center', px: 3 }}>
                        <Typography color="error">{error}</Typography>
                        <Typography
                            variant="body2"
                            sx={{ mt: 2, cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => navigate(-1)}
                        >
                            Go back
                        </Typography>
                    </Box>
                )}
            </Box>
        );
    }

    console.log('[LNReaderScreen] Rendering reader with', items.length, 'chapters');

    return (
        <Box sx={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <VirtualReader
                key={id} // Force full remount when book changes
                items={items}
                settings={settings}
                initialIndex={lastReadIndex}
                initialPage={lastReadPage}
                initialProgress={initialProgress}
                onRelocated={handleSaveProgress}
                renderHeader={(showUI, toggleUI) => (
                    <Fade in={showUI}>
                        <Box sx={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            p: 1.5,
                            background: `linear-gradient(to bottom, ${theme.bg}ee, ${theme.bg}00)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            zIndex: 150,
                            pointerEvents: showUI ? 'auto' : 'none',
                        }}>
                            <IconButton onClick={() => navigate(-1)} sx={{ color: theme.fg }}>
                                <ArrowBackIcon />
                            </IconButton>
                            <Typography
                                sx={{
                                    color: theme.fg,
                                    fontWeight: 600,
                                    flex: 1,
                                    textAlign: 'center',
                                    mx: 2,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {metadata?.title}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <IconButton onClick={() => openSettings()} sx={{ color: theme.fg }} aria-label="Manatan Settings">
                                    <Box
                                        component="img"
                                        src={ManatanLogo}
                                        alt="Manatan"
                                        sx={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                </IconButton>
                                <IconButton onClick={() => setSettingsOpen(true)} sx={{ color: theme.fg }}>
                                    <SettingsIcon />
                                </IconButton>
                            </Box>
                        </Box>
                    </Fade>
                )}
            />

            <ReaderControls
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                onUpdateSettings={(k, v) => setSettings(p => ({ ...p, [k]: v }))}
                onResetSettings={() => {
                    import('@/Manatan/types').then(({ DEFAULT_SETTINGS }) => {
                        setSettings(prev => ({
                            ...prev,
                            lnFontSize: DEFAULT_SETTINGS.lnFontSize,
                            lnLineHeight: DEFAULT_SETTINGS.lnLineHeight,
                            lnFontFamily: DEFAULT_SETTINGS.lnFontFamily,
                            lnTheme: DEFAULT_SETTINGS.lnTheme,
                            lnReadingDirection: DEFAULT_SETTINGS.lnReadingDirection,
                            lnPaginationMode: DEFAULT_SETTINGS.lnPaginationMode,
                            lnPageWidth: DEFAULT_SETTINGS.lnPageWidth,
                            lnPageMargin: DEFAULT_SETTINGS.lnPageMargin,
                            lnEnableFurigana: DEFAULT_SETTINGS.lnEnableFurigana,
                            lnTextAlign: DEFAULT_SETTINGS.lnTextAlign,
                            lnLetterSpacing: DEFAULT_SETTINGS.lnLetterSpacing,
                            lnParagraphSpacing: DEFAULT_SETTINGS.lnParagraphSpacing,
                        }));
                    });
                }}
                theme={theme}
            />
            {/* Dictionary Popup */}
            <YomitanPopup />
        </Box >
    );
};
