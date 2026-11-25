import type { CSSProperties } from 'react';

import { isVideoURL } from '../lib/media';

interface TextureThumbnailProps {
  src: string;
  alt: string;
  video?: boolean;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy";
}

// A texture's picture: an image, or a video's first frame.
export default function TextureThumbnail({src, alt, video = isVideoURL(src), className, style, loading}: TextureThumbnailProps) {
  if (video) {
    return (
      <video
        src={src} role="img" aria-label={alt} muted playsInline preload="auto"
        className={"videoThumbnail" + (className ? " " + className : "")} style={style}
      />
    );
  }
  return <img src={src} alt={alt} className={className} style={style} loading={loading} />;
}
