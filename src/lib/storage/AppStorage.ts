/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// eslint-disable-next-line max-classes-per-file
import { jsonSaveParse } from '@/lib/HelperFunctions.ts';
import localforage from 'localforage';

type StorageBackend = typeof window.localStorage | null;

export class Storage {
    private readonly memory = new Map<string, string>();

    constructor(private readonly storage: StorageBackend) {}

    parseValue<T>(value: string | null, defaultValue: T): T {
        if (value === null) {
            return defaultValue;
        }

        const parsedValue = jsonSaveParse(value);

        if (value === 'null' || value === 'undefined') {
            return parsedValue;
        }

        return parsedValue ?? (value as T);
    }

    getItem(key: string): string | null {
        if (!this.storage) {
            return this.memory.get(key) ?? null;
        }

        try {
            return this.storage.getItem(key);
        } catch {
            return this.memory.get(key) ?? null;
        }
    }

    getItemParsed<T>(key: string, defaultValue: T): T {
        return this.parseValue(this.getItem(key), defaultValue);
    }

    setItem(key: string, value: unknown, emitEvent: boolean = true): void {
        const currentValue = this.getItem(key);

        const fireEvent = (valueToStore: string | undefined) => {
            if (!emitEvent) {
                return;
            }

            window.dispatchEvent(
                new StorageEvent('storage', {
                    key,
                    oldValue: currentValue,
                    newValue: valueToStore,
                }),
            );
        };

        if (value === undefined) {
            if (this.storage) {
                try {
                    this.storage.removeItem(key);
                } catch {
                    this.memory.delete(key);
                }
            } else {
                this.memory.delete(key);
            }
            fireEvent(undefined);
            return;
        }

        const stringify = typeof value !== 'string';
        const valueToStore = stringify ? JSON.stringify(value) : value;

        if (this.storage) {
            try {
                this.storage.setItem(key, valueToStore);
            } catch {
                this.memory.set(key, valueToStore);
            }
        } else {
            this.memory.set(key, valueToStore);
        }
        fireEvent(valueToStore as string);
    }

    setItemIfMissing(key: string, value: unknown, emitEvent?: boolean): void {
        if (this.getItem(key) === null) {
            this.setItem(key, value, emitEvent);
        }
    }
}

export interface LNProgress {
    chapterId: string;
    chapterIndex: number;
    // For paginated mode
    pageNumber?: number;
    totalPages?: number;
    // For continuous mode
    scrollPercentage?: number;
    scrollPosition?: number;
    textOffset?: number;
    totalProgress?: number;
    sentenceText?: string;
    // Metadata
    lastRead: number;
}

export class AppStorage {
    static readonly local: Storage = new Storage(AppStorage.getSafeStorage(() => window.localStorage));

    static readonly session: Storage = new Storage(AppStorage.getSafeStorage(() => window.sessionStorage));

    // 1. Files Storage
    static readonly files = localforage.createInstance({
        name: 'Manatan',
        storeName: 'ln_files',
        description: 'Storage for Light Novel EPUB files',
    });

    // 2. Metadata Storage
    static readonly lnMetadata = localforage.createInstance({
        name: 'Manatan',
        storeName: 'ln_metadata',
        description: 'Light Novel metadata',
    });

    // 3. Progress Storage (This was missing causing the first error)
    static readonly lnProgress = localforage.createInstance({
        name: 'Manatan',
        storeName: 'ln_progress',
        description: 'Reading progress tracking',
    });

    // --- HELPER METHODS ---

    // Save reading progress
    static async saveLnProgress(bookId: string, progress: LNProgress): Promise<void> {
        await this.lnProgress.setItem(bookId, {
            ...progress,
            lastRead: Date.now(),
        });
    }

    // Get reading progress
    static async getLnProgress(bookId: string): Promise<LNProgress | null> {
        try {
            return await this.lnProgress.getItem<LNProgress>(bookId);
        } catch (e) {
            console.warn('Failed to load progress:', e);
            return null;
        }
    }

    // Save an EPUB file
    static async saveEpubFile(id: string, file: Blob): Promise<void> {
        await this.files.setItem(id, file);
    }

    // Get an EPUB file as a URL for the reader
    static async getEpubUrl(id: string): Promise<string | null> {
        const blob = await this.files.getItem<Blob>(id);
        return blob ? URL.createObjectURL(blob) : null;
    }

    // Delete everything related to a Light Novel
    static async deleteLnData(id: string): Promise<void> {
        await Promise.all([
            this.files.removeItem(id),
            this.lnMetadata.removeItem(id),
            this.lnProgress.removeItem(id),
        ]);
    }

    private static getSafeStorage(getter: () => StorageBackend): StorageBackend {
        try {
            return getter();
        } catch {
            return null;
        }
    }
}
