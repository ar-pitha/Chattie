import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';

const MediaMessage = ({ message, isOwn, onReply, replyingTo, allMedia = [] }) => {
  if (!message.media) return null;

  const [isDownloading, setIsDownloading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [viewingIndex, setViewingIndex] = useState(-1);
  const retryTimerRef = useRef(null);
  const wrapperRef = useRef(null);
  const { mediaType, fileId, fileName, fileSizeKB, mimeType } = message.media;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

  const getMediaUrl = (fId, retry = 0) =>
    `${apiBaseUrl}/media/download/${fId}${retry ? `?r=${retry}` : ''}`;

  const fullMediaUrl = getMediaUrl(fileId, retryCount);

  // Current viewing message (for navigation)
  const viewingMsg = viewingIndex >= 0 && viewingIndex < allMedia.length ? allMedia[viewingIndex] : message;
  const viewingUrl = viewingMsg === message ? fullMediaUrl : getMediaUrl(viewingMsg.media.fileId);
  const hasPrev = viewingIndex > 0;
  const hasNext = viewingIndex < allMedia.length - 1;

  useEffect(() => {
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, []);

  const handleMediaError = (e) => {
    if (retryCount < 3) {
      retryTimerRef.current = setTimeout(() => setRetryCount((c) => c + 1), 2000);
    } else if (e?.target?.tagName === 'IMG') {
      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dy=".3em" text-anchor="middle" fill="%23999" font-size="16"%3EImage not found%3C/text%3E%3C/svg%3E';
    }
  };

  const formatFileSize = (kb) => {
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const downloadMedia = async (e, url, name) => {
    e.preventDefault();
    e.stopPropagation();
    const dlUrl = url || viewingUrl;
    const dlName = name || viewingMsg.media.fileName || `media-${Date.now()}`;

    try {
      setIsDownloading(true);
      const response = await fetch(dlUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = dlName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        setIsDownloading(false);
      }, 100);
    } catch (error) {
      console.error('Download failed:', error);
      setIsDownloading(false);
    }
  };

  const openDocument = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(fullMediaUrl, '_blank', 'noopener,noreferrer');
  };

  const openLightbox = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Find this message's index in all media
    const idx = allMedia.findIndex(m => String(m._id) === String(message._id));
    setViewingIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  };

  const closeLightbox = useCallback((e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setLightboxOpen(false);
    setViewingIndex(-1);
  }, []);

  const goPrev = useCallback((e) => {
    e.stopPropagation();
    if (hasPrev) setViewingIndex(i => i - 1);
  }, [hasPrev]);

  const goNext = useCallback((e) => {
    e.stopPropagation();
    if (hasNext) setViewingIndex(i => i + 1);
  }, [hasNext]);


  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft' && hasPrev) setViewingIndex(i => i - 1);
      if (e.key === 'ArrowRight' && hasNext) setViewingIndex(i => i + 1);
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [lightboxOpen, closeLightbox, hasPrev, hasNext]);

  const renderMedia = () => {
    switch (mediaType) {
      case 'photo':
        return (
          <div className="media-thumbnail" onClick={openLightbox} style={{ cursor: 'pointer' }}>
            <img
              src={fullMediaUrl}
              alt="Photo"
              className="photo-preview"
              onError={handleMediaError}
            />
          </div>
        );

      case 'video':
        return (
          <div className="media-video-container" onClick={openLightbox} style={{ cursor: 'pointer' }}>
            <video
              width="100%"
              height="auto"
              className="video-preview"
              preload="metadata"
              muted
              onError={handleMediaError}
            >
              <source src={fullMediaUrl} type={mimeType} />
            </video>
            <div className="video-play-btn">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
        );

      case 'document':
        const getDocIcon = () => {
          if (mimeType.includes('pdf')) return (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
            </svg>
          );
          if (mimeType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
            </svg>
          );
          return (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          );
        };

        return (
          <div className="media-document-wrapper">
            <button
              className="media-document"
              onClick={openDocument}
              title={`Open ${fileName}`}
              aria-label={`Open ${fileName}`}
            >
              <div className="doc-icon">{getDocIcon()}</div>
              <div className="doc-info">
                <div className="doc-name" title={fileName}>{fileName}</div>
                <div className="doc-size">{formatFileSize(fileSizeKB)}</div>
              </div>
              <div className="doc-download-icon" onClick={(e) => downloadMedia(e, fullMediaUrl, fileName)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const renderViewerMedia = () => {
    const vType = viewingMsg.media.mediaType;
    const vMime = viewingMsg.media.mimeType;
    if (vType === 'photo') {
      return <img src={viewingUrl} alt="Photo" className="media-viewer-image" />;
    }
    if (vType === 'video') {
      return <video key={viewingUrl} src={viewingUrl} controls autoPlay className="media-viewer-video" />;
    }
    return null;
  };

  return (
    <>
      <div ref={wrapperRef} className={`media-wrapper ${isOwn ? 'own' : 'other'}`}>
        <div className="media-content">
          {renderMedia()}
          {message.text && message.text !== `📎 ${fileName}` && (
            <div className="media-caption">{message.text}</div>
          )}
        </div>
      </div>

      {lightboxOpen && ReactDOM.createPortal(
        <div className="media-viewer-overlay">
          {/* Top bar */}
          <div className="media-viewer-topbar">
            <button className="media-viewer-back" onClick={closeLightbox} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="media-viewer-topbar-info">
              <span className="media-viewer-topbar-name">{viewingMsg.sender === (isOwn ? message.sender : message.sender) ? viewingMsg.sender : viewingMsg.sender}</span>
              <span className="media-viewer-topbar-time">
                {new Date(viewingMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <span className="media-viewer-counter">{viewingIndex + 1} / {allMedia.length}</span>
            <button
              className="media-viewer-download"
              onClick={(e) => downloadMedia(e)}
              disabled={isDownloading}
              aria-label="Download"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          </div>

          {/* Media body with nav arrows at bottom */}
          <div className="media-viewer-body">
            <div className="media-viewer-content">
              {renderViewerMedia()}
            </div>

            {allMedia.length > 1 && (
              <div className="media-viewer-nav">
                <button className="media-viewer-arrow" onClick={goPrev} disabled={!hasPrev} aria-label="Previous">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button className="media-viewer-arrow" onClick={goNext} disabled={!hasNext} aria-label="Next">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Caption */}
          {viewingMsg.text && viewingMsg.text !== `📎 ${viewingMsg.media.fileName}` && (
            <div className="media-viewer-caption">{viewingMsg.text}</div>
          )}
        </div>,
        wrapperRef.current?.closest('.chat-window') || document.body
      )}
    </>
  );
};

export default MediaMessage;
