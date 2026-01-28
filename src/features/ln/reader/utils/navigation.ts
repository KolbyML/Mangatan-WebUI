/**
 * Navigation utilities for reader components
 * Handles keyboard, mouse, touch, and click navigation
 */

export interface NavigationOptions {
    isVertical: boolean;
    isRTL: boolean;
    isPaged: boolean;
}

export interface NavigationCallbacks {
    goNext: () => void;
    goPrev: () => void;
    goToStart?: () => void;
    goToEnd?: () => void;
}

export interface TouchState {
    startX: number;
    startY: number;
    startTime: number;
}

export type ClickZone = 'prev' | 'next' | 'center';

/**
 * Create touch state from touch event
 */
export function createTouchState(event: TouchEvent): TouchState {
    return {
        startX: event.touches[0].clientX,
        startY: event.touches[0].clientY,
        startTime: Date.now(),
    };
}

/**
 * Get click zone based on click position
 */
export function getClickZone(
    event: { clientX: number; clientY: number },
    container: HTMLElement,
    options: NavigationOptions
): ClickZone {
    const { isVertical, isRTL } = options;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const zoneSize = 0.25; // 25% on each edge

    if (isVertical) {
        const leftZone = rect.width * zoneSize;
        const rightZone = rect.width * (1 - zoneSize);

        if (x < leftZone) {
            return isRTL ? 'next' : 'prev';
        }
        if (x > rightZone) {
            return isRTL ? 'prev' : 'next';
        }
        return 'center';
    } else {
        const topZone = rect.height * zoneSize;
        const bottomZone = rect.height * (1 - zoneSize);

        if (y < topZone) return 'prev';
        if (y > bottomZone) return 'next';
        return 'center';
    }
}

/**
 * Handle keyboard navigation
 */
export function handleKeyNavigation(
    event: KeyboardEvent,
    options: NavigationOptions,
    callbacks: NavigationCallbacks
): boolean {
    const { isVertical, isRTL } = options;

    switch (event.key) {
        case 'ArrowLeft':
            if (isVertical) {
                if (isRTL) callbacks.goNext();
                else callbacks.goPrev();
                return true;
            }
            break;

        case 'ArrowRight':
            if (isVertical) {
                if (isRTL) callbacks.goPrev();
                else callbacks.goNext();
                return true;
            }
            break;

        case 'ArrowDown':
        case 'PageDown':
            if (!isVertical) {
                callbacks.goNext();
                return true;
            }
            break;

        case 'ArrowUp':
        case 'PageUp':
            if (!isVertical) {
                callbacks.goPrev();
                return true;
            }
            break;

        case ' ':
            if (!event.shiftKey) callbacks.goNext();
            else callbacks.goPrev();
            return true;

        case 'Home':
            callbacks.goToStart?.();
            return true;

        case 'End':
            callbacks.goToEnd?.();
            return true;
    }

    return false;
}

/**
 * Handle mouse wheel navigation
 */
export function handleWheelNavigation(
    event: WheelEvent,
    options: NavigationOptions,
    callbacks: NavigationCallbacks
): boolean {
    const { isVertical, isRTL, isPaged } = options;

    // In continuous mode, let natural scroll happen
    if (!isPaged) return false;

    const delta = isVertical
        ? (event.deltaX !== 0 ? event.deltaX : event.deltaY)
        : event.deltaY;

    if (Math.abs(delta) < 20) return false;

    if (isVertical && isRTL) {
        if (delta > 0) callbacks.goPrev();
        else callbacks.goNext();
    } else if (isVertical) {
        if (delta > 0) callbacks.goNext();
        else callbacks.goPrev();
    } else {
        if (delta > 0) callbacks.goNext();
        else callbacks.goPrev();
    }

    return true;
}

/**
 * Handle touch end for swipe navigation
 */
export function handleTouchEnd(
    event: TouchEvent,
    touchStart: TouchState,
    options: NavigationOptions,
    callbacks: NavigationCallbacks
): 'next' | 'prev' | null {
    const { isVertical, isRTL } = options;

    const deltaX = event.changedTouches[0].clientX - touchStart.startX;
    const deltaY = event.changedTouches[0].clientY - touchStart.startY;
    const deltaTime = Date.now() - touchStart.startTime;

    const minDistance = 50;
    const maxTime = 500;

    if (deltaTime > maxTime) return null;

    if (isVertical) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minDistance) {
            if (isRTL) {
                if (deltaX < 0) {
                    callbacks.goNext();
                    return 'next';
                } else {
                    callbacks.goPrev();
                    return 'prev';
                }
            } else {
                if (deltaX < 0) {
                    callbacks.goPrev();
                    return 'prev';
                } else {
                    callbacks.goNext();
                    return 'next';
                }
            }
        }
    } else {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > minDistance) {
            if (deltaY < 0) {
                callbacks.goNext();
                return 'next';
            } else {
                callbacks.goPrev();
                return 'prev';
            }
        }
    }

    return null;
}

/**
 * Scroll container to start position (handles RTL)
 */
export function scrollToStart(
    container: HTMLElement,
    options: NavigationOptions
): void {
    const { isVertical, isRTL } = options;

    if (isVertical && isRTL) {
        container.scrollLeft = container.scrollWidth - container.clientWidth;
    } else if (isVertical) {
        container.scrollLeft = 0;
    } else {
        container.scrollTop = 0;
    }
}

/**
 * Scroll container to end position
 */
export function scrollToEnd(
    container: HTMLElement,
    options: NavigationOptions
): void {
    const { isVertical, isRTL } = options;

    if (isVertical && isRTL) {
        container.scrollLeft = 0;
    } else if (isVertical) {
        container.scrollLeft = container.scrollWidth - container.clientWidth;
    } else {
        container.scrollTop = container.scrollHeight - container.clientHeight;
    }
}

/**
 * Scroll by viewport amount
 */
export function scrollByViewport(
    container: HTMLElement,
    options: NavigationOptions,
    forward: boolean,
    amount: number = 0.85
): void {
    const { isVertical, isRTL } = options;

    if (isVertical) {
        const scrollAmount = container.clientWidth * amount;
        let delta: number;

        if (isRTL) {
            delta = forward ? -scrollAmount : scrollAmount;
        } else {
            delta = forward ? scrollAmount : -scrollAmount;
        }

        container.scrollBy({ left: delta, behavior: 'smooth' });
    } else {
        const scrollAmount = container.clientHeight * amount;
        container.scrollBy({
            top: forward ? scrollAmount : -scrollAmount,
            behavior: 'smooth',
        });
    }
}

/**
 * Calculate reading progress percentage
 */
export function calculateProgress(
    container: HTMLElement,
    options: NavigationOptions
): number {
    const { isVertical, isRTL } = options;

    if (isVertical) {
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (maxScroll <= 0) return 100;

        if (isRTL) {
            return Math.round((1 - container.scrollLeft / maxScroll) * 100);
        } else {
            return Math.round((container.scrollLeft / maxScroll) * 100);
        }
    } else {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll <= 0) return 100;
        return Math.round((container.scrollTop / maxScroll) * 100);
    }
}