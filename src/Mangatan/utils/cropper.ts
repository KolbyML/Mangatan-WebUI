/**
 * Creates an image from a URL
 */
async function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous');
        image.src = url;
    });
}

/**
 * Converts degrees to radians
 */
function getRadianAngle(degreeValue: number): number {
    return (degreeValue * Math.PI) / 180;
}

export type Pixels = { 
    width: number; 
    height: number; 
    x: number; 
    y: number; 
};

/**
 * Crops an image based on pixel coordinates and optional rotation
 */
export async function getCroppedImg(
    imageSrc: string,
    pixelCrop: Pixels,
    quality: number,
    rotation = 0
): Promise<string | null> {
    try {
        const image = await createImage(imageSrc);
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            console.error('Failed to get canvas context');
            return null;
        }

        const maxSize = Math.max(image.width, image.height);
        const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

        // Set dimensions to allow rotation without clipping
        canvas.width = safeArea;
        canvas.height = safeArea;

        // Translate to center for rotation
        ctx.translate(safeArea / 2, safeArea / 2);
        ctx.rotate(getRadianAngle(rotation));
        ctx.translate(-safeArea / 2, -safeArea / 2);

        // Draw rotated image
        ctx.drawImage(
            image, 
            safeArea / 2 - image.width * 0.5, 
            safeArea / 2 - image.height * 0.5
        );
        
        const data = ctx.getImageData(0, 0, safeArea, safeArea);

        // Set canvas to crop size
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        // Paste cropped area
        ctx.putImageData(
            data,
            Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
            Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
        );

        // Convert to WebP blob
        const blob = await canvas.convertToBlob({
            type: 'image/webp',
            quality: quality
        });

        // Convert to base64
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Failed to crop image:', error);
        return null;
    }
}
