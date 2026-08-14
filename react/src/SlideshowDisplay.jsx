import React from 'react';
import { Music } from 'lucide-react';

export function SlideshowDisplay({ config, currentTime, duration }) {
  // durationMsをコンポーネント全体で使えるように外側で定義
  const durationMs = Number.isFinite(duration) ? duration * 1000 : 0;

  const normalizeSlides = (rawConfig) => {
    const rawSlides = Array.isArray(rawConfig)
      ? rawConfig
      : Array.isArray(rawConfig?.slides)
      ? rawConfig.slides
      : rawConfig && typeof rawConfig === 'object'
      ? [rawConfig]
      : [];

    const pickNumber = (...candidates) => {
      for (const value of candidates) {
        if (value === undefined || value === null) continue;
        const num = Number(value);
        if (Number.isFinite(num)) return num;
      }
      return null;
    };

    const parsed = rawSlides
      .map((slide) => ({
        ...slide,
        image: slide.image ?? slide.imagePath ?? slide.src ?? slide.url,
        rawStart: pickNumber(slide.start, slide.startMs, slide.startTime) ?? 0,
        // end は省略可。省略時は「次のスライドが始まるまで」表示する。
        rawEnd: pickNumber(slide.end, slide.endMs, slide.endTime),
      }))
      .filter((slide) => typeof slide.image === 'string' && slide.image.length > 0)
      .sort((a, b) => a.rawStart - b.rawStart);

    // 秒指定かミリ秒指定かは、設定ファイル全体の最大値で一度だけ判定する。
    // （スライドごとに判定すると、end を省略したスライドだけ単位がずれる）
    const explicitValues = parsed.flatMap((s) =>
      s.rawEnd === null ? [s.rawStart] : [s.rawStart, s.rawEnd]
    );
    const maxValue = explicitValues.length ? Math.max(...explicitValues) : 0;
    const inSeconds = duration > 0 && maxValue <= duration + 1;
    const toMs = (value) => (inSeconds ? value * 1000 : value);

    return parsed.map((slide, index) => {
      const next = parsed[index + 1];
      const end =
        slide.rawEnd !== null
          ? toMs(slide.rawEnd)
          : next
          ? toMs(next.rawStart)
          : durationMs || Infinity;

      return { ...slide, start: toMs(slide.rawStart), end };
    });
  };

  const slides = normalizeSlides(config);
  const currentTimeMs = currentTime * 1000;

  // 再生終了しているかどうかの判定
  const isEnded = durationMs > 0 && currentTimeMs >= durationMs;

  // 現在時刻がスライドの表示期間（start <= currentTime < end）に合致するインデックスを探す
  const currentImageIndex = isEnded
    ? -1
    : slides.findIndex(
        (slide) => currentTimeMs >= slide.start && currentTimeMs < slide.end
      );

  // 該当するスライドがない、または再生終了後はアイコン（非表示状態）を表示
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
