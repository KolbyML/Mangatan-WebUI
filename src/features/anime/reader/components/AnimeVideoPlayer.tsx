/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Slider from '@mui/material/Slider';
import Menu from '@mui/material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Replay10Icon from '@mui/icons-material/Replay10';
import Forward10Icon from '@mui/icons-material/Forward10';
import VideoSettingsIcon from '@mui/icons-material/OndemandVideo';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import SpeedIcon from '@mui/icons-material/Speed';
import CheckIcon from '@mui/icons-material/Check';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { useLocalStorage } from '@/base/hooks/useStorage.tsx';
import { useOCR } from '@/Manatan/context/OCRContext.tsx';
import ManatanLogo from '@/Manatan/assets/manatan_logo.png';
import { lookupYomitan } from '@/Manatan/utils/api.ts';
import { DictionaryResult } from '@/Manatan/types.ts';
import { StructuredContent } from '@/Manatan/components/YomitanPopup.tsx';
import { makeToast } from '@/base/utils/Toast.ts';
import { MediaQuery } from '@/base/utils/MediaQuery.tsx';

type SubtitleTrack = {
    url: string;
    lang: string;
    label?: string;
    source?: 'video' | 'jimaku';
};

type VideoOption = {
    label: string;
    index: number;
};

type EpisodeOption = {
    label: string;
    index: number;
};

type SubtitleCue = {
    start: number;
    end: number;
    text: string;
};

type Props = {
    videoSrc: string;
    enableBraveAudioFix?: boolean;
    braveAudioFixMode?: 'auto' | 'on' | 'off';
    onBraveAudioFixModeChange?: (mode: 'auto' | 'on' | 'off') => void;
    episodeOptions?: EpisodeOption[];
    currentEpisodeIndex?: number | null;
    onEpisodeSelect?: (index: number) => void;
    isHlsSource: boolean;
    videoOptions: VideoOption[];
    selectedVideoIndex: number;
    onVideoChange: (index: number) => void;
    subtitleTracks: SubtitleTrack[];
    subtitleTracksReady: boolean;
    onExit: () => void;
    title: string;
    animeId: string | number;
    fillHeight?: boolean;
    showFullscreenButton?: boolean;
    statusMessage?: string | null;
};

const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

const normalizeSubtitleLabel = (label: string) =>
    label
        .replace(/^jimaku\s*-\s*/i, '')
        .replace(/\.(srt|vtt|ass|ssa)$/i, '')
        .replace(/第\s*\d+\s*話/gi, '')
        .replace(/s\d{1,2}e\d{1,3}/gi, '')
        .replace(/[\[(]\s*\d{1,3}(?:v\d+)?\s*[\])]/gi, '')
        .replace(/-\s*\d{1,3}(?:v\d+)?\b/gi, '')
        .replace(/[^a-z0-9]+/gi, '')
        .toLowerCase();

const buildSubtitleKey = (label: string, source?: SubtitleTrack['source']) => {
    const normalized = normalizeSubtitleLabel(label);
    if (!normalized) {
        return null;
    }
    const resolvedSource = source ?? (label.toLowerCase().startsWith('jimaku -') ? 'jimaku' : 'video');
    return `${resolvedSource}:${normalized}`;
};

const parseTimestamp = (value: string): number => {
    const parts = value.trim().replace(',', '.').split(':');
    const [hours, minutes, seconds] = parts.length === 3 ? parts : ['0', parts[0], parts[1]];
    const [sec, ms = '0'] = seconds.split('.');
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(sec) + Number(ms.padEnd(3, '0')) / 1000;
};

const parseVttOrSrt = (input: string): SubtitleCue[] => {
    const lines = input.replace(/\r/g, '').split('\n');
    const cues: SubtitleCue[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index].trim();
        if (!line) {
            index += 1;
            continue;
        }

        if (/^\d+$/.test(line)) {
            index += 1;
        }

        const timeLine = lines[index] ?? '';
        if (!timeLine.includes('-->')) {
            index += 1;
            continue;
        }

        const [startRaw, endRaw] = timeLine.split('-->').map((part) => part.trim().split(' ')[0]);
        const start = parseTimestamp(startRaw);
        const end = parseTimestamp(endRaw);
        index += 1;
        const textLines: string[] = [];
        while (index < lines.length && lines[index].trim() !== '') {
            textLines.push(lines[index]);
            index += 1;
        }

        const text = textLines.join('\n').replace(/<[^>]+>/g, '');
        cues.push({ start, end, text });
    }

    return cues;
};

const parseAss = (input: string): SubtitleCue[] => {
    const lines = input.replace(/\r/g, '').split('\n');
    const cues: SubtitleCue[] = [];
    let inEvents = false;
    let format: string[] = [];

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('[Events]')) {
            inEvents = true;
            return;
        }
        if (!inEvents) {
            return;
        }
        if (trimmed.startsWith('Format:')) {
            format = trimmed
                .replace('Format:', '')
                .split(',')
                .map((part) => part.trim());
            return;
        }
        if (!trimmed.startsWith('Dialogue:') || !format.length) {
            return;
        }

        const payload = trimmed.replace('Dialogue:', '').trim();
        const parts = payload.split(',');
        const textIndex = format.indexOf('Text');
        const startIndex = format.indexOf('Start');
        const endIndex = format.indexOf('End');
        if (textIndex < 0 || startIndex < 0 || endIndex < 0) {
            return;
        }

        const textParts = parts.slice(textIndex).join(',');
        const rawText = textParts
            .replace(/\{[^}]+\}/g, '')
            .replace(/\\N/g, '\n')
            .replace(/\\n/g, '\n');

        const text = rawText.replace(/<[^>]+>/g, '');

        const start = parseTimestamp(parts[startIndex]);
        const end = parseTimestamp(parts[endIndex]);
        cues.push({ start, end, text });
    });

    return cues;
};

const parseSubtitles = (input: string, url: string): SubtitleCue[] => {
    const trimmed = input.trim();
    const lowerUrl = url.toLowerCase();
    if (trimmed.startsWith('WEBVTT') || lowerUrl.endsWith('.vtt')) {
        return parseVttOrSrt(trimmed);
    }
    if (lowerUrl.endsWith('.srt')) {
        return parseVttOrSrt(trimmed);
    }
    if (lowerUrl.endsWith('.ass') || lowerUrl.endsWith('.ssa') || trimmed.includes('[Events]')) {
        return parseAss(trimmed);
    }

    return parseVttOrSrt(trimmed);
};

export const AnimeVideoPlayer = ({
    videoSrc,
    enableBraveAudioFix = false,
    braveAudioFixMode = 'auto',
    onBraveAudioFixModeChange,
    episodeOptions = [],
    currentEpisodeIndex = null,
    onEpisodeSelect,
    isHlsSource,
    videoOptions,
    selectedVideoIndex,
    onVideoChange,
    subtitleTracks,
    subtitleTracksReady,
    onExit,
    title,
    animeId,
    fillHeight = false,
    showFullscreenButton,
    statusMessage,
}: Props) => {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    const isMobile = MediaQuery.useIsTouchDevice() || useMediaQuery(theme.breakpoints.down('sm'));
    const isLandscape = useMediaQuery('(orientation: landscape)');
    const shouldShowFullscreen = showFullscreenButton ?? isDesktop;
    const { wasPopupClosedRecently, settings, openSettings } = useOCR();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isPaused, setIsPaused] = useState(true);
    const [isOverlayVisible, setIsOverlayVisible] = useState(true);
    const [autoOverlayDisabled, setAutoOverlayDisabled] = useState(false);
    const [activeCues, setActiveCues] = useState<SubtitleCue[]>([]);
    const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | null>(null);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [videoMenuAnchor, setVideoMenuAnchor] = useState<null | HTMLElement>(null);
    const [subtitleMenuAnchor, setSubtitleMenuAnchor] = useState<null | HTMLElement>(null);
    const [speedMenuAnchor, setSpeedMenuAnchor] = useState<null | HTMLElement>(null);
    const [episodeMenuAnchor, setEpisodeMenuAnchor] = useState<null | HTMLElement>(null);
    const [subtitleOffsetMs, setSubtitleOffsetMs] = useLocalStorage<number>(
        `anime-${animeId}-subtitle-offset-ms`,
        0,
    );
    const [savedSubtitleLabel, setSavedSubtitleLabel] = useLocalStorage<string | null>(
        `anime-${animeId}-subtitle-label`,
        null,
    );
    const [savedSubtitleKey, setSavedSubtitleKey] = useLocalStorage<string | null>(
        `anime-${animeId}-subtitle-key`,
        null,
    );
    const [savedPlaybackRate, setSavedPlaybackRate] = useLocalStorage<number | null>(
        `anime-${animeId}-playback-rate`,
        null,
    );
    const [braveBufferSeconds, setBraveBufferSeconds] = useLocalStorage<number>(
        'anime-brave-buffer-seconds',
        20,
    );
    const [braveWarmupSeconds, setBraveWarmupSeconds] = useLocalStorage<number>(
        'anime-brave-warmup-seconds',
        7,
    );
    const [dictionaryVisible, setDictionaryVisible] = useState(false);
    const [dictionaryResults, setDictionaryResults] = useState<DictionaryResult[]>([]);
    const [dictionaryLoading, setDictionaryLoading] = useState(false);
    const [dictionarySystemLoading, setDictionarySystemLoading] = useState(false);
    const [dictionaryQuery, setDictionaryQuery] = useState('');
    const [isBrave, setIsBrave] = useState(false);
    const [isBraveLinux, setIsBraveLinux] = useState(false);
    const [showBraveProxyToggle, setShowBraveProxyToggle] = useState(false);
    const [autoBraveFixDetected, setAutoBraveFixDetected] = useState(false);
    const [isSubtitleDisabled, setIsSubtitleDisabled] = useLocalStorage<boolean>(
        `anime-${animeId}-subtitle-disabled`,
        false,
    );
    const isAnyMenuOpen = Boolean(videoMenuAnchor || subtitleMenuAnchor || speedMenuAnchor || episodeMenuAnchor);
    const lastSubtitleWarningRef = useRef<string | null>(null);
    const lastPlaybackWarningRef = useRef<number | null>(null);
    const subtitleRequestRef = useRef(0);
    const menuInteractionRef = useRef(0);
    const resumePlaybackRef = useRef(false);
    const overlayVisibilityRef = useRef(false);
    const braveMutedRef = useRef(false);
    const braveVolumeRef = useRef<number | null>(null);
    const braveResetPendingRef = useRef(false);
    const userPausedRef = useRef(false);
    const hlsRef = useRef<Hls | null>(null);
    const hlsManifestReadyRef = useRef(false);
    const braveResetScheduledRef = useRef(false);
    const braveScheduleRef = useRef<((instance: Hls) => void) | null>(null);
    const shouldApplyBraveFix =
        isBraveLinux &&
        enableBraveAudioFix &&
        (braveAudioFixMode === 'on' || (braveAudioFixMode === 'auto' && autoBraveFixDetected));
    const braveSegmentDurationRef = useRef<number | null>(null);
    const [isPageFullscreen, setIsPageFullscreen] = useState(false);

    useEffect(() => {
        if (isPaused && !dictionaryVisible && !autoOverlayDisabled) {
            setIsOverlayVisible(true);
        }
    }, [autoOverlayDisabled, isPaused, dictionaryVisible]);

    const subtitleOptions = useMemo(
        () =>
            subtitleTracks.map((track, index) => ({
                index,
                label: track.label || track.lang || `Subtitle ${index + 1}`,
            })),
        [subtitleTracks],
    );

    useEffect(() => {
        if (!isPageFullscreen) {
            document.body.style.overflow = '';
            return;
        }

        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isPageFullscreen]);

    useEffect(() => {
        if (!isMobile || !fillHeight) {
            return;
        }
        const orientation = screen?.orientation;
        if (orientation?.lock) {
            orientation.lock('landscape').catch(() => {});
        }
        return () => {
            orientation?.unlock?.();
        };
    }, [fillHeight, isMobile]);

    useEffect(() => {
        const storedLabel = savedSubtitleLabel ?? undefined;
        if (isSubtitleDisabled) {
            setSelectedSubtitleIndex(null);
            return;
        }
        if (!storedLabel && !savedSubtitleKey) {
            setSelectedSubtitleIndex(null);
            return;
        }

        const shouldWaitForJimaku =
            (storedLabel?.toLowerCase().startsWith('jimaku -') ?? false) ||
            (savedSubtitleKey?.startsWith('jimaku:') ?? false);
        if (!subtitleTracksReady && shouldWaitForJimaku) {
            setSelectedSubtitleIndex(null);
            return;
        }

        const desiredSource = savedSubtitleKey?.split(':')[0];
        let matchIndex = storedLabel
            ? subtitleOptions.findIndex((option) => option.label === storedLabel)
            : -1;
        if (matchIndex >= 0) {
            const matchedTrack = subtitleTracks[matchIndex];
            if (desiredSource && desiredSource === 'jimaku' && matchedTrack?.source !== 'jimaku') {
                setSelectedSubtitleIndex(null);
            } else {
                setSelectedSubtitleIndex(matchIndex);
                const matchedKey = buildSubtitleKey(subtitleOptions[matchIndex].label, matchedTrack?.source);
                if (matchedKey && matchedKey !== savedSubtitleKey) {
                    setSavedSubtitleKey(matchedKey);
                }
                return;
            }
        }

        const fallbackKey = storedLabel ? buildSubtitleKey(storedLabel) : null;
        const effectiveKey = savedSubtitleKey ?? fallbackKey;
        if (effectiveKey) {
            const [desiredSource, desiredNormalized] = effectiveKey.split(':');
            const candidates = subtitleOptions
                .map((option) => ({
                    option,
                    normalized: normalizeSubtitleLabel(option.label),
                }))
                .filter((entry) => entry.normalized === desiredNormalized);
            if (candidates.length) {
                const withSource = candidates.find(
                    (entry) => subtitleTracks[entry.option.index]?.source === desiredSource,
                );
                const chosen = withSource ?? (desiredSource === 'jimaku' ? null : candidates[0]);
                if (!chosen) {
                    // Wait for Jimaku-specific match.
                    return;
                }
                setSelectedSubtitleIndex(chosen.option.index);
                if (chosen.option.label !== storedLabel) {
                    setSavedSubtitleLabel(chosen.option.label);
                }
                if (savedSubtitleKey !== effectiveKey) {
                    setSavedSubtitleKey(effectiveKey);
                }
                return;
            }
        }

        if (subtitleOptions.length && lastSubtitleWarningRef.current !== storedLabel) {
            makeToast(`Subtitle preset "${storedLabel}" is not available for this episode.`, 'warning');
            lastSubtitleWarningRef.current = storedLabel ?? null;
        }
        setSelectedSubtitleIndex(null);
    }, [
        isSubtitleDisabled,
        savedSubtitleKey,
        savedSubtitleLabel,
        setSavedSubtitleKey,
        setSavedSubtitleLabel,
        subtitleOptions,
        subtitleTracks,
        subtitleTracksReady,
    ]);

    useEffect(() => {
        if (savedPlaybackRate === null || savedPlaybackRate === undefined) {
            return;
        }
        if (!playbackRates.includes(savedPlaybackRate)) {
            if (lastPlaybackWarningRef.current !== savedPlaybackRate) {
                makeToast(`Playback speed preset ${savedPlaybackRate}x is unavailable.`, 'warning');
                lastPlaybackWarningRef.current = savedPlaybackRate;
            }
            setSavedPlaybackRate(null);
            applyPlaybackRate(1);
            return;
        }
        applyPlaybackRate(savedPlaybackRate);
    }, [savedPlaybackRate]);

    const markMenuInteraction = useCallback(() => {
        menuInteractionRef.current = Date.now();
    }, []);

    const shouldIgnoreOverlayToggle = () => Date.now() - menuInteractionRef.current < 250;

    const braveAudioFixLabel = useMemo(() => {
        switch (braveAudioFixMode) {
            case 'on':
                return 'On';
            case 'off':
                return 'Off';
            default:
                return 'Auto';
        }
    }, [braveAudioFixMode]);

    const handleBraveAudioFixToggle = () => {
        if (!onBraveAudioFixModeChange) {
            return;
        }
        const nextMode =
            braveAudioFixMode === 'auto'
                ? 'on'
                : braveAudioFixMode === 'on'
                    ? 'off'
                    : 'auto';
        onBraveAudioFixModeChange(nextMode);
    };

    useEffect(() => {
        if (!episodeMenuAnchor || currentEpisodeIndex === null) {
            return;
        }
        const timeout = window.setTimeout(() => {
            const target = document.getElementById(`episode-option-${currentEpisodeIndex}`);
            target?.scrollIntoView({ block: 'center' });
        }, 50);
        return () => window.clearTimeout(timeout);
    }, [episodeMenuAnchor, currentEpisodeIndex, episodeOptions]);

    useEffect(() => {
        let isMounted = true;
        const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
        const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
            .userAgentData?.brands;
        const hasBraveBrand = brands?.some((entry) => entry.brand.toLowerCase().includes('brave')) ?? false;
        const hasBraveObject = Boolean(nav.brave);
        const uaLower = navigator.userAgent.toLowerCase();
        const uaHasBrave = uaLower.includes('brave');
        const platformLower = (navigator.platform || '').toLowerCase();
        const isLinux = uaLower.includes('linux') || platformLower.includes('linux');
        if (hasBraveBrand || hasBraveObject || uaHasBrave) {
            setShowBraveProxyToggle(true);
            setIsBraveLinux(isLinux);
        }
        if (nav.brave?.isBrave) {
            nav.brave
                .isBrave()
                .then((result) => {
                    if (isMounted) {
                        setIsBrave(Boolean(result));
                        if (result) {
                            setShowBraveProxyToggle(true);
                            setIsBraveLinux(isLinux);
                        }
                    }
                })
                .catch(() => {});
        } else if (navigator.userAgent.includes('Brave')) {
            setIsBrave(true);
            setShowBraveProxyToggle(true);
            setIsBraveLinux(isLinux);
        }
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isBraveLinux || !enableBraveAudioFix || braveAudioFixMode !== 'auto' || !isHlsSource || !videoSrc) {
            setAutoBraveFixDetected(false);
            return () => {};
        }
        const controller = new AbortController();
        fetch(videoSrc, { credentials: 'include', signal: controller.signal })
            .then((response) => response.text())
            .then((text) => {
                const lower = text.toLowerCase();
                const hasAudioFixTag = lower.includes('#x-mangatan-audiofix');
                setAutoBraveFixDetected(hasAudioFixTag);
            })
            .catch(() => {
                setAutoBraveFixDetected(false);
            });
        return () => controller.abort();
    }, [videoSrc, isHlsSource, isBraveLinux, enableBraveAudioFix, braveAudioFixMode]);

    useEffect(() => {
        if (!shouldApplyBraveFix || braveResetScheduledRef.current) {
            return;
        }
        if (!hlsRef.current || !hlsManifestReadyRef.current || !braveScheduleRef.current) {
            return;
        }
        braveScheduleRef.current(hlsRef.current);
    }, [shouldApplyBraveFix]);

    useEffect(() => {
        if (selectedSubtitleIndex === null) {
            return;
        }
        if (selectedSubtitleIndex >= subtitleTracks.length) {
            setSelectedSubtitleIndex(null);
        }
    }, [selectedSubtitleIndex, subtitleTracks.length]);

    useEffect(() => {
        const video = videoRef.current;
        const shouldUseHls = isHlsSource;
        if (!video || !videoSrc) {
            return () => {};
        }

        let playTimeout: number | null = null;
        const braveResetTimeouts: number[] = [];
        userPausedRef.current = false;
        let bravePlayHandler: (() => void) | null = null;
        const playWhenBuffered = (minBufferSeconds: number, onReady?: () => void) => {
            if (!video) {
                return;
            }
            if (playTimeout !== null) {
                window.clearTimeout(playTimeout);
            }
            const buffered = video.buffered;
            if (buffered.length) {
                const end = buffered.end(buffered.length - 1);
                if (end - video.currentTime >= minBufferSeconds) {
                    if (onReady) {
                        onReady();
                    } else {
                        video.play().catch(() => {});
                    }
                    return;
                }
            }
            playTimeout = window.setTimeout(() => playWhenBuffered(minBufferSeconds, onReady), 500);
        };
        const restoreBraveAudio = () => {
            if (!video) {
                return;
            }
            video.muted = braveMutedRef.current;
            if (braveVolumeRef.current !== null) {
                video.volume = braveVolumeRef.current;
            }
        };
        const clearBraveResets = () => {
            braveResetTimeouts.forEach((timeout) => window.clearTimeout(timeout));
            braveResetTimeouts.length = 0;
            braveResetPendingRef.current = false;
            if (bravePlayHandler) {
                video.removeEventListener('play', bravePlayHandler as EventListener);
                bravePlayHandler = null;
            }
            braveResetScheduledRef.current = false;
        };
        const scheduleBraveAudioResets = (hlsInstance: Hls) => {
            if (!shouldApplyBraveFix) {
                return;
            }
            clearBraveResets();
            const baseDelayMs = Math.max(1, braveWarmupSeconds) * 1000;
            const delayMs = Math.min(2000, baseDelayMs);
            const maxAttempts = 8;
            const attemptReset = (attempt: number) => {
                if (video.paused) {
                    braveResetPendingRef.current = true;
                    return;
                }
                const current = Math.max(video.currentTime, 0.1);
                const segmentDuration = braveSegmentDurationRef.current ?? 6;
                const segmentIndex = Math.floor(current / segmentDuration);
                const boundaryTarget = (segmentIndex + 2) * segmentDuration;
                const boundedTarget = Math.min(boundaryTarget, video.duration || boundaryTarget);
                const segmentJump = boundedTarget > current + 0.5
                    ? boundedTarget
                    : current + segmentDuration;
                const buffered = video.buffered;
                const bufferEnd = buffered.length ? buffered.end(buffered.length - 1) : 0;
                if (bufferEnd < segmentJump - 0.25 && attempt < maxAttempts) {
                    const retryTimeout = window.setTimeout(() => attemptReset(attempt + 1), 400);
                    braveResetTimeouts.push(retryTimeout);
                    return;
                }
                braveMutedRef.current = video.muted;
                braveVolumeRef.current = video.volume;
                video.muted = true;
                video.volume = 0;
                hlsInstance.stopLoad();
                if (typeof hlsInstance.swapAudioCodec === 'function') {
                    hlsInstance.swapAudioCodec();
                }
                hlsInstance.recoverMediaError();
                hlsInstance.startLoad(segmentJump);
                video.currentTime = segmentJump;
                setTimeout(() => {
                    video.currentTime = current;
                }, 250);
                video.muted = braveMutedRef.current;
                if (braveVolumeRef.current !== null) {
                    video.volume = braveVolumeRef.current;
                }
                video.play().catch(() => {});
            };
            if (video.paused) {
                braveResetPendingRef.current = true;
                if (!bravePlayHandler) {
                    bravePlayHandler = () => {
                        braveResetPendingRef.current = false;
                        scheduleBraveAudioResets(hlsInstance);
                    };
                    video.addEventListener('play', bravePlayHandler as EventListener, { once: true });
                }
                return;
            }
            const timeout = window.setTimeout(() => attemptReset(0), delayMs);
            braveResetTimeouts.push(timeout);
            braveResetScheduledRef.current = true;
        };
        braveScheduleRef.current = scheduleBraveAudioResets;
        const attemptPlay = (force = false) => {
            if (!force && userPausedRef.current) {
                return;
            }
            if (isBrave && shouldUseHls) {
                playWhenBuffered(Math.max(1, Math.min(3, braveBufferSeconds)));
                return;
            }
            if (isBrave) {
                playWhenBuffered(Math.max(1, Math.min(3, braveBufferSeconds)));
                return;
            }
            video.play().catch(() => {});
        };

        if (!shouldUseHls) {
            video.src = videoSrc;
            video.load();
            userPausedRef.current = false;
            attemptPlay(true);
            return () => {
                if (playTimeout !== null) {
                    window.clearTimeout(playTimeout);
                }
                clearBraveResets();
                restoreBraveAudio();
            };
        }

        if (!isBrave && video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoSrc;
            video.load();
            userPausedRef.current = false;
            attemptPlay(true);
            return () => {
                if (playTimeout !== null) {
                    window.clearTimeout(playTimeout);
                }
                clearBraveResets();
                restoreBraveAudio();
            };
        }

        if (!Hls.isSupported()) {
            video.src = videoSrc;
            video.load();
            userPausedRef.current = false;
            attemptPlay(true);
            return () => {
                if (playTimeout !== null) {
                    window.clearTimeout(playTimeout);
                }
                clearBraveResets();
                restoreBraveAudio();
            };
        }

        const hls = new Hls(
            isBrave
                ? {
                    enableWorker: false,
                    lowLatencyMode: false,
                    maxBufferLength: 120,
                    maxBufferSize: 120 * 1000 * 1000,
                    backBufferLength: 30,
                }
                : { enableWorker: true, lowLatencyMode: true },
        );
        hlsRef.current = hls;
        hlsManifestReadyRef.current = false;
        hls.loadSource(videoSrc);
        hls.attachMedia(video);
        hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
            const targetDuration = data?.details?.targetduration;
            if (targetDuration && targetDuration > 0) {
                braveSegmentDurationRef.current = targetDuration;
            }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            hlsManifestReadyRef.current = true;
            attemptPlay(true);
            if (shouldApplyBraveFix) {
                scheduleBraveAudioResets(hls);
            }
        });
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
            if (isBrave) {
                attemptPlay();
            }
        });
        return () => {
            if (playTimeout !== null) {
                window.clearTimeout(playTimeout);
            }
            clearBraveResets();
            restoreBraveAudio();
            hlsRef.current = null;
            hlsManifestReadyRef.current = false;
            hls.destroy();
        };
    }, [
        videoSrc,
        isHlsSource,
        isBrave,
        isBraveLinux,
        braveBufferSeconds,
        braveWarmupSeconds,
        enableBraveAudioFix,
        shouldApplyBraveFix,
        braveAudioFixMode,
        autoBraveFixDetected,
    ]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return () => {};

        const onPlay = () => {
            userPausedRef.current = false;
            setIsPaused(false);
        };
        const onPause = () => {
            setIsPaused(true);
        };
        const onTimeUpdate = () => setCurrentTime(video.currentTime);
        const onDurationChange = () => setDuration(video.duration || 0);
        const onProgress = () => {
            if (!video.duration || !video.buffered.length) {
                setBuffered(0);
                return;
            }
            const end = video.buffered.end(video.buffered.length - 1);
            setBuffered(Math.min(end / video.duration, 1));
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('durationchange', onDurationChange);
        video.addEventListener('progress', onProgress);
        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('durationchange', onDurationChange);
            video.removeEventListener('progress', onProgress);
        };
    }, []);

    useEffect(() => {
        subtitleRequestRef.current += 1;
        const requestId = subtitleRequestRef.current;
        if (selectedSubtitleIndex === null) {
            setSubtitleCues([]);
            return;
        }

        const track = subtitleTracks[selectedSubtitleIndex];
        if (!track) {
            setSubtitleCues([]);
            return;
        }

        const isJimakuTrack = track.source === 'jimaku';
        const jimakuApiKey = settings.jimakuApiKey?.trim();
        if (isJimakuTrack && !jimakuApiKey) {
            setSubtitleCues([]);
            return;
        }

        const resolvedUrl = track.url.startsWith('http')
            ? track.url
            : track.url.startsWith('/api')
                ? `${requestManager.getBaseUrl()}${track.url}`
                : `${requestManager.getBaseUrl()}/${track.url}`

        const abortController = new AbortController();
        const requestInit: RequestInit = isJimakuTrack
            ? {
                headers: {
                    Authorization: jimakuApiKey ?? '',
                },
                signal: abortController.signal,
            }
            : { credentials: 'include', signal: abortController.signal };

        console.debug('[AnimeVideoPlayer] Loading subtitles', {
            index: selectedSubtitleIndex,
            lang: track.lang,
            url: resolvedUrl,
        });

        fetch(resolvedUrl, requestInit)
            .then((response) => response.text())
            .then((text) => {
                if (subtitleRequestRef.current !== requestId) {
                    return;
                }
                const cues = parseSubtitles(text, resolvedUrl);
                console.debug('[AnimeVideoPlayer] Subtitle cues parsed', { count: cues.length });
                setSubtitleCues(cues);
            })
            .catch((error) => {
                if (abortController.signal.aborted) {
                    return;
                }
                console.error('[AnimeVideoPlayer] Subtitle load failed', error);
                if (subtitleRequestRef.current === requestId) {
                    setSubtitleCues([]);
                }
            });
        return () => {
            abortController.abort();
        };
    }, [selectedSubtitleIndex, settings.jimakuApiKey, subtitleTracks]);

    useEffect(() => {
        if (!subtitleCues.length) {
            setActiveCues([]);
            return;
        }

        const offsetSeconds = subtitleOffsetMs / 1000;
        setActiveCues(
            subtitleCues.filter(
                (cue) => currentTime + offsetSeconds >= cue.start && currentTime + offsetSeconds <= cue.end,
            ),
        );
    }, [currentTime, subtitleCues, subtitleOffsetMs]);

    const sortedSubtitleCues = useMemo(
        () => [...subtitleCues].sort((a, b) => a.start - b.start),
        [subtitleCues],
    );

    const handleSubtitleClick = async (event: React.MouseEvent<HTMLDivElement>, text: string) => {
        event.stopPropagation();
        if (wasPopupClosedRecently()) {
            return;
        }

        const element = event.currentTarget;
        const rangeFromPoint = document.caretRangeFromPoint?.(event.clientX, event.clientY);
        const caretPosition = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        let charOffset = 0;

        if (rangeFromPoint) {
            const range = document.createRange();
            range.setStart(element, 0);
            range.setEnd(rangeFromPoint.startContainer, rangeFromPoint.startOffset);
            charOffset = range.toString().length;
        } else if (caretPosition) {
            const range = document.createRange();
            range.setStart(element, 0);
            range.setEnd(caretPosition.offsetNode, caretPosition.offset);
            charOffset = range.toString().length;
        }

        const encoder = new TextEncoder();
        const byteIndex = encoder.encode(text.substring(0, charOffset)).length;

        const video = videoRef.current;
        if (!dictionaryVisible) {
            resumePlaybackRef.current = Boolean(video && !video.paused);
            overlayVisibilityRef.current = isOverlayVisible;
        }
        setIsPageFullscreen(false);
        video?.pause();

        setDictionaryVisible(true);
        setDictionaryQuery(text);
        setDictionaryResults([]);
        setDictionaryLoading(true);
        setDictionarySystemLoading(false);
        setIsOverlayVisible(false);

        const results = await lookupYomitan(text, byteIndex, settings.resultGroupingMode);
        if (results === 'loading') {
            setDictionaryLoading(false);
            setDictionarySystemLoading(true);
        } else {
            setDictionaryResults(results || []);
            setDictionaryLoading(false);
            setDictionarySystemLoading(false);
        }
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            userPausedRef.current = false;
            video
                .play()
                .catch(() => {
                    setIsOverlayVisible(true);
                });
        } else {
            userPausedRef.current = true;
            video.pause();
        }
    };

    const resumeFromDictionary = () => {
        const video = videoRef.current;
        const shouldResume = resumePlaybackRef.current;
        const previousOverlayVisible = overlayVisibilityRef.current;
        setDictionaryVisible(false);
        if (!video || !shouldResume) {
            setIsOverlayVisible(previousOverlayVisible);
            return;
        }
        userPausedRef.current = false;
        video
            .play()
            .then(() => setIsOverlayVisible(false))
            .catch(() => setIsOverlayVisible(previousOverlayVisible));
    };

    const handleOverlayToggle = () => {
        if (dictionaryVisible) {
            return;
        }
        setIsOverlayVisible((prev) => {
            const next = !prev;
            setAutoOverlayDisabled(!next);
            return next;
        });
    };

    const isFullHeight = fillHeight || isPageFullscreen;
    const wrapperFixed = isPageFullscreen || (fillHeight && isMobile);
    const wrapperFullBleed = isFullHeight;

    const handleSeek = (_: Event, value: number | number[]) => {
        const video = videoRef.current;
        if (!video || typeof value !== 'number') {
            return;
        }
        const nextTime = (value / 100) * duration;
        video.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    const formatTime = (value: number) => {
        if (!Number.isFinite(value) || value <= 0) {
            return '0:00';
        }
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const seconds = Math.floor(value % 60);
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const applyPlaybackRate = (rate: number) => {
        const video = videoRef.current;
        if (video) {
            video.playbackRate = rate;
        }
        setPlaybackRate(rate);
    };

    const renderSelectionIcon = useCallback(
        (isSelected: boolean) => (isSelected ? <CheckIcon fontSize="small" /> : <Box sx={{ width: 18, height: 18 }} />),
        [],
    );

    const handleSubtitleChange = useCallback(
        (index: number | null) => {
            setSelectedSubtitleIndex(index);
            if (index === null) {
                setSavedSubtitleLabel(null);
                setSavedSubtitleKey(null);
                setIsSubtitleDisabled(true);
                return;
            }
            setIsSubtitleDisabled(false);
            const option = subtitleOptions[index];
            const track = subtitleTracks[index];
            const label = option?.label ?? null;
            setSavedSubtitleLabel(label);
            if (label) {
                setSavedSubtitleKey(buildSubtitleKey(label, track?.source));
            }
        },
        [setIsSubtitleDisabled, setSavedSubtitleKey, setSavedSubtitleLabel, subtitleOptions, subtitleTracks],
    );

    const subtitleMenuItems = useMemo(
        () =>
            subtitleOptions.map((option) => {
                const isSelected = option.index === selectedSubtitleIndex;
                return (
                    <MenuItem
                        key={option.index}
                        selected={isSelected}
                        onClick={(event) => {
                            event.stopPropagation();
                            markMenuInteraction();
                            handleSubtitleChange(option.index);
                            setSubtitleMenuAnchor(null);
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 32 }}>{renderSelectionIcon(isSelected)}</ListItemIcon>
                        <ListItemText primary={option.label} />
                    </MenuItem>
                );
            }),
        [handleSubtitleChange, markMenuInteraction, renderSelectionIcon, selectedSubtitleIndex, subtitleOptions],
    );

    const handlePlaybackChange = (rate: number) => {
        applyPlaybackRate(rate);
        setSavedPlaybackRate(rate);
    };

    const seekBy = (delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        const nextTime = Math.min(Math.max(video.currentTime + delta, 0), duration || video.currentTime);
        video.currentTime = nextTime;
        setCurrentTime(nextTime);
    };

    const seekToTime = (targetTime: number) => {
        const video = videoRef.current;
        if (!video) return;
        const safeTime = Math.min(Math.max(targetTime, 0), duration || targetTime);
        video.currentTime = safeTime;
        setCurrentTime(safeTime);
    };

    const skipToPreviousSubtitle = () => {
        if (!activeCues.length) {
            seekBy(-10);
            return;
        }
        if (!sortedSubtitleCues.length) {
            seekBy(-10);
            return;
        }
        const offsetSeconds = subtitleOffsetMs / 1000;
        const effectiveTime = currentTime + offsetSeconds;
        const epsilon = 0.05;
        for (let i = sortedSubtitleCues.length - 1; i >= 0; i -= 1) {
            const cue = sortedSubtitleCues[i];
            if (cue.start < effectiveTime - epsilon) {
                seekToTime(cue.start - offsetSeconds);
                return;
            }
        }
        seekToTime(sortedSubtitleCues[0].start - offsetSeconds);
    };

    const skipToNextSubtitle = () => {
        if (!activeCues.length) {
            seekBy(10);
            return;
        }
        if (!sortedSubtitleCues.length) {
            seekBy(10);
            return;
        }
        const offsetSeconds = subtitleOffsetMs / 1000;
        const effectiveTime = currentTime + offsetSeconds;
        const epsilon = 0.05;
        for (let i = 0; i < sortedSubtitleCues.length; i += 1) {
            const cue = sortedSubtitleCues[i];
            if (cue.start > effectiveTime + epsilon) {
                seekToTime(cue.start - offsetSeconds);
                return;
            }
        }
        const lastCue = sortedSubtitleCues[sortedSubtitleCues.length - 1];
        seekToTime(lastCue.start - offsetSeconds);
    };

    const episodeMenuItems = useMemo(
        () =>
            episodeOptions.map((option) => {
                const isSelected = option.index === currentEpisodeIndex;
                return (
                    <MenuItem
                        key={option.index}
                        id={`episode-option-${option.index}`}
                        selected={isSelected}
                        onClick={(event) => {
                            event.stopPropagation();
                            markMenuInteraction();
                            onEpisodeSelect?.(option.index);
                            setEpisodeMenuAnchor(null);
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 32 }}>{renderSelectionIcon(isSelected)}</ListItemIcon>
                        <ListItemText primary={option.label} />
                    </MenuItem>
                );
            }),
        [currentEpisodeIndex, episodeOptions, markMenuInteraction, onEpisodeSelect, renderSelectionIcon],
    );

    const videoMenuItems = useMemo(
        () =>
            videoOptions.map((option) => {
                const isSelected = option.index === selectedVideoIndex;
                return (
                    <MenuItem
                        key={option.index}
                        selected={isSelected}
                        onClick={(event) => {
                            event.stopPropagation();
                            markMenuInteraction();
                            onVideoChange(option.index);
                            setVideoMenuAnchor(null);
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 32 }}>{renderSelectionIcon(isSelected)}</ListItemIcon>
                        <ListItemText primary={option.label} />
                    </MenuItem>
                );
            }),
        [markMenuInteraction, onVideoChange, renderSelectionIcon, selectedVideoIndex, videoOptions],
    );

    return (
        <Box
            sx={{
                position: wrapperFixed ? 'fixed' : 'relative',
                inset: wrapperFixed ? 0 : 'auto',
                width: '100%',
                height: wrapperFullBleed ? '100%' : 'auto',
                backgroundColor: 'black',
                borderRadius: wrapperFullBleed ? 0 : 1,
                overflow: 'hidden',
                zIndex: wrapperFixed ? 1400 : 'auto',
                display: wrapperFixed ? 'flex' : 'block',
                alignItems: wrapperFixed ? 'center' : 'stretch',
                justifyContent: wrapperFixed ? 'center' : 'stretch',
                padding: wrapperFullBleed
                    ? 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
                    : 0,
                boxSizing: 'border-box',
            }}
            onClick={() => {
                if (dictionaryVisible) {
                    resumeFromDictionary();
                    return;
                }
                if (isAnyMenuOpen || shouldIgnoreOverlayToggle()) {
                    return;
                }
                handleOverlayToggle();
            }}
        >
            <Box
                sx={{
                    position: 'relative',
                    width: '100%',
                    height: isFullHeight ? '100%' : 'auto',
                    aspectRatio: isFullHeight ? 'auto' : '16 / 9',
                    backgroundColor: 'black',
                    borderRadius: wrapperFullBleed ? 0 : 1,
                    overflow: 'hidden',
                }}
            >
                <Box
                component="video"
                ref={videoRef}
                playsInline
                autoPlay
                preload="metadata"
                crossOrigin="use-credentials"
                sx={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: 'black' }}
            />
            {statusMessage && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#cbd0d6',
                        textAlign: 'center',
                        px: 2,
                        zIndex: 4,
                        pointerEvents: 'none',
                    }}
                >
                    <Typography variant="body2">{statusMessage}</Typography>
                </Box>
            )}
            <Stack
                sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: isMobile
                        ? isLandscape
                            ? 'calc(env(safe-area-inset-bottom) + 28px)'
                            : 'calc(env(safe-area-inset-bottom) + 84px)'
                        : 48,
                    px: 2,
                    pb: 2,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    zIndex: 3,
                    alignItems: 'center',
                }}
            >
                {activeCues.map((cue) => (
                    <Box
                        key={`${cue.start}-${cue.end}`}
                        sx={{
                            color: 'white',
                            borderRadius: 1,
                            p: 0.5,
                            mb: 0.5,
                            pointerEvents: 'auto',
                            cursor: 'pointer',
                            whiteSpace: 'pre-line',
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                            display: 'inline-block',
                            alignSelf: 'center',
                            maxWidth: '100%',
                        }}
                        onClick={(event) => handleSubtitleClick(event, cue.text)}
                    >
                        <Typography
                            variant="body1"
                            sx={{
                                fontSize: settings.subtitleFontSize || 22,
                                fontWeight: settings.subtitleFontWeight ?? 600,
                                textShadow:
                                    '0 0 1px rgba(0,0,0,0.9), 0 1px 1px rgba(0,0,0,0.9), 0 -1px 1px rgba(0,0,0,0.9), 1px 0 1px rgba(0,0,0,0.9), -1px 0 1px rgba(0,0,0,0.9)',
                            }}
                        >
                            {cue.text}
                        </Typography>
                    </Box>
                ))}
            </Stack>
            {dictionaryVisible && (
                <>
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '50%',
                            backgroundColor: 'rgba(26,29,33,0.96)',
                            color: '#eee',
                            p: 2,
                            overflowY: 'auto',
                            zIndex: 4,
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Stack spacing={1}>
                            {dictionaryLoading && (
                                <Typography variant="body2" sx={{ textAlign: 'center', color: '#aaa', py: 2 }}>
                                    Scanning…
                                </Typography>
                            )}
                            {!dictionaryLoading && dictionaryResults.map((entry, i) => (
                                <Box
                                    key={`${entry.headword}-${entry.reading}-${i}`}
                                    sx={{
                                        mb: 2,
                                        pb: 2,
                                        borderBottom: i < dictionaryResults.length - 1 ? '1px solid #333' : 'none',
                                    }}
                                >
                                    <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="flex-start"
                                        sx={{ mb: 1 }}
                                    >
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1 }}>
                                            <Typography variant="h5" sx={{ lineHeight: 1 }}>
                                                {entry.headword}
                                            </Typography>
                                            {entry.reading && (
                                                <Typography variant="caption" sx={{ color: '#aaa' }}>
                                                    {entry.reading}
                                                </Typography>
                                            )}
                                            {entry.termTags?.map((tag, tagIndex) => (
                                                <Box
                                                    key={`${entry.headword}-tag-${tagIndex}`}
                                                    sx={{
                                                        px: 0.5,
                                                        py: 0.1,
                                                        borderRadius: 0.5,
                                                        fontSize: '0.7rem',
                                                        backgroundColor: '#666',
                                                    }}
                                                >
                                                    {String(tag)}
                                                </Box>
                                            ))}
                                        </Box>
                                    </Stack>
                                    {entry.definitions?.map((def, defIndex) => (
                                        <Stack key={`${entry.headword}-def-${defIndex}`} sx={{ mb: 1 }}>
                                            <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
                                                {def.tags?.map((tag, tagIndex) => (
                                                    <Box
                                                        key={`${entry.headword}-def-${defIndex}-tag-${tagIndex}`}
                                                        sx={{
                                                            px: 0.5,
                                                            py: 0.1,
                                                            borderRadius: 0.5,
                                                            fontSize: '0.7rem',
                                                            backgroundColor: '#666',
                                                        }}
                                                    >
                                                        {tag}
                                                    </Box>
                                                ))}
                                                <Box
                                                    sx={{
                                                        px: 0.5,
                                                        py: 0.1,
                                                        borderRadius: 0.5,
                                                        fontSize: '0.7rem',
                                                        backgroundColor: '#9b59b6',
                                                    }}
                                                >
                                                    {def.dictionaryName}
                                                </Box>
                                            </Stack>
                                            <Box sx={{ color: '#ddd' }}>
                                                {def.content.map((jsonString, idx) => (
                                                    <Box key={`${entry.headword}-def-${defIndex}-${idx}`} sx={{ mb: 0.5 }}>
                                                        <StructuredContent contentString={jsonString} />
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Stack>
                                    ))}
                                </Box>
                            ))}
                            {!dictionaryLoading && dictionaryResults.length === 0 && (
                                <Typography variant="body2" sx={{ textAlign: 'center', color: '#777' }}>
                                    No results found
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                </>
            )}
            {isOverlayVisible && !dictionaryVisible && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        px: 2,
                        pt: isMobile ? 'calc(env(safe-area-inset-top) + 24px)' : 2,
                        pb: isMobile
                            ? isLandscape
                                ? 'calc(env(safe-area-inset-bottom) + 4px)'
                                : 'calc(env(safe-area-inset-bottom) + 12px)'
                            : 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        zIndex: 2,
                    }}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (isAnyMenuOpen || shouldIgnoreOverlayToggle()) {
                                return;
                            }
                            setIsOverlayVisible(false);
                            setAutoOverlayDisabled(true);
                        }}
                    >
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ pointerEvents: 'none' }}
                    >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ pointerEvents: 'auto' }}>
                            {episodeOptions.length > 0 && onEpisodeSelect && (
                                <IconButton
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        markMenuInteraction();
                                        setEpisodeMenuAnchor(event.currentTarget);
                                    }}
                                    color="inherit"
                                >
                                    <FormatListBulletedIcon />
                                </IconButton>
                            )}
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    markMenuInteraction();
                                    setVideoMenuAnchor(event.currentTarget);
                                }}
                                color="inherit"
                            >
                                <VideoSettingsIcon />
                            </IconButton>
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    markMenuInteraction();
                                    setSubtitleMenuAnchor(event.currentTarget);
                                }}
                                color="inherit"
                            >
                                <SubtitlesIcon />
                            </IconButton>
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    markMenuInteraction();
                                    setSpeedMenuAnchor(event.currentTarget);
                                }}
                                color="inherit"
                            >
                                <SpeedIcon />
                            </IconButton>
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    openSettings();
                                }}
                                color="inherit"
                                aria-label="Manatan Settings"
                            >
                                <Box
                                    component="img"
                                    src={ManatanLogo}
                                    alt="Manatan"
                                    sx={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }}
                                />
                            </IconButton>
                            {shouldShowFullscreen && (
                                <IconButton
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setIsPageFullscreen((prev) => !prev);
                                    }}
                                    color="inherit"
                                >
                                    {isPageFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                                </IconButton>
                            )}
                        </Stack>
                        <IconButton
                            onClick={(event) => {
                                event.stopPropagation();
                                onExit();
                            }}
                            color="inherit"
                            sx={{ pointerEvents: 'auto' }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Stack>
                    <Box sx={{ flexGrow: 1 }} />
                    <Box
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                            zIndex: 3,
                        }}
                    >
                        <Stack direction="row" justifyContent="center" spacing={2} alignItems="center">
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    skipToPreviousSubtitle();
                                }}
                                color="inherit"
                                sx={{ pointerEvents: 'auto' }}
                            >
                                <Replay10Icon />
                            </IconButton>
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    togglePlay();
                                }}
                                color="inherit"
                                sx={{ pointerEvents: 'auto' }}
                            >
                                {isPaused ? <PlayArrowIcon /> : <PauseIcon />}
                            </IconButton>
                            <IconButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    skipToNextSubtitle();
                                }}
                                color="inherit"
                                sx={{ pointerEvents: 'auto' }}
                            >
                                <Forward10Icon />
                            </IconButton>
                        </Stack>
                    </Box>
                    <Stack spacing={1} sx={{ pointerEvents: 'none' }}>
                        <Stack direction="row" justifyContent="space-between" sx={{ pointerEvents: 'auto' }}>
                            <Typography variant="caption" onClick={(event) => event.stopPropagation()}>
                                {formatTime(currentTime)}
                            </Typography>
                            <Typography variant="caption" onClick={(event) => event.stopPropagation()}>
                                {formatTime(duration)}
                            </Typography>
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={2}>
                            <Box
                                sx={{ position: 'relative', flexGrow: 1, width: '100%', pointerEvents: 'auto' }}
                                onClick={(event) => event.stopPropagation()}
                                onMouseDown={(event) => event.stopPropagation()}
                            >
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: 12,
                                        right: 12,
                                        height: 4,
                                        transform: 'translateY(-50%)',
                                        backgroundColor: 'rgba(255,255,255,0.2)',
                                        borderRadius: 999,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            height: '100%',
                                            width: `${buffered * 100}%`,
                                            backgroundColor: 'rgba(255,255,255,0.5)',
                                            borderRadius: 999,
                                        }}
                                    />
                                </Box>
                                <Slider
                                    value={duration ? (currentTime / duration) * 100 : 0}
                                    onChange={handleSeek}
                                    aria-label="Video position"
                                    size="small"
                                />
                            </Box>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ pointerEvents: 'auto' }}>
                                <Typography variant="caption" onClick={(event) => event.stopPropagation()}>
                                    {subtitleOffsetMs} ms
                                </Typography>
                                <IconButton
                                    size="small"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSubtitleOffsetMs((prev) => prev - 100);
                                    }}
                                    color="inherit"
                                >
                                    -
                                </IconButton>
                                <IconButton
                                    size="small"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSubtitleOffsetMs((prev) => prev + 100);
                                    }}
                                    color="inherit"
                                >
                                    +
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Stack>
                    <Menu
                        anchorEl={episodeMenuAnchor}
                        open={Boolean(episodeMenuAnchor)}
                        onClose={(event) => {
                            event?.stopPropagation?.();
                            markMenuInteraction();
                            setEpisodeMenuAnchor(null);
                        }}
                        MenuListProps={{
                            onClick: (event) => event.stopPropagation(),
                        }}
                        PaperProps={{
                            sx: { maxHeight: '60vh', minWidth: 220 },
                        }}
                        sx={{ zIndex: isPageFullscreen || (fillHeight && isMobile) ? 1601 : undefined }}
                    >
                        {episodeMenuItems}
                    </Menu>
                    <Menu
                        anchorEl={videoMenuAnchor}
                        open={Boolean(videoMenuAnchor)}
                        onClose={(event) => {
                            event?.stopPropagation?.();
                            markMenuInteraction();
                            setVideoMenuAnchor(null);
                        }}
                        MenuListProps={{
                            onClick: (event) => event.stopPropagation(),
                        }}
                        sx={{ zIndex: isPageFullscreen || (fillHeight && isMobile) ? 1601 : undefined }}
                    >
                        {videoMenuItems}
                    </Menu>
                    <Menu
                        anchorEl={subtitleMenuAnchor}
                        open={Boolean(subtitleMenuAnchor)}
                        onClose={(event) => {
                            event?.stopPropagation?.();
                            markMenuInteraction();
                            setSubtitleMenuAnchor(null);
                        }}
                        MenuListProps={{
                            onClick: (event) => event.stopPropagation(),
                        }}
                        sx={{ zIndex: isPageFullscreen || (fillHeight && isMobile) ? 1601 : undefined }}
                    >
                        <MenuItem
                            selected={selectedSubtitleIndex === null}
                            onClick={(event) => {
                                event.stopPropagation();
                                markMenuInteraction();
                                handleSubtitleChange(null);
                                setSubtitleMenuAnchor(null);
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                                {renderSelectionIcon(selectedSubtitleIndex === null)}
                            </ListItemIcon>
                            <ListItemText primary="Off" />
                        </MenuItem>
                        {subtitleMenuItems}
                    </Menu>
                    <Menu
                        anchorEl={speedMenuAnchor}
                        open={Boolean(speedMenuAnchor)}
                        onClose={(event) => {
                            event?.stopPropagation?.();
                            markMenuInteraction();
                            setSpeedMenuAnchor(null);
                        }}
                        MenuListProps={{
                            onClick: (event) => event.stopPropagation(),
                        }}
                        sx={{ zIndex: isPageFullscreen || (fillHeight && isMobile) ? 1601 : undefined }}
                    >
                        {playbackRates.map((rate) => {
                            const isSelected = rate === playbackRate;
                            return (
                                <MenuItem
                                    key={rate}
                                    selected={isSelected}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        markMenuInteraction();
                                        handlePlaybackChange(rate);
                                        setSpeedMenuAnchor(null);
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 32 }}>{renderSelectionIcon(isSelected)}</ListItemIcon>
                                    <ListItemText primary={`${rate}x`} />
                                </MenuItem>
                            );
                        })}
                        {showBraveProxyToggle && onBraveAudioFixModeChange && (
                            <MenuItem
                                onClick={(event) => {
                                    event.stopPropagation();
                                    markMenuInteraction();
                                    handleBraveAudioFixToggle();
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                    {renderSelectionIcon(braveAudioFixMode !== 'off')}
                                </ListItemIcon>
                                <ListItemText primary={`Brave audio fix: ${braveAudioFixLabel}`} />
                            </MenuItem>
                        )}
                        {showBraveProxyToggle && enableBraveAudioFix && autoBraveFixDetected && (
                            <MenuItem
                                disableRipple
                                disableTouchRipple
                                onClick={(event) => event.stopPropagation()}
                                sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                            >
                                <Typography variant="caption" sx={{ textTransform: 'uppercase', opacity: 0.7 }}>
                                    Brave start buffer
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                                    <Typography variant="caption">{braveBufferSeconds}s</Typography>
                                    <Slider
                                        value={braveBufferSeconds}
                                        min={5}
                                        max={120}
                                        step={5}
                                        size="small"
                                        onChange={(_, value) => {
                                            const nextValue = Array.isArray(value) ? value[0] : value;
                                            setBraveBufferSeconds(nextValue);
                                        }}
                                        sx={{ width: 140 }}
                                    />
                                </Stack>
                            </MenuItem>
                        )}
                        {showBraveProxyToggle && enableBraveAudioFix && autoBraveFixDetected && (
                            <MenuItem
                                disableRipple
                                disableTouchRipple
                                onClick={(event) => event.stopPropagation()}
                                sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                            >
                                <Typography variant="caption" sx={{ textTransform: 'uppercase', opacity: 0.7 }}>
                                    Brave audio reset
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                                    <Typography variant="caption">{braveWarmupSeconds}s</Typography>
                                    <Slider
                                        value={braveWarmupSeconds}
                                        min={2}
                                        max={30}
                                        step={1}
                                        size="small"
                                        onChange={(_, value) => {
                                            const nextValue = Array.isArray(value) ? value[0] : value;
                                            setBraveWarmupSeconds(nextValue);
                                        }}
                                        sx={{ width: 140 }}
                                    />
                                </Stack>
                            </MenuItem>
                        )}
                    </Menu>
                </Box>
            )}
            </Box>
        </Box>
    );
};
