import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import '../styles/ProfilePicModal.css';

const createCroppedImage = (imageSrc, cropArea) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 512;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Failed to create image'));
        resolve(blob);
      }, 'image/jpeg', 0.9);
    };
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageSrc;
  });
};

const getRotatedImage = (imageSrc, rotation) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const rad = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      canvas.width = image.width * cos + image.height * sin;
      canvas.height = image.width * sin + image.height * cos;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    image.onerror = () => reject(new Error('Failed to rotate image'));
    image.src = imageSrc;
  });
};

const ProfilePicModal = ({ isOpen, onClose, currentPicUrl, onSave, onDelete, username, viewOnly = false }) => {
  const [mode, setMode] = useState('view');
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setMode('view');
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
      setSaving(false);
      setDeleting(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
      setMode('edit');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);
    setError('');
    try {
      const sourceToUse = rotation !== 0 ? await getRotatedImage(imageSrc, rotation) : imageSrc;
      const blob = await createCroppedImage(sourceToUse, croppedAreaPixels);
      const file = new File([blob], `profile_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await onSave(file);
      handleClose();
    } catch (err) {
      console.error('Failed to save profile pic:', err);
      setError(err?.response?.data?.message || 'Failed to upload. Please try again.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete();
      handleClose();
    } catch (err) {
      console.error('Failed to delete profile pic:', err);
      setError('Failed to delete. Please try again.');
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setMode('view');
    setImageSrc(null);
    setError('');
    onClose();
  };

  const handleEditExisting = () => {
    if (currentPicUrl) {
      setImageSrc(currentPicUrl);
      setMode('edit');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setError('');
    }
  };

  return (
    <div className="pp-overlay">
      <div className="pp-modal">

        {/* Header */}
        <div className="pp-header">
          {mode === 'edit' && (
            <button className="pp-header-back" onClick={() => { setMode('view'); setImageSrc(null); setError(''); }} aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <span className="pp-header-title">
            {mode === 'edit' ? 'Crop Photo' : 'Profile Photo'}
          </span>
          <button className="pp-close" onClick={handleClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* View Mode */}
        {mode === 'view' && (
          <div className="pp-body">
            <div className="pp-view">
              <div className="pp-view-avatar">
                {currentPicUrl ? (
                  <img src={currentPicUrl} alt={username} />
                ) : (
                  <svg viewBox="0 0 212 212" width="100%" height="100%">
                    <path fill="#DFE5E7" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/>
                    <path fill="#fff" d="M106 45c20.4 0 37 16.6 37 37s-16.6 37-37 37-37-16.6-37-37 16.6-37 37-37zm0 100c33.1 0 60 14.3 60 32v8H46v-8c0-17.7 26.9-32 60-32z"/>
                  </svg>
                )}
              </div>
              <span className="pp-view-name">{username}</span>

              {error && <p className="pp-error">{error}</p>}

              {!viewOnly && (
                <div className="pp-action-row">
                  <button className="pp-icon-btn" onClick={() => fileInputRef.current?.click()} disabled={deleting}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                    <span>Gallery</span>
                  </button>
                  {currentPicUrl && (
                    <button className="pp-icon-btn" onClick={handleEditExisting} disabled={deleting}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      <span>Edit</span>
                    </button>
                  )}
                  {currentPicUrl && (
                    <button className="pp-icon-btn" onClick={handleDelete} disabled={deleting}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                      <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit/Crop Mode */}
        {mode === 'edit' && imageSrc && (
          <div className="pp-edit">
            <div className="pp-crop-container">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="pp-edit-controls">
              <div className="pp-control-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
                <input
                  type="range"
                  className="pp-slider"
                  min={1} max={3} step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </div>
              <div className="pp-control-row">
                <button className="pp-rotate-btn" onClick={() => setRotation((r) => r - 90)} title="Rotate left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                </button>
                <button className="pp-rotate-btn" onClick={() => setRotation((r) => r + 90)} title="Rotate right">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
                  </svg>
                </button>
              </div>
            </div>

            {error && <p className="pp-error" style={{ padding: '0 20px' }}>{error}</p>}

            <div className="pp-edit-actions">
              <button className="pp-btn-cancel" onClick={() => { setMode('view'); setImageSrc(null); setError(''); }}>
                Cancel
              </button>
              <button className="pp-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <span className="pp-btn-spinner" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
};

export default ProfilePicModal;
