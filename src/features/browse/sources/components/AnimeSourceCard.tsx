/*
 * Copyright (C) Contributors to the Suwayomi project
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import { Link } from 'react-router-dom';
import { requestManager } from '@/lib/requests/RequestManager.ts';
import { ListCardAvatar } from '@/base/components/lists/cards/ListCardAvatar.tsx';
import { ListCardContent } from '@/base/components/lists/cards/ListCardContent.tsx';
import { languageCodeToName } from '@/base/utils/Languages.ts';
import { AppRoutes } from '@/base/AppRoute.constants.ts';
import { SourceContentType } from '@/features/source/browse/screens/SourceMangas.tsx';

export type AnimeSourceInfo = {
    id: string;
    name: string;
    lang: string;
    iconUrl: string;
    supportsLatest: boolean;
    isConfigurable: boolean;
    isNsfw: boolean;
    displayName: string;
    baseUrl?: string | null;
};

export const AnimeSourceCard = ({ source }: { source: AnimeSourceInfo }) => {
    const { name, lang, iconUrl, isNsfw } = source;

    return (
        <Card>
            <CardActionArea
                component={Link}
                to={AppRoutes.animeSources.childRoutes.browse.path(source.id)}
                state={{ contentType: SourceContentType.POPULAR, clearCache: true }}
            >
                <ListCardContent>
                    <ListCardAvatar
                        iconUrl={requestManager.getValidImgUrlFor(iconUrl)}
                        alt={name}
                        slots={{
                            spinnerImageProps: {
                                ignoreQueue: true,
                            },
                        }}
                    />
                    <Stack
                        sx={{
                            justifyContent: 'center',
                            flexGrow: 1,
                            flexShrink: 1,
                            wordBreak: 'break-word',
                        }}
                    >
                        <Typography variant="h6" component="h3">
                            {name}
                        </Typography>
                        <Typography variant="caption">
                            {languageCodeToName(lang)}
                            {isNsfw && (
                                <Typography variant="caption" color="error">
                                    {' 18+'}
                                </Typography>
                            )}
                        </Typography>
                    </Stack>
                </ListCardContent>
            </CardActionArea>
        </Card>
    );
};
