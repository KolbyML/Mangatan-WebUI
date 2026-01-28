import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Typography, Grid, IconButton, LinearProgress, Skeleton } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import { AppStorage } from '@/lib/storage/AppStorage';
import { AppRoutes } from '@/base/AppRoute.constants';
import JSZip from 'jszip';
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

export const LNLibrary: React.FC = () => {
    const navigate = useNavigate();
    const [library, setLibrary] = useState<LNMetadata[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadLibrary();
    }, []);

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

    const resizeCover = (blob: Blob): Promise<string> => {
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
    };

    const processSingleFile = async (file: File, tempId: string) => {
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
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Delete this book?")) return;
        setLibrary(prev => prev.filter(ln => ln.id !== id));
        await AppStorage.deleteLnData(id);
    };

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Light Novels</Typography>
                <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    disabled={loading}
                >
                    {loading ? 'Processing...' : 'Import EPUB'}
                    <input type="file" accept=".epub" multiple hidden onChange={handleImport} />
                </Button>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {library.length === 0 && !loading && (
                <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 10 }}>
                    No books found. Import an EPUB to start reading.
                </Typography>
            )}

            <Grid container spacing={2}>
                {library.map((ln) => (
                    <Grid item xs={6} sm={4} md={3} lg={2} key={ln.id}>
                        <Card
                            sx={{
                                cursor: ln.isProcessing ? 'wait' : 'pointer',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                opacity: ln.isProcessing ? 0.7 : 1,
                                position: 'relative'
                            }}
                            onClick={() => !ln.isProcessing && navigate(AppRoutes.ln.childRoutes.reader.path(ln.id))}
                        >
                            <Box sx={{ height: 200, bgcolor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {ln.isProcessing ? (
                                    <Skeleton variant="rectangular" width="100%" height={200} />
                                ) : ln.cover ? (
                                    <img src={ln.cover} alt={ln.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                ) : (
                                    <Typography variant="h3" color="text.disabled">Aa</Typography>
                                )}
                            </Box>

                            {ln.hasProgress && !ln.isProcessing && (
                                <Box sx={{
                                    position: 'absolute', top: 5, right: 5,
                                    bgcolor: 'primary.main', color: 'white',
                                    px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold',
                                    boxShadow: 2
                                }}>
                                    READING
                                </Box>
                            )}

                            <CardContent sx={{ flexGrow: 1, position: 'relative', p: 1.5 }}>
                                {ln.isProcessing ? (
                                    <>
                                        <Skeleton variant="text" width="90%" />
                                        <Skeleton variant="text" width="60%" />
                                    </>
                                ) : (
                                    <>
                                        <Typography variant="subtitle2" noWrap title={ln.title} sx={{ fontWeight: 'bold' }}>
                                            {ln.title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                                            {ln.author}
                                        </Typography>
                                        <IconButton
                                            size="small"
                                            sx={{ position: 'absolute', bottom: 0, right: 0 }}
                                            onClick={(e) => handleDelete(ln.id, e)}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};