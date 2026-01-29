/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ListSubheader from '@mui/material/ListSubheader';
import Divider from '@mui/material/Divider';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { ListItemLink } from '@/base/components/lists/ListItemLink.tsx';
import { LoadingPlaceholder } from '@/base/components/feedback/LoadingPlaceholder.tsx';
import { defaultPromiseErrorHandler } from '@/lib/DefaultPromiseErrorHandler.ts';
import { EmptyViewAbsoluteCentered } from '@/base/components/feedback/EmptyViewAbsoluteCentered.tsx';
import { VersionInfo, WebUIVersionInfo } from '@/features/app-updates/components/VersionInfo.tsx';
import { getErrorMessage } from '@/lib/HelperFunctions.ts';
import { epochToDate } from '@/base/utils/DateHelper.ts';
import { useAppTitle } from '@/features/navigation-bar/hooks/useAppTitle.ts';

type Contributor = {
    key: string;
    name: string;
    count: number;
    profileUrl?: string;
};

type ContributorsCache = {
    updatedAt: number;
    contributors: Contributor[];
};

type MembershipTier = {
    key: string;
    label: string;
    backers: string[];
};

const CONTRIBUTORS_CACHE_KEY = 'manatan:contributors:v1';
const CONTRIBUTORS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEBUI_SINCE_ISO = '2025-12-26T00:00:00Z';
const MANATAN_REPO_API = 'https://api.github.com/repos/KolbyML/Manatan';
const WEBUI_REPO_API = 'https://api.github.com/repos/KolbyML/Manatan-WebUI';
const MAX_GITHUB_PAGES = 10;
const MEMBERSHIP_PERKS = [
    '🚀 1 month early access to builds',
    '📝 Your name in the Manatan About page',
    '🎖️ Discord role',
];

const MEMBERSHIP_TIERS: MembershipTier[] = [
    { key: 'diamond', label: '💎 Diamond', backers: [] },
    { key: 'ruby', label: '❤️ Ruby', backers: [] },
    { key: 'sapphire', label: '🔷 Sapphire', backers: [] },
    { key: 'emerald', label: '🟢 Emerald', backers: [] },
    { key: 'crystal', label: '✨ Crystal', backers: [] },
    { key: 'stone', label: '🪨 Stone', backers: [] },
];

const parseNextLink = (linkHeader: string | null): string | null => {
    if (!linkHeader) {
        return null;
    }
    const entries = linkHeader.split(',');
    for (const entry of entries) {
        const match = entry.match(/<([^>]+)>;\s*rel="([^"]+)"/);
        if (match && match[2] === 'next') {
            return match[1];
        }
    }
    return null;
};

const fetchGithubPages = async (url: string): Promise<any[]> => {
    let nextUrl: string | null = url;
    const results: any[] = [];
    let page = 0;

    while (nextUrl && page < MAX_GITHUB_PAGES) {
        const response = await fetch(nextUrl, {
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) {
            throw new Error(`GitHub request failed (${response.status})`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
            results.push(...data);
        }
        nextUrl = parseNextLink(response.headers.get('Link'));
        page += 1;
    }

    return results;
};

const readContributorsCache = (): ContributorsCache | null => {
    try {
        const raw = localStorage.getItem(CONTRIBUTORS_CACHE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as ContributorsCache;
        if (!parsed || !Array.isArray(parsed.contributors) || typeof parsed.updatedAt !== 'number') {
            return null;
        }
        if (Date.now() - parsed.updatedAt > CONTRIBUTORS_CACHE_TTL_MS) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

const writeContributorsCache = (payload: ContributorsCache) => {
    try {
        localStorage.setItem(CONTRIBUTORS_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore cache write errors.
    }
};

const fetchManatanContributors = async (): Promise<Contributor[]> => {
    const contributors = await fetchGithubPages(`${MANATAN_REPO_API}/contributors?per_page=100&anon=1`);
    return contributors.map((entry: any) => {
        const login = entry.login as string | undefined;
        const name = login || entry.name || 'Unknown';
        const key = login ? `gh:${login}` : `anon:${entry.name || entry.email || name}`;
        return {
            key,
            name,
            count: typeof entry.contributions === 'number' ? entry.contributions : 0,
            profileUrl: login ? entry.html_url : undefined,
        };
    });
};

const fetchWebUiContributors = async (): Promise<Contributor[]> => {
    const commits = await fetchGithubPages(
        `${WEBUI_REPO_API}/commits?since=${encodeURIComponent(WEBUI_SINCE_ISO)}&per_page=100`,
    );
    const map = new Map<string, Contributor>();

    commits.forEach((entry: any) => {
        const author = entry.author;
        const login = author?.login as string | undefined;
        const name = login || entry.commit?.author?.name || 'Unknown';
        const key = login ? `gh:${login}` : `name:${name}`;
        const existing = map.get(key);
        if (existing) {
            existing.count += 1;
            if (!existing.profileUrl && author?.html_url) {
                existing.profileUrl = author.html_url;
            }
        } else {
            map.set(key, {
                key,
                name,
                count: 1,
                profileUrl: author?.html_url,
            });
        }
    });

    return Array.from(map.values());
};

const fetchCombinedContributors = async (): Promise<ContributorsCache> => {
    const [manatan, webui] = await Promise.all([fetchManatanContributors(), fetchWebUiContributors()]);
    const combined = new Map<string, Contributor>();

    const merge = (entry: Contributor) => {
        const existing = combined.get(entry.key);
        if (existing) {
            existing.count += entry.count;
            if (!existing.profileUrl && entry.profileUrl) {
                existing.profileUrl = entry.profileUrl;
            }
        } else {
            combined.set(entry.key, { ...entry });
        }
    };

    manatan.forEach(merge);
    webui.forEach(merge);

    const contributors = Array.from(combined.values()).sort((a, b) => {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return a.name.localeCompare(b.name);
    });

    return { updatedAt: Date.now(), contributors };
};

const renderContributorInline = (contributors: Contributor[]): ReactNode => {
    if (!contributors.length) {
        return 'No contributors found yet.';
    }
    const nodes: ReactNode[] = [];
    contributors.forEach((contributor, index) => {
        if (index > 0) {
            nodes.push(', ');
        }
        const label = `${contributor.name} (${contributor.count})`;
        if (contributor.profileUrl) {
            nodes.push(
                <a
                    key={contributor.key}
                    href={contributor.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#fff', textDecoration: 'underline' }}
                >
                    {label}
                </a>,
            );
        } else {
            nodes.push(<span key={contributor.key}>{label}</span>);
        }
    });
    return nodes;
};

export function About() {
    const { t } = useTranslation();

    const [contributors, setContributors] = useState<Contributor[]>([]);
    const [contributorsUpdatedAt, setContributorsUpdatedAt] = useState<number | null>(null);
    const [contributorsLoading, setContributorsLoading] = useState(false);
    const [contributorsError, setContributorsError] = useState<string | null>(null);

    useAppTitle(t('settings.about.title'));

    const { data, loading, error, refetch } = requestManager.useGetAbout({ notifyOnNetworkStatusChange: true });

    const {
        data: serverUpdateCheckData,
        loading: isCheckingForServerUpdate,
        refetch: checkForServerUpdate,
        error: serverUpdateCheckError,
    } = requestManager.useCheckForServerUpdate({ notifyOnNetworkStatusChange: true });

    if (loading) {
        return <LoadingPlaceholder />;
    }

    if (error) {
        return (
            <EmptyViewAbsoluteCentered
                message={t('global.error.label.failed_to_load_data')}
                messageExtra={getErrorMessage(error)}
                retry={() => refetch().catch(defaultPromiseErrorHandler('About::refetch'))}
            />
        );
    }

    const { aboutServer } = data!;
    const selectedServerChannelInfo = serverUpdateCheckData?.checkForServerUpdates?.find(
        (channel) => channel.channel === aboutServer.buildType,
    );
    const isServerUpdateAvailable =
        !!selectedServerChannelInfo?.tag && selectedServerChannelInfo.tag !== aboutServer.version;

    useEffect(() => {
        let cancelled = false;

        const loadContributors = async () => {
            setContributorsLoading(true);
            setContributorsError(null);

            const cached = readContributorsCache();
            if (cached) {
                setContributors(cached.contributors);
                setContributorsUpdatedAt(cached.updatedAt);
                setContributorsLoading(false);
                return;
            }

            try {
                const combined = await fetchCombinedContributors();
                if (cancelled) {
                    return;
                }
                setContributors(combined.contributors);
                setContributorsUpdatedAt(combined.updatedAt);
                writeContributorsCache(combined);
            } catch (err) {
                if (cancelled) {
                    return;
                }
                setContributorsError(err instanceof Error ? err.message : 'Failed to load contributors.');
            } finally {
                if (!cancelled) {
                    setContributorsLoading(false);
                }
            }
        };

        loadContributors();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <List sx={{ pt: 0 }}>
            <List
                dense
                subheader={
                    <ListSubheader component="div" id="about-contributors">
                        Thanks to everyone who has helped build Manatan
                    </ListSubheader>
                }
            >
                {contributorsLoading ? (
                    <ListItem>
                        <ListItemText primary="Loading contributors..." />
                    </ListItem>
                ) : contributorsError ? (
                    <ListItem>
                        <ListItemText primary="Failed to load contributors." secondary={contributorsError} />
                    </ListItem>
                ) : (
                    <ListItem>
                        <ListItemText
                            primary={
                                renderContributorInline(contributors)
                            }
                            secondary={
                                contributorsUpdatedAt
                                    ? `Updated ${new Date(contributorsUpdatedAt).toLocaleDateString()}`
                                    : undefined
                            }
                        />
                    </ListItem>
                )}
                <ListItem>
                    <ListItemText secondary="Contributors who make meaningful contributions receive all backer perks." />
                </ListItem>
            </List>
            <Divider />
            <List
                subheader={
                    <ListSubheader component="div" id="about-donations">
                        Support Manatan
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary="Donations help keep Manatan free and support development, hosting, and testing."
                        secondary="If you find Manatan useful, consider supporting the project."
                    />
                </ListItem>
                <ListItemLink to="https://ko-fi.com/manatancom" target="_blank" rel="noreferrer">
                    <ListItemText primary={"Ko-fi"} secondary="https://ko-fi.com/manatancom" />
                </ListItemLink>
                <ListItem>
                    <ListItemText
                        primary="Backer perks"
                        secondary={MEMBERSHIP_PERKS.join(' · ')}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary="Backer tiers"
                        secondary="Add your name and join the list."
                    />
                </ListItem>
                {MEMBERSHIP_TIERS.map((tier) => (
                    <ListItem key={tier.key}>
                        <ListItemText
                            primary={tier.label}
                            secondary={tier.backers.length ? tier.backers.join(', ') : 'No backers yet'}
                        />
                    </ListItem>
                ))}
            </List>
            <Divider />
            <List
                subheader={
                    <ListSubheader component="div" id="about-links">
                        {t('global.label.links')}
                    </ListSubheader>
                }
            >
                <ListItemLink to="https://github.com/KolbyML/Manatan" target="_blank" rel="noreferrer">
                    <ListItemText
                        primary={"Manatan"}
                        secondary="https://github.com/KolbyML/Manatan"
                    />
                </ListItemLink>
                <ListItemLink to="https://github.com/KolbyML/Manatan-WebUI" target="_blank" rel="noreferrer">
                    <ListItemText
                        primary={"Manatan WebUI"}
                        secondary="https://github.com/KolbyML/Manatan-WebUI"
                    />
                </ListItemLink>
                <ListItemLink to="https://discord.gg/tDAtpPN8KK" target="_blank" rel="noreferrer">
                    <ListItemText primary={"Manatan Discord"} secondary="https://discord.gg/tDAtpPN8KK" />
                </ListItemLink>
                <ListItemLink to={aboutServer.github} target="_blank" rel="noreferrer">
                    <ListItemText primary={"Suwayomi Server"} secondary={aboutServer.github} />
                </ListItemLink>
            </List>
            <Divider />
            <List
                sx={{ padding: 0 }}
                subheader={
                    <ListSubheader component="div" id="about-server-info">
                        {t('settings.server.title.server')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t('settings.server.title.server')}
                        secondary={`${aboutServer.name} (${aboutServer.buildType})`}
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t('settings.about.server.label.version')}
                        secondary={
                            <VersionInfo
                                version={aboutServer.version}
                                isCheckingForUpdate={isCheckingForServerUpdate}
                                isUpdateAvailable={isServerUpdateAvailable}
                                updateCheckError={serverUpdateCheckError}
                                checkForUpdate={checkForServerUpdate}
                                downloadAsLink
                                url={selectedServerChannelInfo?.url ?? ''}
                            />
                        }
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t('settings.about.server.label.build_time')}
                        secondary={epochToDate(Number(aboutServer.buildTime)).toString()}
                    />
                </ListItem>
            </List>
            <Divider />
            <List
                sx={{ padding: 0 }}
                subheader={
                    <ListSubheader component="div" id="about-webui-info">
                        {t('settings.webui.title.webui')}
                    </ListSubheader>
                }
            >
                <ListItem>
                    <ListItemText
                        primary={t('settings.about.webui.label.channel')}
                        secondary="BUNDLED"
                    />
                </ListItem>
                <ListItem>
                    <ListItemText
                        primary={t('settings.about.webui.label.version')}
                        secondary={
                            <WebUIVersionInfo />
                        }
                    />
                </ListItem>
            </List>
        </List>
    );
}
