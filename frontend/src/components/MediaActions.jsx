import React, { useRef, useState, useEffect } from 'react';
import '../styles/MediaActions.css';

const MediaActions = ({ onPhotoSelect, onVideoSelect, onDocumentSelect, isLoading, onMenuToggle }) => {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const [showMenu, setShowMenu] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  useEffect(() => {
    onMenuToggle?.(showMenu);
  }, [showMenu, onMenuToggle]);

  const handleFileSelect = (e, mediaType, callback) => {
    const file = e.target.files?.[0];
    if (file) {
      callback(file, mediaType);
      setShowMenu(false);
    }
    e.target.value = '';
  };

  return (
    <div className="media-actions-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`attach-btn ${showMenu ? 'active' : ''}`}
        onClick={() => setShowMenu(!showMenu)}
        disabled={isLoading}
        aria-label="Attach file"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#6b6b80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>

      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => handleFileSelect(e, 'photo', onPhotoSelect)} style={{ display: 'none' }} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-msvideo" onChange={(e) => handleFileSelect(e, 'video', onVideoSelect)} style={{ display: 'none' }} />
      <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => handleFileSelect(e, 'document', onDocumentSelect)} style={{ display: 'none' }} />
    </div>
  );
};

// Separate export for the popup panel (rendered outside MediaActions)
export const MediaPopup = ({ show, onPhotoClick, onVideoClick, onDocumentClick, isLoading }) => {
  if (!show) return null;

  return (
    <div className="media-popup-panel">
      <button type="button" className="media-popup-item" onClick={onPhotoClick} disabled={isLoading}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6b6b80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>Photos</span>
      </button>
      <button type="button" className="media-popup-item" onClick={onVideoClick} disabled={isLoading}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6b6b80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        <span>Video</span>
      </button>
      <button type="button" className="media-popup-item" onClick={onDocumentClick} disabled={isLoading}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6b6b80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
        </svg>
        <span>Document</span>
      </button>
    </div>
  );
};

export default MediaActions;
