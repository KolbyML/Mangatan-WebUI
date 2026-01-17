import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    Button, 
    IconButton, 
    ListItem, 
    ListItemButton, 
    ListItemIcon, 
    ListItemText, 
    Typography 
} from '@mui/material';
import { useOCR } from '@/Mangatan/context/OCRContext';
import MangatanLogo from '@/Mangatan/assets/mangatan_logo.png';

const READER_DESKTOP_SELECTOR = '.MuiDrawer-paper .MuiDivider-root + .MuiStack-root';
const READER_MOBILE_SELECTOR = 'button[aria-label="Quick settings"]';
const LIBRARY_SETTINGS_SELECTOR = 'a[href="/about"]';

export const SettingsInjector = () => {
    const { openSettings } = useOCR();

    const [readerMount, setReaderMount] = useState<HTMLElement | null>(null);
    const [readerView, setReaderView] = useState<'desktop' | 'mobile' | null>(null);
    const [libraryMount, setLibraryMount] = useState<HTMLElement | null>(null);
    const [isDense, setIsDense] = useState(false);

    const readerRef = useRef<HTMLElement | null>(null);
    const libraryRef = useRef<HTMLElement | null>(null);
    const rafRef = useRef<number | null>(null);


    useEffect(() => {

        const cleanupLibraryMount = () => {
            if (libraryRef.current) {
                const existing = document.getElementById('mangatan-nav-anchor');
                if (existing) existing.remove();
                libraryRef.current = null;
                setLibraryMount(null);
            }
        };

        const scanDOM = () => {
            const isReaderMode = window.location.href.includes('/chapter/');

            if (isReaderMode) { 
                // Clean up app mount when reader opened
                cleanupLibraryMount();

                let targetNode: HTMLElement | null = null;
                let targetView: 'desktop' | 'mobile' | null = null;
                
                const desktopTarget = document.querySelector(READER_DESKTOP_SELECTOR);
                if (desktopTarget) {
                    targetNode = desktopTarget as HTMLElement;
                    targetView = 'desktop';
                } else {
                    const mobileBtn = document.querySelector(READER_MOBILE_SELECTOR);
                    if (mobileBtn && mobileBtn.parentElement) {
                        targetNode = mobileBtn.parentElement;
                        targetView = 'mobile';
                    }
                }

                if (targetNode && readerRef.current !== targetNode) {
                    readerRef.current = targetNode;
                    setReaderMount(targetNode);
                    setReaderView(targetView);
                } else if (!targetNode && readerRef.current) {
                    readerRef.current = null;
                    setReaderMount(null);
                    setReaderView(null);
                }

            } else {
                // Clean up reader mount when reader closed
                if (readerRef.current) {
                    readerRef.current = null;
                    setReaderMount(null);
                    setReaderView(null);
                }
                const aboutLink = document.querySelector(LIBRARY_SETTINGS_SELECTOR);
                
                if (aboutLink && aboutLink.parentNode) {
                    const existingContainer = document.getElementById('mangatan-nav-anchor');
                    
                    if (!existingContainer || existingContainer.nextSibling !== aboutLink) {
                        if (existingContainer) existingContainer.remove();

                        const container = document.createElement('div');
                        container.id = 'mangatan-nav-anchor';
                        container.style.display = 'contents';
                        
                        aboutLink.parentNode.insertBefore(container, aboutLink);
                        libraryRef.current = container;
                        setLibraryMount(container);
                    }

                    const parentList = aboutLink.closest('.MuiList-root');
                    const denseCheck = parentList?.classList.contains('MuiList-dense') ?? false;
                    setIsDense(denseCheck);

                } else {
                    // Cleanup if About link not found
                    cleanupLibraryMount();
                }
            }
        };

        scanDOM();
        
        const handleMutation = () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = requestAnimationFrame(scanDOM);
        };
        const observer = new MutationObserver(handleMutation);
        observer.observe(document.body, { 
            childList: true, 
            subtree: true, 
            attributes: true, 
            attributeFilter: ['class', 'aria-label', 'href'] // Only listen to relevant attr changes
        });

        return () => {
            observer.disconnect();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            const container = document.getElementById('mangatan-nav-anchor');
            if (container) container.remove();
        };
    }, []);

    return (
        <>
            {readerMount && readerView === 'desktop' && createPortal(
                <div style={{ marginTop: '8px', width: '100%', display: 'flex' }}>
                    <Button
                        onClick={openSettings}
                        variant="contained"
                        size="large"
                        sx={{ justifyContent: 'start', textTransform: 'unset', flexGrow: 1 }}
                        startIcon={
                            <img src={MangatanLogo} alt="Logo" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                        }
                    >
                        Mangatan Settings
                    </Button>
                </div>,
                readerMount
            )}

            {readerMount && readerView === 'mobile' && createPortal(
                <IconButton
                    onClick={openSettings}
                    color="inherit"
                    size="medium"
                    aria-label="Mangatan Settings"
                    sx={{ padding: '8px' }}
                >
                    <img src={MangatanLogo} alt="Mangatan" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                </IconButton>,
                readerMount
            )}

            {libraryMount && createPortal(
                // Disable padding as handled in Suwayomi button
                <ListItem disablePadding sx={{ display: 'block', m: 0 }}>
                    <ListItemButton
                        onClick={openSettings}
                        sx={isDense ? {
                            p: 0.5,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center'
                        } : {
                            m: 0
                        }}
                    >
                        <ListItemIcon 
                            sx={isDense ? {
                                justifyContent: 'center',
                                minWidth: 'auto',
                                mb: 0.5
                            } : {
                            }}
                        >
                             <img src={MangatanLogo} alt="Mangatan" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                        </ListItemIcon>
                        
                        <ListItemText 
                            primary={
                                isDense ? (
                                    <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                                        Mangatan
                                    </Typography>
                                ) : (
                                    "Mangatan"
                                )
                            }
                            sx={{ 
                                m: 0,
                                '& .MuiTypography-root': {
                                    fontWeight: 'inherit',
                                    color: 'inherit'
                                }
                            }} 
                        />
                    </ListItemButton>
                </ListItem>,
                libraryMount
            )}
        </>
    );
};