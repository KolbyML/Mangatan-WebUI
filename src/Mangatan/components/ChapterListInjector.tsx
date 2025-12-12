import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ChapterProcessButton } from './ChapterProcessButton';

export const ChapterListInjector: React.FC = () => {
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        checkForChapters(node);
                    }
                });
            });
            checkForChapters(document.body);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        checkForChapters(document.body);

        return () => observer.disconnect();
    }, []);

    const checkForChapters = (root: HTMLElement) => {
        const links = root.querySelectorAll('a[href*="/manga/"][href*="/chapter/"]');
        links.forEach((link) => {
            if (link instanceof HTMLAnchorElement) {
                injectButton(link);
            }
        });
    };

    const injectButton = (link: HTMLAnchorElement) => {
        const moreButton = link.parentElement?.querySelector('button[aria-label="more"]') 
                        || link.closest('tr')?.querySelector('button[aria-label="more"]')
                        || link.parentElement?.parentElement?.querySelector('button[aria-label="more"]');

        if (!moreButton || !moreButton.parentElement) return;

        const container = moreButton.parentElement;

        if (container.querySelector('.ocr-chapter-btn-wrapper')) return;

        // --- CSS FIX START ---
        // Force the container to behave as a flex row to align buttons horizontally
        container.style.display = 'flex';
        container.style.flexDirection = 'row';
        container.style.alignItems = 'center';
        container.style.gap = '10px'; // Add nice spacing between buttons
        // --- CSS FIX END ---

        const wrapper = document.createElement('div');
        wrapper.className = 'ocr-chapter-btn-wrapper';
        // Remove margin since we are using gap on the parent now
        // wrapper.style.marginRight = '8px'; 
        
        container.insertBefore(wrapper, moreButton);

        const root = createRoot(wrapper);
        const urlPath = new URL(link.href).pathname;
        root.render(<ChapterProcessButton chapterPath={urlPath} />);
    };

    return null;
};
