// The images a Canvas2D layer's texture slots show, decoded once each. Each worker is sent its own
// copies, so closing these doesn't take them from running workers.

// An image's bitmap, or null if it couldn't be loaded or decoded.
export type BitmapLoader = (url: string) => Promise<ImageBitmap | null>;

export async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } catch {
    return null;
  }
}

export class TextureBitmaps {
  private bitmaps = new Map<string, Promise<ImageBitmap | null>>();

  constructor(private load: BitmapLoader) {}

  // One that failed stays null while a slot shows it.
  get(url: string): Promise<ImageBitmap | null> {
    let bitmap = this.bitmaps.get(url);
    if (!bitmap) {
      bitmap = this.load(url);
      this.bitmaps.set(url, bitmap);
    }
    return bitmap;
  }

  // Closes the images no slot shows any more.
  keepOnly(urls: readonly (string | null)[]) {
    for (const [url, bitmap] of this.bitmaps) {
      if (!urls.includes(url)) {
        void bitmap.then(b => b?.close());
        this.bitmaps.delete(url);
      }
    }
  }

  dispose() {
    this.keepOnly([]);
  }
}
