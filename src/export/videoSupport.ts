// Why video can't be exported here, or null if it can. Browsers only offer WebCodecs' VideoEncoder
// to pages on https or localhost, so a copy served over plain http lacks it in any browser.
export function noVideoReason(): string | null {
  if (typeof VideoEncoder !== "undefined") {
    return null;
  }
  if (!window.isSecureContext) {
    return "Browsers only encode video for pages opened over https, or from this computer. Export a GIF or " +
      "PNG frames instead, or open smoothstep.io from an https address.";
  }
  return "This browser can't encode video. Export a GIF or PNG frames instead, or use a recent version of " +
    "Chrome, Edge, Firefox or Safari.";
}
