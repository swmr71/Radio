import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';

export function SlideshowDisplay({ config, currentTime, duration }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (!config || config.length === 0) return;

    // currentTime に一致するスライドがあれば使い、なければ直近のスライドを使う
    const imageIndex = config.findIndex(
      (slide) => currentTime >= slide.start && currentTime < slide.end
    );

    if (imageIndex !== -1) {
      setCurrentImageIndex(imageIndex);
      return;
    }

    const fallbackIndex = config.reduce((latestIndex, slide, index) => {
      if (currentTime >= slide.start) {
        return index;
      }
      return latestIndex;
    }, 0);

    setCurrentImageIndex(fallbackIndex);
  }, [currentTime, config]);

  if (!config || config.length === 0) {
    return (
      <div style={styles.albumArt}>
        <Music size={64} />
      </div>
    );
  }

  const currentImage = config[currentImageIndex];

  return (
    <div style={styles.slideshowContainer}>
      <img
        src={currentImage.image}
        alt={`Slide ${currentImageIndex + 1}`}
        style={styles.slideshowImage}
      />
      <div style={styles.slideshowIndicator}>
        {currentImageIndex + 1} / {config.length}
      </div>
    </div>
  );
}

export default SlideshowDisplay;

const styles = {
  albumArt: {
    width: '200px',
    height: '200px',
    backgroundColor: '#4f46e5',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 2rem',
    color: '#fff',
  },
  slideshowContainer: {
    width: '200px',
    height: '200px',
    borderRadius: '20px',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 2rem',
  },
  slideshowImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.3s ease-out',
  },
  slideshowIndicator: {
    position: 'absolute',
    bottom: '10px',
    right: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    fontSize: '0.85rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontWeight: '600',
  },
};
