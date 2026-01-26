/**
 * Updated AnkiConnect API call with automatic permission handshake
 */
async function ankiConnect(
    action: string,
    params: Record<string, any>,
    url: string,
) {
    const execute = async () => {
        const res = await fetch(url, {
            method: "POST",
            body: JSON.stringify({ action, params, version: 6 }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        return json.result;
    };

    try {
        return await execute();
    } catch (e: any) {
        // If fetch fails, it is likely a CORS block. Attempt handshake.
        try {
            const permRes = await fetch(url, {
                method: "POST",
                body: JSON.stringify({ action: "requestPermission", version: 6 }),
            });
            const permJson = await permRes.json();

            // If user clicked 'Yes' in the Anki popup, retry the original request
            if (permJson.result && permJson.result.permission === 'granted') {
                return await execute();
            }
        } catch (handshakeError) {
            console.error("Handshake failed", handshakeError);
        }

        // Standard error handling if handshake doesn't resolve the issue
        const errorMessage = e?.message ?? String(e);
        if (e instanceof TypeError && errorMessage.includes("Failed to fetch")) {
            throw new Error("Connection blocked. Please click 'Yes' on the Anki permission popup.");
        }
        throw new Error(errorMessage);
    }
}
/**
 * Check connection and get version
 */
export async function getAnkiVersion(url: string) {
    try {
        const ver = await ankiConnect("version", {}, url);
        return { ok: true, version: ver };
    } catch (e) {
        return { ok: false, error: e };
    }
}

/**
 * Get all deck names
 */
export async function getDeckNames(url: string): Promise<string[]> {
    return await ankiConnect("deckNames", {}, url);
}

/**
 * Get all model names (Card Types)
 */
export async function getModelNames(url: string): Promise<string[]> {
    return await ankiConnect("modelNames", {}, url);
}

/**
 * Get fields for a specific model
 */
export async function getModelFields(url: string, modelName: string): Promise<string[]> {
    return await ankiConnect("modelFieldNames", { modelName }, url);
}

/**
 * Find notes based on a query
 */
export async function findNotes(url: string, query: string): Promise<number[]> {
    const res = await ankiConnect("findNotes", { query }, url);
    return res || [];
}

/**
 * Open the Anki Browser to a specific query
 */
export async function guiBrowse(url: string, query: string) {
    return await ankiConnect("guiBrowse", { query }, url);
}

/**
 * Add a new note
 */
export async function addNote(
    url: string, 
    deckName: string, 
    modelName: string, 
    fields: Record<string, string>, 
    tags: string[] = [],
    picture?: { url?: string; data?: string; filename: string; fields: string[] }
) {
    const params: any = {
        note: {
            deckName,
            modelName,
            fields,
            tags,
            options: {
                allowDuplicate: false,
                duplicateScope: 'deck'
            }
        }
    };

    if (picture) {
        params.note.picture = [picture];
    }

    return await ankiConnect("addNote", params, url);
}

/**
 * Get the most recent card ID created today
 */
async function getLastCardId(url: string) {
    const notesToday = await ankiConnect(
        "findNotes",
        { query: "added:1" },
        url,
    );
    if (!notesToday || !Array.isArray(notesToday)) {
        return undefined;
    }
    const id = notesToday.sort().at(-1);
    return id;
}

/**
 * Calculate card age in minutes
 */
function getCardAgeInMin(id: number) {
    return Math.floor((Date.now() - id) / 60000);
}

/**
 * Fetch image and convert to base64 webp using Image element (better CORS handling)
 */
export async function imageUrlToBase64Webp(
    imageUrl: string,
    quality: number = 0.92
): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        // Use anonymous to attempt to get CORS headers, but handle failure
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
            try {
                const canvas = new OffscreenCanvas(img.width, img.height);
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('No context');
                
                ctx.drawImage(img, 0, 0);
                
                canvas.convertToBlob({ type: 'image/webp', quality })
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    })
                    .catch(err => {
                        console.error("Blob conversion failed", err);
                        resolve(null);
                    });
            } catch (e) {
                console.error("Canvas operation failed (likely tainted)", e);
                resolve(null);
            }
        };

        img.onerror = () => {
            console.error("Failed to load image for Anki conversion");
            resolve(null);
        };

        img.src = imageUrl;
    });
}

/**
 * Update the last created Anki card with image and/or sentence
 */
export async function updateLastCard(
    ankiConnectUrl: string,
    imageUrl: string,
    sentence: string,
    pictureField: string,
    sentenceField: string,
    quality: number,
) {
    // Find the last card
    const id = await getLastCardId(ankiConnectUrl);

    if (!id) {
        throw new Error("Could not find recent card (no cards created today)");
    }

    if (getCardAgeInMin(id) >= 5) {
        throw new Error("Card created over 5 minutes ago");
    }

    const fields: Record<string, any> = {};
    const updatePayload: any = {
        note: {
            id,
            fields,
        },
    };

    // Handle sentence field (if specified)
    if (sentenceField && sentenceField.trim() && sentence) {
        fields[sentenceField] = sentence;
    }

    // Handle picture field (if specified)
    if (pictureField && pictureField.trim()) {
        const imageData = await imageUrlToBase64Webp(imageUrl, quality);

        if (!imageData) {
            throw new Error("Failed to process image (CORS or Load Error)");
        }

        // Clear existing image first
        fields[pictureField] = "";

        // Add new image
        updatePayload.note.picture = {
            filename: `manatan_${id}.webp`,
            data: imageData.split(";base64,")[1],
            fields: [pictureField],
        };
    }

    await ankiConnect("updateNoteFields", updatePayload, ankiConnectUrl);
}