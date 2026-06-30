import React from 'react';
import { Music } from 'lucide-react';

export function SlideshowDisplay({ config, currentTime, duration }) {
  const normalizeSlides = (rawConfig) => {
    const rawSlides = Array.isArray(rawConfig)
      ? rawConfig
      : Array.isArray(rawConfig?.slides)
      ? rawConfig.slides
      : rawConfig && typeof rawConfig === 'object'
      ? [rawConfig]
      : [];

    const durationMs = Number.isFinite(duration) ? duration * 1000 : 0;

    return rawSlides
      .map((slide) => {
        const image = slide.image ?? slide.imagePath ?? slide.src ?? slide.url;

        const rawStart = Number(slide.start ?? slide.startMs ?? slide.startTime ?? 0);
        const rawEnd = Number(slide.end ?? slide.endMs ?? slide.endTime ?? durationMs);

        const start = Number.isFinite(rawStart) ? rawStart : 0;
        const end = Number.isFinite(rawEnd) ? rawEnd : durationMs;

        // durationが秒単位で与えられている設定を吸収
        const likelySeconds = duration > 0 && Math.max(start, end) <= duration + 1;

        return {
          ...slide,
          image,
          start: likelySeconds ? start * 1000 : start,
          end: likelySeconds ? end * 1000 : end,
        };
      })
      .filter((slide) => typeof slide.image === 'string' && slide.image.length > 0);
  };

  const slides = normalizeSlides(config);
  const currentTimeMs = currentTime * 1000;
  const currentImageIndex = slides.findIndex(
    (slide) => currentTimeMs >= slide.start && currentTimeMs < slide.end
  );

  if (slides.length === 0 || currentImageIndex === -1) {
    return (
      <div style={styles.albumArt}>
        <Music size={64} />
      </div>
    );
  }

  const currentImage = slides[currentImageIndex];

  return (
    <div style={styles.slideshowContainer}>
      <img
        src={currentImage.image}
        alt={`Slide ${currentImageIndex + 1}`}
        style={styles.slideshowImage}
      />
      <div style={styles.slideshowIndicator}>
        {currentImageIndex + 1} / {slides.length}
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
