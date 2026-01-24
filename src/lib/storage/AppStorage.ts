/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// eslint-disable-next-line max-classes-per-file
import { jsonSaveParse } from '@/lib/HelperFunctions.ts';

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

export class AppStorage {
    static readonly local: Storage = new Storage(AppStorage.getSafeStorage(() => window.localStorage));

    static readonly session: Storage = new Storage(AppStorage.getSafeStorage(() => window.sessionStorage));

    private static getSafeStorage(getter: () => StorageBackend): StorageBackend {
        try {
            return getter();
        } catch {
            return null;
        }
    }
}
