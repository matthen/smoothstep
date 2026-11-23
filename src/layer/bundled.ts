// The Canvas2D layer for pages on the site, which fetch its libraries and fonts from there. Loaded
// only when an animation has a Canvas2D layer.
import { asset } from '../lib/config';
import { fetchedAssets } from './assets';

export { CanvasLayer } from './CanvasLayer';

export const bundledAssets = fetchedAssets(asset);
