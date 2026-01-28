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
import { AppStorage } from '@/lib/storage/AppStorage';
import { AppRoutes } from '@/base/AppRoute.constants';
import JSZip from 'jszip';
import PopupState, { bindMenu, bindTrigger } from 'material-ui-popup-state';
import { useLongPress } from 'use-long-press';
import { Menu } from '@/base/components/menu/Menu.tsx';
import { MUIUtil } from '@/lib/mui/MUI.util.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';
import { CustomTooltip } from '@/base/components/CustomTooltip.tsx';
import { TypographyMaxLines } from '@/base/components/texts/TypographyMaxLines.tsx';
import { MANGA_COVER_ASPECT_RATIO } from '@/features/manga/Manga.constants.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';
import { useMetadataServerSettings } from '@/features/settings/services/ServerSettingsMetadata.ts';
import { useResizeObserver } from '@/base/hooks/useResizeObserver.tsx';
import { useNavBarContext } from '@/features/navigation-bar/NavbarContext.tsx';
import { resolvePath } from '../reader/utils/pathUtils';

interface LNMetadata {
    id: string;
    title: string;
    author: string;
    cover?: string;
    addedAt: number;
    isProcessing?: boolean;
    isError?: boolean;
    errorMsg?: string;
    hasProgress?: boolean;
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
    ln: LNMetadata;
    onOpen: (id: string) => void;
    onDelete: (id: string, event: React.MouseEvent) => void;
};

const LNLibraryCard = ({ ln, onOpen, onDelete }: LNLibraryCardProps) => {
    const preventMobileContextMenu = MediaQuery.usePreventMobileContextMenu();
    const optionButtonRef = useRef<HTMLButtonElement>(null);
    const longPressBind = useLongPress(
        useCallback(
            (e: any, { context }: any) => {
                (context as () => void)?.();
            },
            [],
        ),
    );

    return (
        <PopupState variant="popover" popupId={`ln-card-action-menu-${ln.id}`}>
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
                        <Card
                            sx={{
                                aspectRatio: MANGA_COVER_ASPECT_RATIO,
                                display: 'flex',
                            }}
                        >
                            <CardActionArea
                                {...longPressBind(() => popupState.open(optionButtonRef.current))}
                                onClick={() => !ln.isProcessing && onOpen(ln.id)}
                                onContextMenu={preventMobileContextMenu}
                                sx={{
                                    position: 'relative',
                                    height: '100%',
                                    cursor: ln.isProcessing ? 'wait' : 'pointer',
                                    opacity: ln.isProcessing ? 0.7 : 1,
                                }}
                            >
                                {ln.isProcessing ? (
                                    <Skeleton variant="rectangular" width="100%" height="100%" />
                                ) : ln.cover ? (
                                    <Box
                                        component="img"
                                        src={ln.cover}
                                        alt={ln.title}
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
                                    {ln.hasProgress && !ln.isProcessing ? (
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
                                                '&:hover': {
                                                    backgroundColor: 'primary.main',
                                                },
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
                                <>
                                    <BottomGradient />
                                    <BottomGradientDoubledDown />
                                </>
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
                                    {ln.isProcessing ? (
                                        <Skeleton variant="text" width="70%" />
                                    ) : (
                                        <CustomTooltip title={ln.title} placement="top">
                                            <TypographyMaxLines
                                                component="h3"
                                                sx={{
                                                    color: 'white',
                                                    textShadow: '0px 0px 3px #000000',
                                                }}
                                            >
                                                {ln.title}
                                            </TypographyMaxLines>
                                        </CustomTooltip>
                                    )}
                                </Stack>
                            </CardActionArea>
                        </Card>
                    </Box>
                    {popupState.isOpen && (
                        <Menu {...bindMenu(popupState)}>
                            {(onClose) => (
                                <MenuItem
                                    onClick={(event) => {
                                        onClose();
                                        onDelete(ln.id, event);
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
    const [library, setLibrary] = useState<LNMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const { navBarWidth } = useNavBarContext();
    const {
        settings: { mangaGridItemWidth },
    } = useMetadataServerSettings();
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState(
        gridWrapperRef.current?.offsetWidth ?? Math.max(0, document.documentElement.offsetWidth - navBarWidth),
    );

    useEffect(() => {
        loadLibrary();
    }, []);

    useResizeObserver(
        gridWrapperRef,
        useCallback(() => {
            const gridWidth = gridWrapperRef.current?.offsetWidth;
            setDimensions(gridWidth ?? document.documentElement.offsetWidth - navBarWidth);
        }, [navBarWidth]),
    );

    const gridColumns = Math.max(1, Math.ceil(dimensions / mangaGridItemWidth));

    const loadLibrary = async () => {
        try {
            const keys = await AppStorage.lnMetadata.keys();
            const items: LNMetadata[] = [];
            for (const key of keys) {
                const item = await AppStorage.lnMetadata.getItem<LNMetadata>(key);
                const hasProgress = await AppStorage.lnProgress.getItem(key);
                if (item) items.push({ ...item, hasProgress: !!hasProgress });
            }
            setLibrary(items.sort((a, b) => b.addedAt - a.addedAt));
        } catch (e) {
            console.error("Failed to load library:", e);
        }
    };

    const resizeCover = useCallback((blob: Blob): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // Resize to width 300px, maintain aspect ratio
                    const scale = 300 / img.width;
                    canvas.width = 300;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7)); // Save as Base64 JPEG
                } catch {
                    resolve('');
                } finally {
                    URL.revokeObjectURL(url);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve('');
            };
            img.src = url;
        });
    }, []);

    const processSingleFile = useCallback(async (file: File, tempId: string) => {
        console.group(`Processing: ${file.name}`);
        let isSuccess = false;

        try {
            // 1. Save Raw File to storage first
            await AppStorage.saveEpubFile(tempId, file);

            // 2. Open Zip to extract Metadata
            const zip = new JSZip();
            const content = await zip.loadAsync(file);

            // 3. Find OPF
            const containerXml = await content.file("META-INF/container.xml")?.async("string");
            if (!containerXml) throw new Error("Invalid EPUB");

            const parser = new DOMParser();
            const containerDoc = parser.parseFromString(containerXml, "application/xml");
            const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
            if (!opfPath) throw new Error("Missing Rootfile");

            const opfContent = await content.file(opfPath)?.async("string");
            if (!opfContent) throw new Error("Missing OPF");

            const opfDoc = parser.parseFromString(opfContent, "application/xml");

            // 4. Extract Title/Author
            const title = opfDoc.querySelector("metadata > title")?.textContent || file.name.replace('.epub', '');
            const author = opfDoc.querySelector("metadata > creator")?.textContent || "Unknown";

            // 5. Extract Cover
            let coverBase64 = '';
            try {
                // Try standard cover-image property first
                let coverItem = opfDoc.querySelector('manifest > item[properties*="cover-image"]');

                // Fallback to id="cover" if not found
                if (!coverItem) {
                    coverItem = opfDoc.querySelector('manifest > item[id="cover"]')
                        || opfDoc.querySelector('manifest > item[id="cover-image"]');
                }

                if (coverItem) {
                    const href = coverItem.getAttribute("href");
                    if (href) {
                        const fullPath = resolvePath(opfPath, href);
                        const coverBlob = await content.file(fullPath)?.async("blob");
                        if (coverBlob) {
                            coverBase64 = await resizeCover(coverBlob);
                        }
                    }
                }
            } catch (e) {
                console.warn("Cover extraction failed", e);
            }

            const finalMeta: LNMetadata = {
                id: tempId,
                title,
                author,
                cover: coverBase64,
                addedAt: Date.now(),
                isProcessing: false,
                isError: false
            };

            await AppStorage.lnMetadata.setItem(tempId, finalMeta);
            setLibrary(prev => prev.map(item => item.id === tempId ? finalMeta : item));
            isSuccess = true;

        } catch (err: any) {
            console.error("Import Error:", err);

            const fallbackMeta: LNMetadata = {
                id: tempId,
                title: file.name.replace('.epub', ''),
                author: 'Unknown (Parse Error)',
                addedAt: Date.now(),
                isProcessing: false,
                isError: false,
                errorMsg: "Metadata parsing failed."
            };

            if (!isSuccess) {
                await AppStorage.lnMetadata.setItem(tempId, fallbackMeta);
                setLibrary(prev => prev.map(item => item.id === tempId ? fallbackMeta : item));
            }

        } finally {
            console.groupEnd();
        }
    }, [resizeCover]);

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        const files = Array.from(e.target.files);

        const newItems: LNMetadata[] = files.map((file, index) => ({
            id: `ln_${Date.now()}_${index}`,
            title: file.name,
            author: 'Processing...',
            addedAt: Date.now(),
            isProcessing: true
        }));

        setLibrary(prev => [...newItems, ...prev]);
        setLoading(true);

        for (let i = 0; i < files.length; i++) {
            await processSingleFile(files[i], newItems[i].id);
        }

        setLoading(false);
        e.target.value = '';
    }, [processSingleFile]);

    const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Delete this book?")) return;
        setLibrary(prev => prev.filter(ln => ln.id !== id));
        await AppStorage.deleteLnData(id);
    }, []);

    useAppTitle('Light Novels');
    const appAction = useMemo(
        () => (
            <Button
                color="inherit"
                component="label"
                startIcon={<UploadFileIcon />}
                disabled={loading}
                sx={{ textTransform: 'none' }}
            >
                {loading ? 'Processing...' : 'Import EPUB'}
                <input type="file" accept=".epub" multiple hidden onChange={handleImport} />
            </Button>
        ),
        [handleImport, loading],
    );
    useAppAction(appAction, [appAction]);

    return (
        <Box sx={{ p: 1 }}>
            {loading && <LinearProgress sx={{ mb: 1 }} />}

            {library.length === 0 && !loading && (
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
                {library.map((ln) => (
                    <Box key={ln.id}>
                        <LNLibraryCard
                            ln={ln}
                            onOpen={(id) => navigate(AppRoutes.ln.childRoutes.reader.path(id))}
                            onDelete={handleDelete}
                        />
                    </Box>
                ))}
            </Box>
        </Box>
    );
};
