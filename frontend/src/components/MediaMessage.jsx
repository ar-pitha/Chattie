import React, { useState, useRef, useEffect } from 'react';

const MediaMessage = ({ message, isOwn }) => {
  if (!message.media) return null;

  const [isDownloading, setIsDownloading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef(null);
  const { mediaType, fileId, fileName, fileSizeKB, mimeType } = message.media;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

  // Construct download URL using fileId — append retry param to bust cache on retry
  const fullMediaUrl = `${apiBaseUrl}/media/download/${fileId}${retryCount ? `?r=${retryCount}` : ''}`;

  useEffect(() => {
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, []);

  // Auto-retry failed media loads (handles Render cold start where GridFS isn't ready yet)
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

  const downloadMedia = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      setIsDownloading(true);
      const response = await fetch(fullMediaUrl);
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || `media-${Date.now()}`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
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

  const openVideoFullscreen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const videoLink = document.createElement('a');
    videoLink.href = fullMediaUrl;
    videoLink.target = '_blank';
    videoLink.rel = 'noopener noreferrer';
    videoLink.click();
  };

  const renderMedia = () => {
    switch (mediaType) {
      case 'photo':
        return (
          <div className="media-thumbnail">
            <img
              src={fullMediaUrl}
              alt="Photo"
              className="photo-preview"
              onError={handleMediaError}
            />
            <button 
              className="media-download-btn"
              onClick={downloadMedia}
              disabled={isDownloading}
              title="Download photo"
              aria-label="Download photo"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        );

      case 'video':
        return (
          <div className="media-video-container">
            <video
              width="100%"
              height="auto"
              controls
              className="video-preview"
              preload="metadata"
              onError={handleMediaError}
            >
              <source src={fullMediaUrl} type={mimeType} />
              Your browser does not support the video tag.
            </video>
            <button 
              className="video-play-btn"
              onClick={openVideoFullscreen}
              title="Play in fullscreen"
              aria-label="Play video in fullscreen"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
            <button 
              className="media-download-btn video-download"
              onClick={downloadMedia}
              disabled={isDownloading}
              title="Download video"
              aria-label="Download video"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        );

      case 'document':
        const getDocIcon = () => {
          if (mimeType.includes('pdf')) return (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
            </svg>
          );
          if (mimeType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return (
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
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
              <div className="open-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </div>
            </button>
            <button 
              className="doc-download-btn"
              onClick={downloadMedia}
              disabled={isDownloading}
              title={`Download ${fileName}`}
              aria-label={`Download ${fileName}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isDownloading ? '...' : 'Download'}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`media-wrapper ${isOwn ? 'own' : 'other'}`}>
      <div className="media-content">
        {renderMedia()}
        {message.text && message.text !== `📎 ${fileName}` && (
          <div className="media-caption">{message.text}</div>
        )}
      </div>
    </div>
  );
};

export default MediaMessage;
