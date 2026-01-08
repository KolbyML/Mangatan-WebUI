import React, { useState } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { getCroppedImg } from '@/Mangatan/utils/cropper';

interface CropperModalProps {
    imageSrc: string;
    onComplete: (croppedImage: string) => void;
    onCancel: () => void;
    quality: number;
}

export const CropperModal: React.FC<CropperModalProps> = ({ 
    imageSrc, 
    onComplete, 
    onCancel,
    quality 
}) => {
    const [crop, setCrop] = useState<Crop>({
        unit: '%',
        x: 10,
        y: 10,
        width: 80,
        height: 80
    });
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const handleConfirm = async () => {
        if (!completedCrop || !imgRef) return;

        // Get the scale factor between displayed size and natural size
        const scaleX = imgRef.naturalWidth / imgRef.width;
        const scaleY = imgRef.naturalHeight / imgRef.height;

        // Scale the crop coordinates to match the natural image size
        const pixelCrop = {
            x: completedCrop.x * scaleX,
            y: completedCrop.y * scaleY,
            width: completedCrop.width * scaleX,
            height: completedCrop.height * scaleY
        };

        const croppedImage = await getCroppedImg(
            imageSrc,
            pixelCrop,
            quality,
            0
        );

        if (croppedImage) {
            onComplete(croppedImage);
        }
    };

    return (
        <div className="ocr-modal-overlay" onClick={onCancel}>
            <div 
                className="ocr-modal" 
                onClick={(e) => e.stopPropagation()}
                style={{ 
                    maxWidth: '90vw', 
                    maxHeight: '90vh',
                    pointerEvents: 'auto',
                    position: 'relative',
                }}
            >
                <div className="ocr-modal-header">
                    <h2>Crop Image</h2>
                </div>
                <div 
                    className="ocr-modal-content" 
                    style={{ 
                        position: 'relative', 
                        height: '60vh', 
                        minHeight: '400px',
                        padding: '20px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        overflow: 'auto',
                        backgroundColor: '#111' // Dark background for better contrast
                    }}
                >
                    {isLoading && (
                        <div style={{ position: 'absolute', zIndex: 10 }}>
                             <div className="ocr-spinner">
                                <svg className="circular" viewBox="25 25 50 50">
                                    <circle className="path" cx="50" cy="50" r="20" fill="none" strokeWidth="4" strokeMiterlimit="10"/>
                                </svg>
                            </div>
                        </div>
                    )}
                    
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                    >
                        <img 
                            ref={setImgRef}
                            src={imageSrc} 
                            alt="Crop preview"
                            crossOrigin="anonymous" // Helps hit browser cache if main image used CORS
                            onLoad={() => setIsLoading(false)}
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: 'calc(60vh - 40px)',
                                display: 'block',
                                opacity: isLoading ? 0 : 1, // Fade in
                                transition: 'opacity 0.2s'
                            }}
                        />
                    </ReactCrop>
                </div>
                <div className="ocr-modal-footer">
                    <button type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="primary" onClick={handleConfirm} disabled={isLoading}>
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};