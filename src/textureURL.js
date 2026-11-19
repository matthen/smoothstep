import { asset } from './config';
import * as localStore from './localStore';

const MISSING = "/images/textures/special/black.png";

// URL of a texture slot's image: a built-in texture, or an upload from the browser's
// store (black if this browser doesn't have that image).
export default function textureURL(texture) {
  if (!texture.isUserUploaded) {
    return asset("/images/textures/" + texture.url);
  }
  return localStore.imageURL(texture.url) || asset(MISSING);
}
