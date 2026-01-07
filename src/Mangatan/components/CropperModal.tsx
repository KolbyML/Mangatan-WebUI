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
                        overflow: 'auto'
                    }}
                >
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                    >
                        <img 
                            ref={setImgRef}
                            src={imageSrc} 
                            alt="Crop preview"
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: 'calc(60vh - 40px)',
                                display: 'block',
                            }}
                        />
                    </ReactCrop>
                </div>
                <div className="ocr-modal-footer">
                    <button type="button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="primary" onClick={handleConfirm}>
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
};
