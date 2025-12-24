export interface Rect { x: number; y: number; width: number; height: number; }

export interface OcrBlock {
    text: string;
    tightBoundingBox: Rect;
    forcedOrientation?: 'vertical' | 'horizontal' | 'auto';
    isMerged?: boolean;
}

export interface SiteConfig {
    imageContainerSelectors: string[];
    overflowFixSelector?: string;
    contentRootSelector?: string;
}

export type ColorTheme = 'blue' | 'red' | 'green' | 'orange' | 'purple' | 'turquoise' | 'pink' | 'grey';

export interface ServerSettingsData { authUsername?: string; authPassword?: string; }

export interface Settings {
    interactionMode: 'hover' | 'click';
    colorTheme: ColorTheme;
    brightnessMode: 'light' | 'dark';
    focusFontColor: 'default' | 'black' | 'white' | 'difference';
    dimmedOpacity: number;
    fontMultiplierHorizontal: number;
    fontMultiplierVertical: number;
    focusScaleMultiplier: number;
    boundingBoxAdjustment: number;
    textOrientation: 'smart' | 'forceVertical' | 'forceHorizontal';
    debugMode: boolean;
    mobileMode: boolean;
    soloHoverMode: boolean;
    enableOverlay: boolean;
    addSpaceOnMerge: boolean;
    disableStatusIcon: boolean;
    enableYomitan: boolean;
    deleteModifierKey: string;
    mergeModifierKey: string;
    site: SiteConfig;
}

export type MergeState = { imgSrc: string; index: number; } | null;

// --- MISSING TYPE ADDED HERE ---
export type OcrStatus = 'idle' | 'loading' | 'success' | 'error';

// --- YOMITAN / DICTIONARY TYPES ---

export interface DictionaryResult {
    headword: string;
    reading: string;
    furigana?: string[][]; 
    definitions: DictionaryDefinition[];
    forms?: { headword: string; reading: string }[];
    source?: number;
}

export interface DictionaryDefinition {
    dictionaryName: string;
    tags: string[];
    content: string[];
}

export interface DictPopupState {
    visible: boolean;
    x: number;
    y: number;
    results: DictionaryResult[];
    isLoading: boolean;
    systemLoading?: boolean;
}

// --- GLOBAL DIALOG STATE ---
export interface DialogState {
    isOpen: boolean;
    type: 'alert' | 'confirm' | 'progress';
    title?: string;
    message: React.ReactNode;
    onConfirm?: () => void;
    onCancel?: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
    interactionMode: 'hover',
    colorTheme: 'blue',
    brightnessMode: 'light',
    focusFontColor: 'black',
    dimmedOpacity: 0.3,
    fontMultiplierHorizontal: 1.0,
    fontMultiplierVertical: 1.0,
    focusScaleMultiplier: 1.1,
    boundingBoxAdjustment: 5,
    textOrientation: 'smart',
    debugMode: false,
    mobileMode: false,
    soloHoverMode: true,
    enableOverlay: true,
    addSpaceOnMerge: false,
    disableStatusIcon: false,
    enableYomitan: false,
    deleteModifierKey: 'Alt',
    mergeModifierKey: 'Control',
    site: {
        imageContainerSelectors: [
            'div.muiltr-masn8', 'div.muiltr-79elbk', 'div.muiltr-u43rde',
            'div.muiltr-1r1or1s', 'div.muiltr-18sieki', 'div.muiltr-cns6dc',
            '.MuiBox-root.muiltr-1noqzsz', '.MuiBox-root.muiltr-1tapw32',
            'img[src*="/api/v1/manga/"]',
        ],
        overflowFixSelector: '.MuiBox-root.muiltr-13djdhf',
        contentRootSelector: '#root',
    },
};

export const COLOR_THEMES: Record<ColorTheme, { accent: string; background: string }> = {
    blue: { accent: '#4890ff', background: '#e5f3ff' },
    red: { accent: '#ff484b', background: '#ffe5e6' },
    green: { accent: '#227731', background: '#efffe5' },
    orange: { accent: '#f39c12', background: '#fff5e5' },
    purple: { accent: '#9b59b6', background: '#f5e5ff' },
    turquoise: { accent: '#1abc9c', background: '#e5fffa' },
    pink: { accent: '#ff4dde', background: '#ffe5ff' },
    grey: { accent: '#95a5a6', background: '#e5ecec' },
};