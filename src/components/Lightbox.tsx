import { useEffect, useState } from "react";
import { formatBytes } from "../format";
import type { Photo } from "../types";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalIcon } from "./Icons";

interface Props {
  photos: Photo[];
  index: number;
  onClose(): void;
}

/**
 * Full-size photo viewer. Opens fitted to the screen (never upscaled);
 * clicking the image toggles 100% (original pixel size) with scrolling.
 */
export function Lightbox({ photos, index: initialIndex, onClose }: Props) {
  const [index, setIndexState] = useState(initialIndex);
  const [actualSize, setActualSize] = useState(false);
  // Id of the photo whose full-size image has loaded (avoids resetting state in an effect).
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const photo = photos[index];
  const loaded = loadedId === photo?.id;

  const setIndex = (update: (i: number) => number) => {
    setIndexState(update);
    setActualSize(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // setIndex only uses state setters, so it is safe to omit.
  }, [photos.length, onClose]);

  if (!photo) return null;
  const multiple = photos.length > 1;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.fileName}>
      <div className={`lightbox-stage${actualSize ? " actual" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
        {!loaded && <img className="lightbox-placeholder" src={photo.thumbUrl} alt="" />}
        <img
          key={photo.id}
          className="lightbox-image"
          src={photo.url}
          alt={photo.fileName}
          width={photo.width}
          height={photo.height}
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoadedId(photo.id)}
          onClick={() => setActualSize((a) => !a)}
          title={actualSize ? "Click to fit to screen" : "Click for actual size"}
        />
      </div>

      <button type="button" className="lightbox-close icon-btn" onClick={onClose} aria-label="Close">
        <CloseIcon size={22} />
      </button>
      {multiple && (
        <>
          <button
            type="button"
            className="lightbox-nav prev icon-btn"
            aria-label="Previous photo"
            onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
          >
            <ChevronLeftIcon size={28} />
          </button>
          <button
            type="button"
            className="lightbox-nav next icon-btn"
            aria-label="Next photo"
            onClick={() => setIndex((i) => (i + 1) % photos.length)}
          >
            <ChevronRightIcon size={28} />
          </button>
        </>
      )}

      <div className="lightbox-bar">
        <span className="lightbox-name">{photo.fileName}</span>
        <span className="muted">
          {photo.width} × {photo.height} · {formatBytes(photo.size)}
          {multiple && ` · ${index + 1} / ${photos.length}`}
        </span>
        <button type="button" className="link-btn" onClick={() => setActualSize((a) => !a)}>
          {actualSize ? "Fit to screen" : "Actual size"}
        </button>
        <a href={photo.url} target="_blank" rel="noreferrer" className="link-btn">
          <ExternalIcon size={14} /> Original
        </a>
      </div>
    </div>
  );
}
