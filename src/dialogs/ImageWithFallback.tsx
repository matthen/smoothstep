import { useState, type ImgHTMLAttributes } from 'react';

// An image which hides itself if it fails to load.
export default function ImageWithFallback(props: ImgHTMLAttributes<HTMLImageElement> & {src: string}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === props.src) {
    return null;
  }
  return <img {...props} onError={() => setFailedSrc(props.src)} />;
}
