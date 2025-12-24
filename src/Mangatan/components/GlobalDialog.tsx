import React from 'react';
import { createPortal } from 'react-dom';
import { useOCR } from '@/Mangatan/context/OCRContext';

export const GlobalDialog: React.FC = () => {
    const { dialogState, closeDialog } = useOCR();
    const { isOpen, type, title, message, onConfirm, onCancel } = dialogState;

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (onConfirm) {
            // FIX: If there is an action, execute it. 
            // Do NOT auto-close. The action is responsible for closing or transitioning state.
            onConfirm(); 
        } else {
            // If it's just an alert (no action), close it.
            closeDialog();
        }
    };

    const handleCancel = () => {
        if (onCancel) onCancel();
        closeDialog();
    };

    const handleOverlayClick = () => {
        // Only allow clicking background to close Alerts
        if (type === 'alert') closeDialog();
    };

    return createPortal(
        <div className="ocr-global-dialog-overlay" onClick={handleOverlayClick}>
            <div className="ocr-global-dialog" onClick={e => e.stopPropagation()}>
                {title && <h3>{title}</h3>}
                
                {type === 'progress' && (
                    <div className="ocr-dialog-spinner" />
                )}

                <div className="ocr-dialog-content">
                    {typeof message === 'string' ? <p>{message}</p> : message}
                </div>

                <div className="ocr-dialog-actions">
                    {type === 'confirm' && (
                        <button type="button" className="ocr-dialog-btn-cancel" onClick={handleCancel}>
                            Cancel
                        </button>
                    )}
                    
                    {/* Hide OK button for progress dialogs */}
                    {type !== 'progress' && (
                        <button type="button" className="ocr-dialog-btn-confirm" onClick={handleConfirm}>
                            {type === 'confirm' ? 'Confirm' : 'OK'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};