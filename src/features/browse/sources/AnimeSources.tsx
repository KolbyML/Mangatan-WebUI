/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import {
    createUpdateMetadataServerSettings,
    useMetadataServerSettings,
} from '@/features/settings/services/ServerSettingsMetadata.ts';
import { LanguageSelect } from '@/base/components/inputs/LanguageSelect.tsx';
import { StyledGroupedVirtuoso } from '@/base/components/virtuoso/StyledGroupedVirtuoso.tsx';
import { StyledGroupHeader } from '@/base/components/virtuoso/StyledGroupHeader.tsx';
import { StyledGroupItemWrapper } from '@/base/components/virtuoso/StyledGroupItemWrapper.tsx';
import { VirtuosoUtil } from '@/lib/virtuoso/Virtuoso.util.tsx';
import { translateExtensionLanguage } from '@/features/extension/Extensions.utils.ts';
import { useAppAction } from '@/features/navigation-bar/hooks/useAppAction.ts';
import { languageSpecialSortComparator, toComparableLanguage, toUniqueLanguageCodes } from '@/base/utils/Languages.ts';
import { AnimeSourceCard, AnimeSourceInfo } from '@/features/browse/sources/components/AnimeSourceCard.tsx';

type AnimeSourceResponse = AnimeSourceInfo[];

const groupByLanguage = (sources: AnimeSourceInfo[]): [string, AnimeSourceInfo[]][] => {
    if (!sources.length) {
        return [];
    }

    const grouped = sources.reduce<Record<string, AnimeSourceInfo[]>>((acc, source) => {
        const lang = source.lang || 'unknown';
        if (!acc[lang]) {
            acc[lang] = [];
        }
        acc[lang].push(source);
        return acc;
    }, {});

    const groupedEntries = Object.entries(grouped)
        .map(([lang, groupedSources]) => [lang, groupedSources ?? []] as [string, AnimeSourceInfo[]])
        .filter(([, groupedSources]) => groupedSources.length > 0)
        .toSorted(([a], [b]) => languageSpecialSortComparator(a, b));

    if (!groupedEntries.length) {
        return [['unknown', sources]];
    }

    return groupedEntries;
};

const filterSources = (
    sources: AnimeSourceInfo[],
    { showNsfw, languages }: { showNsfw: boolean; languages: string[] },
): AnimeSourceInfo[] => {
    const normalizedLanguages = toUniqueLanguageCodes(languages).map((lang) => toComparableLanguage(lang));

    return sources
        .filter((source) => showNsfw || !source.isNsfw)
        .filter((source) => !languages.length || normalizedLanguages.includes(toComparableLanguage(source.lang)));
};

export function AnimeSources({ tabsMenuHeight }: { tabsMenuHeight: number }) {
    const { t } = useTranslation();
    const {
        settings: { showNsfw, animeSourceLanguages },
    } = useMetadataServerSettings();
    const updateMetadataServerSettings = createUpdateMetadataServerSettings<'animeSourceLanguages'>();

    const [refreshToken, setRefreshToken] = useState(0);

    const {
        data,
        loading: isLoading,
        error,
        refetch,
    } = requestManager.useGetAnimeSourceList({ notifyOnNetworkStatusChange: true });

    const refresh = useCallback(() => setRefreshToken((prev) => prev + 1), []);

    useEffect(() => {
        refetch().catch(() => {});
    }, [refreshToken]);

    const sources = useMemo(
        () =>
            ((data?.animeSources?.nodes ?? []) as AnimeSourceResponse)
                .filter(Boolean)
                .map((source) => ({
                    ...source,
                    lang: source.lang || 'unknown',
                })),
        [data?.animeSources?.nodes],
    );
    const filteredSources = useMemo(
        () => filterSources(sources, { showNsfw, languages: animeSourceLanguages }),
        [sources, showNsfw, animeSourceLanguages],
    );
    const groupedSources = useMemo(() => groupByLanguage(filteredSources), [filteredSources]);

    const groupCounts = useMemo(() => groupedSources.map((group) => group[1].length), [groupedSources]);
    const visibleSources = useMemo(
        () => groupedSources.map(([, sourcesOfLanguage]) => sourcesOfLanguage).flat(1),
        [groupedSources],
    );

    const computeItemKey = VirtuosoUtil.useCreateGroupedComputeItemKey(
        groupCounts,
        useCallback((index) => groupedSources[index]?.[0] ?? 'unknown', [groupedSources]),
        useCallback(
            (index) => {
                const source = visibleSources[index];
                return source ? `${source.lang}_${source.id}` : `unknown_${index}`;
            },
            [visibleSources],
        ),
    );

    const sourceLanguagesList = useMemo(() => sources.map((source) => source.lang), [sources]);
    const appAction = useMemo(
        () => (
            <>
                <IconButton onClick={refresh} color="inherit">
                    <RefreshIcon />
                </IconButton>
                <LanguageSelect
                    selectedLanguages={animeSourceLanguages}
                    setSelectedLanguages={(languages: string[]) =>
                        updateMetadataServerSettings('animeSourceLanguages', languages)
                    }
                    languages={sourceLanguagesList}
                />
            </>
        ),
        [refresh, animeSourceLanguages, sourceLanguagesList],
    );

    useAppAction(appAction, [appAction]);

    if (isLoading) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={error?.message}
                retry={() => refresh()}
            />
        );
    }

    if (!sources.length) {
        return <EmptyViewAbsoluteCentered message="No anime sources found." />;
    }

    if (!filteredSources.length) {
        return <EmptyViewAbsoluteCentered message={t('global.error.label.no_matching_results')} />;
    }

    return (
        <StyledGroupedVirtuoso
            persistKey="anime-sources"
            heightToSubtract={tabsMenuHeight}
            overscan={window.innerHeight * 0.5}
            groupCounts={groupCounts}
            computeItemKey={computeItemKey}
            groupContent={(index) => (
                <StyledGroupHeader isFirstItem={!index}>
                    <Typography variant="h5" component="h2">
                        {translateExtensionLanguage(groupedSources[index]?.[0] ?? 'unknown')}
                    </Typography>
                </StyledGroupHeader>
            )}
            itemContent={(index) => {
                const source = visibleSources[index];
                if (!source) {
                    return null;
                }
                return (
                    <StyledGroupItemWrapper>
                        <AnimeSourceCard source={source} />
                    </StyledGroupItemWrapper>
                );
            }}
        />
    );
}
