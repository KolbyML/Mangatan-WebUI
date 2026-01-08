/**
 * Generic AnkiConnect API call
 */
async function ankiConnect(
    action: string,
    params: Record<string, any>,
    url: string,
) {
    try {
        const res = await fetch(url, {
            method: "POST",
            body: JSON.stringify({ action, params, version: 6 }),
        });
        const json = await res.json();

        if (json.error) {
            throw new Error(json.error);
        }

        return json.result;
    } catch (e: any) {
        const errorMessage = e?.message ?? String(e);

        if (
            e instanceof TypeError && errorMessage.includes("Failed to fetch")
        ) {
            throw new Error(
                "Cannot connect to AnkiConnect. Check that Anki is running and CORS is configured.",
            );
        } else {
            throw new Error(errorMessage);
        }
    }
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
 * Convert blob to base64
 */
async function blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}

/**
 * Fetch image and convert to base64 webp
 */
async function imageUrlToBase64Webp(
    imageUrl: string,
    quality: number = 0.92
): Promise<string | null> {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        const imageBitmap = await createImageBitmap(blob);
        
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            throw new Error('Failed to get canvas context');
        }
        
        ctx.drawImage(imageBitmap, 0, 0);
        
        const webpBlob = await canvas.convertToBlob({
            type: 'image/webp',
            quality: quality
        });
        
        imageBitmap.close();
        
        return await blobToBase64(webpBlob);
    } catch (error) {
        console.error('Failed to convert image:', error);
        return null;
    }
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
            throw new Error("Failed to process image");
        }

        // Clear existing image first
        fields[pictureField] = "";

        // Add new image
        updatePayload.note.picture = {
            filename: `mangatan_${id}.webp`,
            data: imageData.split(";base64,")[1],
            fields: [pictureField],
        };
    }

    await ankiConnect("updateNoteFields", updatePayload, ankiConnectUrl);
}
