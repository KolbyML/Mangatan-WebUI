export type AuthCredentials = { user?: string; pass?: string };
export type ChapterStatus = 'idle' | 'processed' | { status: 'processing', progress: number, total: number };

// 1. Fixed Query: Changed $id type from ID! to Int!
const MANGA_CHAPTERS_QUERY = `
query MangaIdToChapterIDs($id: Int!) {
  manga(id: $id) {
    chapters {
      nodes {
        id
        name
        chapterNumber
      }
    }
  }
}
`;

const GRAPHQL_QUERY = `
mutation GET_CHAPTER_PAGES_FETCH($input: FetchChapterPagesInput!) {
  fetchChapterPages(input: $input) {
    chapter {
      id
      pageCount
    }
    pages
  }
}
`;

// 2. Helper to resolve MangaId + ChapterNum -> Internal Chapter ID
const resolveChapterId = async (mangaId: number, chapterNumber: number): Promise<number> => {
    const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            operationName: "MangaIdToChapterIDs",
            variables: { id: mangaId },
            query: MANGA_CHAPTERS_QUERY
        })
    });
    const json = await response.json();
    
    // Safety check for errors in the response body
    if (json.errors) {
        console.error("GraphQL Errors:", json.errors);
        throw new Error(`GraphQL Error: ${json.errors[0]?.message || 'Unknown error'}`);
    }

    const chapters = json.data?.manga?.chapters?.nodes;

    if (!Array.isArray(chapters)) {
        throw new Error("Failed to retrieve chapter list from GraphQL");
    }

    // Find the chapter node where the number matches
    // Note: API might return number or string, so we cast to Number for comparison
    const match = chapters.find((ch: any) => Number(ch.chapterNumber) === chapterNumber);

    if (!match) {
        throw new Error(`Chapter number ${chapterNumber} not found in manga ${mangaId}`);
    }

    return parseInt(match.id, 10);
};

export const fetchChapterPagesGraphQL = async (chapterId: number) => {
    const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            operationName: "GET_CHAPTER_PAGES_FETCH",
            variables: { input: { chapterId } },
            query: GRAPHQL_QUERY
        })
    });
    const json = await response.json();
    return json.data?.fetchChapterPages?.pages as string[] | undefined;
};

export const checkChapterStatus = async (baseUrl: string, creds?: AuthCredentials): Promise<ChapterStatus> => {
    try {
        const body: any = { base_url: baseUrl, context: 'Check Status' };
        if (creds?.user) body.user = creds.user;
        if (creds?.pass) body.pass = creds.pass;

        const res = await apiRequest<any>('/api/ocr/is-chapter-preprocessed', {
            method: 'POST',
            body: body
        });
        
        if (res.status === 'processing') {
            return { 
                status: 'processing', 
                progress: res.progress || 0, 
                total: res.total || 0 
            };
        }
        if (res.status === 'processed') return 'processed';
        return 'idle';
    } catch (e) {
        console.error("Failed to check chapter status", e);
        return 'idle';
    }
};

export const preprocessChapter = async (baseUrl: string, chapterPath: string, creds?: AuthCredentials): Promise<void> => {
    // 3. Updated logic to parse Manga ID and Chapter Number
    // Expecting URL format like: .../manga/10/chapter/5
    const mangaMatch = chapterPath.match(/\/manga\/(\d+)/);
    const chapterMatch = chapterPath.match(/\/chapter\/([\d.]+)/); // Supports decimals (e.g. 10.5)

    if (!mangaMatch || !chapterMatch) {
        throw new Error("Could not parse Manga ID or Chapter Number from path");
    }

    const mangaId = parseInt(mangaMatch[1], 10);
    const chapterNum = parseFloat(chapterMatch[1]); 

    // Resolve the real internal ID
    const internalChapterId = await resolveChapterId(mangaId, chapterNum);

    // Call the original fetcher with the resolved ID
    const pages = await fetchChapterPagesGraphQL(internalChapterId);
    
    if (!pages || pages.length === 0) throw new Error("No pages found via GraphQL");

    const origin = window.location.origin;
    const absolutePages = pages.map(p => {
        if (p.startsWith('http')) return p;
        return `${origin}${p}`;
    });

    // 4. Send to OCR Server
    const body: any = { 
        base_url: baseUrl, 
        context: document.title,
        pages: absolutePages 
    };
    if (creds?.user) body.user = creds.user;
    if (creds?.pass) body.pass = creds.pass;

    await apiRequest('/api/ocr/preprocess-chapter', {
        method: 'POST',
        body: body
    });
};

export const logDebug = (msg: string, isDebug: boolean) => {
    if (isDebug) console.log(`[OCR PC Hybrid] ${new Date().toLocaleTimeString()} ${msg}`);
};

export const apiRequest = async <T>(
    url: string,
    options: { method?: string; body?: any; headers?: any } = {},
): Promise<T> => {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const response = await fetch(fullUrl, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await response.json();
    return json;
};

export const cleanPunctuation = (text: string): string => {
    if (!text) return text;
    let t = text
        .replace(/[ ]*!!+/g, '‼')
        .replace(/[ ]*\?\?+/g, '⁇')
        .replace(/[ ]*\.\.+/g, '…')
        .replace(/[ ]*(!\?)+/g, '⁉')
        .replace(/[ ]*(\?!)+/g, '⁈')
        .replace(/[ ]*\u2026+/g, '…')
        .replace(/[ ]*\u30FB\u30FB+/g, '…')
        .replace(/[ ]*\uFF65\uFF65+/g, '…')
        .replace(/[ ]*-+/g, 'ー')
        .replace(/[ ]*\u2013+/g, '―')
        .replace(/[ ]*:+[ ]*/g, '…');

    t = t
        .replace(/^[!?:]+$/g, '')
        .replace(/([⁉⁈‼⁇])[!?:]+/g, '$1')
        .replace(/[!?:]+([⁉⁈‼⁇])/g, '$1');
    return t.replace(/\u0020/g, '');
};
