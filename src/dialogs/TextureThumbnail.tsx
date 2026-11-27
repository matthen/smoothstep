// Texture tiles' pictures and video lengths, for the Textures tab and the texture picker.
import type { CSSProperties } from 'react';

import { isVideoURL } from '../lib/media';

interface TextureThumbnailProps {
  src: string;
  alt: string;
  video?: boolean;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy";
  // Called with a video's length in seconds once it's known.
  onDuration?(seconds: number): void;
}

// A texture's picture: an image, or a video's first frame.
export default function TextureThumbnail(
  {src, alt, video = isVideoURL(src), className, style, loading, onDuration}: TextureThumbnailProps,
) {
  if (video) {
    return (
      <video
        src={src} role="img" aria-label={alt} muted playsInline preload="auto"
        className={"videoThumbnail" + (className ? " " + className : "")} style={style}
        onLoadedMetadata={onDuration && (event => onDuration(event.currentTarget.duration))}
        onDurationChange={onDuration && (event => onDuration(event.currentTarget.duration))}
      />
    );
  }
  return <img src={src} alt={alt} className={className} style={style} loading={loading} />;
}

// A video's length in a tile's corner, always shown since a touch screen has no hover.
export function VideoLength({text}: {text: string | null | undefined}) {
  return text ? <span className="videoLength">{text}</span> : null;
}
