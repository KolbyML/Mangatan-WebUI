
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Button,
    Card,
    CardActionArea,
    Typography,
    IconButton,
    LinearProgress,
    Skeleton,
    Stack,
    MenuItem,
    ListItemIcon,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { styled } from '@mui/material/styles';

import { AppStorage, LNMetadata } from '@/lib/storage/AppStorage';
import { AppRoutes } from '@/base/AppRoute.constants';
import { parseEpub, ParseProgress } from '../services/epubParser';
import { clearBookCache } from '../reader/hooks/useBookContent';

import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useLongPress } from 'use-long-press';
import { Menu } from '@/base/components/menu/Menu';
import { MUIUtil } from '@/lib/mui/MUI.util';
import { MediaQuery } from '@/base/utils/MediaQuery';
import { CustomTooltip } from '@/base/components/CustomTooltip';
import { TypographyMaxLines } from '@/base/components/texts/TypographyMaxLines';
import { MANGA_COVER_ASPECT_RATIO } from '@/features/manga/Manga.constants';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata';
import { useResizeObserver } from '@/base/hooks/useResizeObserver';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext';

interface LibraryItem extends LNMetadata {
    importProgress?: number;
    importMessage?: string;
}

const BottomGradient = styled('div')({
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '30%',
    background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)',
});

const BottomGradientDoubledDown = styled('div')({
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '20%',
    background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)',
});

type LNLibraryCardProps = {
    item: LibraryItem;
    onOpen: (id: string) => void;
    onDelete: (id: string, event: React.MouseEvent) => void;
};

const LNLibraryCard = ({ item, onOpen, onDelete }: LNLibraryCardProps) => {
    const preventMobileContextMenu = MediaQuery.usePreventMobileContextMenu();
    const optionButtonRef = useRef<HTMLButtonElement>(null);

    const longPressBind = useLongPress(
        useCallback((e: any, { context }: any) => {
            (context as () => void)?.();
        }, [])
    );

    const isProcessing = item.isProcessing || false;

    return (
        <PopupState variant="popover" popupId={`ln-card-action-menu-${item.id}`}>
            {(popupState) => (
                <>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            m: 0.25,
                            '@media (hover: hover) and (pointer: fine)': {
                                '&:hover .ln-option-button': {
                                    visibility: 'visible',
                                    pointerEvents: 'all',
                                },
                            },
                        }}
                    >
                        <Card sx={{ aspectRatio: MANGA_COVER_ASPECT_RATIO, display: 'flex' }}>
                            <CardActionArea
                                {...longPressBind(() => popupState.open(optionButtonRef.current))}
                                onClick={() => !isProcessing && onOpen(item.id)}
                                onContextMenu={preventMobileContextMenu}
                                sx={{
                                    position: 'relative',
                                    height: '100%',
                                    cursor: isProcessing ? 'wait' : 'pointer',
                                    opacity: isProcessing ? 0.7 : 1,
                                }}
                            >
                                {isProcessing ? (
                                    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                                        <Skeleton variant="rectangular" width="100%" height="100%" />
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                bottom: 0,
                                                left: 0,
                                                right: 0,
                                                p: 1,
                                                bgcolor: 'rgba(0,0,0,0.7)',
                                            }}
                                        >
                                            <LinearProgress
                                                variant="determinate"
                                                value={item.importProgress || 0}
                                                sx={{ mb: 0.5 }}
                                            />
                                            <Typography variant="caption" sx={{ color: 'white', fontSize: '0.65rem' }}>
                                                {item.importMessage || 'Processing...'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ) : item.cover ? (
                                    <Box
                                        component="img"
                                        src={item.cover}
                                        alt={item.title}
                                        loading="lazy"
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    <Stack
                                        sx={{
                                            height: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            bgcolor: (theme) => theme.palette.background.default,
                                        }}
                                    >
                                        <Typography variant="h3" color="text.disabled">
                                            Aa
                                        </Typography>
                                    </Stack>
                                )}

                                {!isProcessing && (
                                    <>
                                        <Stack
                                            direction="row"
                                            sx={{
                                                alignItems: 'start',
                                                justifyContent: 'space-between',
                                                position: 'absolute',
                                                top: (theme) => theme.spacing(1),
                                                left: (theme) => theme.spacing(1),
                                                right: (theme) => theme.spacing(1),
                                            }}
                                        >
                                            {item.hasProgress ? (
                                                <Box
                                                    sx={{
                                                        bgcolor: 'primary.main',
                                                        color: 'white',
                                                        px: 1,
                                                        py: 0.5,
                                                        borderRadius: 1,
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        boxShadow: 2,
                                                    }}
                                                >
                                                    READING
                                                </Box>
                                            ) : (
                                                <Box />
                                            )}
                                            <CustomTooltip title="Options">
                                                <IconButton
                                                    ref={optionButtonRef}
                                                    {...MUIUtil.preventRippleProp(bindTrigger(popupState), {
                                                        onClick: (event) => {
                                                            event.stopPropagation();
                                                            event.preventDefault();
                                                            popupState.open();
                                                        },
                                                    })}
                                                    className="ln-option-button"
                                                    size="small"
                                                    sx={{
                                                        minWidth: 'unset',
                                                        paddingX: 0,
                                                        paddingY: '2.5px',
                                                        backgroundColor: 'primary.main',
                                                        color: 'common.white',
                                                        '&:hover': { backgroundColor: 'primary.main' },
                                                        visibility: popupState.isOpen ? 'visible' : 'hidden',
                                                        pointerEvents: 'none',
                                                        '@media not (pointer: fine)': {
                                                            visibility: 'hidden',
                                                            width: 0,
                                                            height: 0,
                                                            p: 0,
                                                            m: 0,
                                                        },
                                                    }}
                                                >
                                                    <MoreVertIcon />
                                                </IconButton>
                                            </CustomTooltip>
                                        </Stack>

                                        <BottomGradient />
                                        <BottomGradientDoubledDown />

                                        <Stack
                                            direction="row"
                                            sx={{
                                                justifyContent: 'space-between',
                                                alignItems: 'end',
                                                position: 'absolute',
                                                bottom: 0,
                                                width: '100%',
                                                p: 1,
                                                gap: 1,
                                            }}
                                        >
                                            <CustomTooltip title={item.title} placement="top">
                                                <TypographyMaxLines
                                                    component="h3"
                                                    sx={{
                                                        color: 'white',
                                                        textShadow: '0px 0px 3px #000000',
                                                    }}
                                                >
                                                    {item.title}
                                                </TypographyMaxLines>
                                            </CustomTooltip>
                                        </Stack>
                                    </>
                                )}
                            </CardActionArea>
                        </Card>
                    </Box>

                    {popupState.isOpen && (
                        <Menu {...bindMenu(popupState)}>
                            {(onClose) => (
                                <MenuItem
                                    onClick={(event) => {
                                        onClose();
                                        onDelete(item.id, event);
                                    }}
                                >
                                    <ListItemIcon>
                                        <DeleteIcon fontSize="small" />
                                    </ListItemIcon>
                                    Delete
                                </MenuItem>
                            )}
                        </Menu>
                    )}
                </>
            )}
        </PopupState>
    );
};

export const LNLibrary: React.FC = () => {
    const navigate = useNavigate();
    const [library, setLibrary] = useState<LibraryItem[]>([]);
    const [isImporting, setIsImporting] = useState(false);

    const { navBarWidth } = useNavBarContext();
    const { settings: { mangaGridItemWidth } } = useMetadataServerSettings();

    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState(
        gridWrapperRef.current?.offsetWidth ?? Math.max(0, document.documentElement.offsetWidth - navBarWidth)
    );

    useEffect(() => {
        loadLibrary();
    }, []);

    useResizeObserver(
        gridWrapperRef,
        useCallback(() => {
            const gridWidth = gridWrapperRef.current?.offsetWidth;
            setDimensions(gridWidth ?? document.documentElement.offsetWidth - navBarWidth);
        }, [navBarWidth])
    );

    const gridColumns = Math.max(1, Math.ceil(dimensions / mangaGridItemWidth));

    const loadLibrary = async () => {
        try {
            const keys = await AppStorage.lnMetadata.keys();
            const items: LibraryItem[] = [];

            for (const key of keys) {
                const metadata = await AppStorage.lnMetadata.getItem<LNMetadata>(key);
                if (metadata) {
                    const hasProgress = await AppStorage.lnProgress.getItem(key);
                    items.push({
                        ...metadata,
                        hasProgress: !!hasProgress,
                    });
                }
            }

            setLibrary(items.sort((a, b) => b.addedAt - a.addedAt));
        } catch (e) {
            console.error('Failed to load library:', e);
        }
    };

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        const files = Array.from(e.target.files);
        setIsImporting(true);

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            const file = files[fileIndex];
            const bookId = `ln_${Date.now()}_${fileIndex}`;


            const placeholder: LibraryItem = {
                id: bookId,
                title: file.name.replace('.epub', ''),
                author: '',
                addedAt: Date.now(),
                isProcessing: true,
                importProgress: 0,
                importMessage: 'Starting...',
                stats: { chapterLengths: [], totalLength: 0 },
                chapterCount: 0,
            };

            setLibrary((prev) => [placeholder, ...prev]);

            try {

                const result = await parseEpub(file, bookId, (progress: ParseProgress) => {
                    setLibrary((prev) =>
                        prev.map((item) =>
                            item.id === bookId
                                ? {
                                    ...item,
                                    importProgress: progress.percent,
                                    importMessage: progress.message,
                                }
                                : item
                        )
                    );
                });

                if (result.success && result.metadata && result.content) {

                    await Promise.all([
                        AppStorage.files.setItem(bookId, file),
                        AppStorage.lnMetadata.setItem(bookId, result.metadata),
                        AppStorage.lnContent.setItem(bookId, result.content),
                    ]);


                    setLibrary((prev) =>
                        prev.map((item) =>
                            item.id === bookId
                                ? {
                                    ...result.metadata!,
                                    isProcessing: false,
                                    hasProgress: false,
                                }
                                : item
                        )
                    );

                    console.log(`[Import] Complete: ${result.metadata.title}`);
                    console.log(`[Import] Stats: ${result.metadata.chapterCount} chapters, ${result.metadata.stats.totalLength} chars`);
                } else {

                    setLibrary((prev) =>
                        prev.map((item) =>
                            item.id === bookId
                                ? {
                                    ...item,
                                    isProcessing: false,
                                    isError: true,
                                    errorMsg: result.error || 'Import failed',
                                }
                                : item
                        )
                    );
                }
            } catch (err: any) {
                console.error(`[Import] Error for ${file.name}:`, err);

                setLibrary((prev) =>
                    prev.map((item) =>
                        item.id === bookId
                            ? {
                                ...item,
                                isProcessing: false,
                                isError: true,
                                errorMsg: err.message || 'Unknown error',
                            }
                            : item
                    )
                );
            }
        }

        setIsImporting(false);
        e.target.value = '';
    }, []);

    const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        if (!window.confirm('Delete this book?')) return;


        clearBookCache(id);


        setLibrary((prev) => prev.filter((item) => item.id !== id));


        await AppStorage.deleteLnData(id);
    }, []);

    const handleOpen = useCallback((id: string) => {
        navigate(AppRoutes.ln.childRoutes.reader.path(id));
    }, [navigate]);

    useAppTitle('Light Novels');

    const appAction = useMemo(
        () => (
            <Button
                color="inherit"
                component="label"
                startIcon={<UploadFileIcon />}
                disabled={isImporting}
                sx={{ textTransform: 'none' }}
            >
                {isImporting ? 'Importing...' : 'Import EPUB'}
                <input type="file" accept=".epub" multiple hidden onChange={handleImport} />
            </Button>
        ),
        [handleImport, isImporting]
    );

    useAppAction(appAction, [appAction]);

    return (
        <Box sx={{ p: 1 }}>
            {library.length === 0 && !isImporting && (
                <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 10 }}>
                    No books found. Import an EPUB to start reading.
                </Typography>
            )}

            <Box
                ref={gridWrapperRef}
                sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                    gap: 1,
                }}
            >
                {library.map((item) => (
                    <Box key={item.id}>
                        <LNLibraryCard item={item} onOpen={handleOpen} onDelete={handleDelete} />
                    </Box>
                ))}
            </Box>
        </Box>
    );
};