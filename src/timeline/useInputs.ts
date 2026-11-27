// The timeline's rows and the texture slots the panels show, from what the code uses and the animation sets.
import { useCallback, useMemo, useState } from 'react';

import { textureURL } from '../lib/config';
import { useImagesChanged } from '../dialogs/useImagesChanged';
import { bufferCodes, EMPTY_TEXTURE, layerTextureURLs, type AnimationDocument } from '../lib/document';
import { floatNames } from './names';
import { floatsInCode, inputsInCode } from './Sliders';

export function useInputs(doc: AnimationDocument) {
  const imagesVersion = useImagesChanged();
  // Every tab's code, the image's first, so its #define names win.
  const allCode = useMemo(() => [doc.code, doc.shared ?? "", ...bufferCodes(doc)].join("\n"), [doc]);
  const floatNameList = useMemo(() => floatNames(allCode), [allCode]);
  // Timeline rows: at least three, and enough for every iFloat the code uses or the timeline sets.
  const [minRows, setMinRows] = useState(3);
  const rowCount = useMemo(() => {
    const needed = [
      ...floatsInCode(allCode),
      ...doc.variables.flatMap((v, i) => v.transitions.length > 0 || v.value !== undefined ? [i] : []),
    ];
    return Math.max(minRows, ...needed.map(i => i + 1));
  }, [allCode, doc.variables, minRows]);
  const resetRows = useCallback(() => setMinRows(3), []);
  // Texture slots, the same way: at least three, and enough for every one the code uses or that has an image.
  const [minSlots, setMinSlots] = useState(3);
  const slotCount = useMemo(() => {
    const needed = [
      ...inputsInCode(allCode, "iTexture"),
      ...doc.textures.flatMap((t, i) => t.url !== EMPTY_TEXTURE || t.isUserUploaded ? [i] : []),
    ];
    return Math.min(doc.textures.length, Math.max(minSlots, ...needed.map(i => i + 1)));
  }, [allCode, doc.textures, minSlots]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- imagesVersion isn't read, but a changed stored image means new URLs
  const textureURLs = useMemo(() => doc.textures.map(textureURL), [doc.textures, imagesVersion]);
  const layerTextures = useMemo(() => layerTextureURLs(doc.textures, textureURLs), [doc.textures, textureURLs]);

  return {
    allCode, floatNameList, rowCount, addRow: () => setMinRows(rowCount + 1), resetRows,
    slotCount, addSlot: () => setMinSlots(slotCount + 1), textureURLs, layerTextures,
  };
}
