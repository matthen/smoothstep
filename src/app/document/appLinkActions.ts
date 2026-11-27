// What each link in a code comment, like "[Help → Tutorial]" or "[Sliders]", does.
import type { AppLink } from '../../lib/appLinks';
import { DOC_SECTIONS, type DocTarget } from '../../lib/docLinks';
import { REPO_URL } from '../../lib/config';
import type { ShaderId } from '../../render/Renderer';
import type { Dialog } from '../AppDialogs';
import type { PanelTab } from '../layout/useLayout';

export interface AppActions {
  newAnimation: () => void;
  openTutorial: () => void;
  showDialog: (dialog: Dialog) => void;
  save: () => void;
  download: () => void;
  takeTour: () => void;
  openReference: (target: DocTarget) => void;
  openDocumentation: () => void;
  showPanel: (tab: PanelTab) => void;
  showCode: (tab: ShaderId) => void;
}

export function appLinkActions(app: AppActions): Record<AppLink, () => void> {
  return {
    "File → New": app.newAnimation,
    "File → Open": () => app.showDialog("open"),
    "File → Save": app.save,
    "File → Import": () => app.showDialog("import"),
    "File → Export": app.download,
    "Help → Welcome": () => app.showDialog("splash"),
    "Help → Take the tour": app.takeTour,
    "Help → Tutorial": app.openTutorial,
    "Help → Shader inputs": () => app.openReference(DOC_SECTIONS.reference),
    "Help → Keyboard shortcuts": () => app.openReference(DOC_SECTIONS.shortcuts),
    "Help → Documentation": app.openDocumentation,
    "Help → Source code": () => window.open(REPO_URL, "_blank", "noopener"),
    "Help → Acknowledgements": () => app.openReference(DOC_SECTIONS.acknowledgements),
    "Timeline": () => app.showPanel("animation"),
    "Animation": () => app.showPanel("animation"),
    "Sliders": () => app.showPanel("sliders"),
    "Textures": () => app.showPanel("textures"),
    "Console": () => app.showPanel("console"),
    "Image.glsl": () => app.showCode("image"),
    "Image": () => app.showCode("image"),
    "shared.glsl": () => app.showCode("shared"),
    "Shared GLSL": () => app.showCode("shared"),
    "Shared": () => app.showCode("shared"),
    "Canvas2D.js": () => app.showCode("canvas"),
    "Canvas2D": () => app.showCode("canvas"),
    "Canvas": () => app.showCode("canvas"),
    "iBuffer0.glsl": () => app.showCode(0),
    "iBuffer1.glsl": () => app.showCode(1),
    "iBuffer2.glsl": () => app.showCode(2),
    "iBuffer3.glsl": () => app.showCode(3),
    "iBuffer0": () => app.showCode(0),
    "iBuffer1": () => app.showCode(1),
    "iBuffer2": () => app.showCode(2),
    "iBuffer3": () => app.showCode(3),
  };
}
