// The pane with the code tabs, each tab's editor, and the docs.
import { Button, Switch, Text, Tooltip } from '@mantine/core';
import type { EditorView } from '@codemirror/view';
import { lazy, Suspense } from 'react';
import { TbHammer } from 'react-icons/tb';

import CodeEditor from '../../editor/CodeEditor';
import type { Range } from '../../editor/glslDefinitions';
import ShaderTabs, { shaderCaption, shaderName, starterFunction } from '../../editor/ShaderTabs';
import { canvasLayer, withCanvasLayer } from '../../lib/document';
import type { ShaderId } from '../../render/Renderer';
import type { useCodeTabs } from './useCodeTabs';
import type { useDocument } from '../document/useDocument';

// Loaded when the Docs tab is first shown, with the pages.
const ReferencePanel = lazy(() => import('../../reference/ReferencePanel'));

interface Props {
  docState: ReturnType<typeof useDocument>;
  tabs: ReturnType<typeof useCodeTabs>;
  onBuild: () => void;
  onSave: () => void;
  // A fix for a build error was applied, so the code should build again.
  onFixed: () => void;
  onCodeChange: (tab: ShaderId, code: string, isHelperChange: boolean) => void;
  onShowExpression: (tab: ShaderId, view: EditorView, range: Range | null) => void;
  onView: (tab: ShaderId, view: EditorView | null) => void;
  onPickerEdit: (tab: ShaderId, code: string, from: number, to: number) => boolean;
  onPickerRelease: (tab: ShaderId, code: string | null) => void;
}

export default function EditorPane({
  docState, tabs, onBuild, onSave, onFixed, onCodeChange, onShowExpression, onView, onPickerEdit, onPickerRelease,
}: Props) {
  const {doc, layer, buildState, errorShader, lineErrors, layerErrors} = docState;
  const {codeTab, docs, docsShown, showCodeTab, codeTabs} = tabs;
  const showRemoved = (tab: ShaderId | null) => {
    if (tab !== null) {
      tabs.setCodeTab(tab);
    }
  };
  return (
    <section className="editorPane">
      {/* Before the code, so on phones it can't stick higher than the code's first line. */}
      {buildState !== "built" && !docsShown &&
        <Tooltip label="Shift + Enter" position="top">
          <Button
            className="buildButton" onClick={onBuild} leftSection={<TbHammer />}
            color={buildState === "error" ? "red" : undefined}
          >
            Build
          </Button>
        </Tooltip>}
      <ShaderTabs
        numBuffers={doc.buffers?.length ?? 0} hasShared={doc.shared !== undefined} hasCanvas={layer !== undefined}
        current={docsShown ? "docs" : codeTab} hasDocs={docs !== null}
        errors={[...(errorShader === null ? [] : [errorShader]), ...(layerErrors.length > 0 ? ["canvas" as const] : [])]}
        onChoose={showCodeTab}
        onAdd={() => showCodeTab(docState.addBuffer())} onRemoveLast={() => showRemoved(docState.removeLastBuffer())}
        onAddCanvas={() => showCodeTab(docState.addCanvasLayer())}
        onRemoveCanvas={() => showRemoved(docState.removeCanvasLayer())}
        onAddShared={() => showCodeTab(docState.addShared())} onRemoveShared={() => showRemoved(docState.removeShared())}
        onChooseDocs={() => tabs.setDocsShown(true)} onCloseDocs={tabs.closeDocs}
      />
      {/* Captions say how the tabs relate, so a lone Image.glsl tab has none. */}
      {!docsShown && codeTabs.length > 1 && <div className="codeCaption">
        {layer && codeTab === "canvas" &&
          <Tooltip
            label="Off: the drawing only shows where a shader reads iCanvas2D" position="bottom-start" openDelay={400}
          >
            <div>
              <Switch
                size="xs" className="overlaySwitch" label="Draw over the image" checked={layer.overlay}
                onChange={event => {
                  const overlay = event.currentTarget.checked;
                  docState.edit(d => withCanvasLayer(d, {...canvasLayer(d)!, overlay}));
                }}
              />
            </div>
          </Tooltip>}
        <Text size="xs" c="dimmed">{shaderCaption(codeTab)}</Text>
      </div>}
      {codeTabs.map(({tab, code}) =>
        <CodeEditor
          key={tab} value={code} hidden={docsShown || tab !== codeTab} language={tab === "canvas" ? "javascript" : "glsl"}
          onChange={(changed, isHelperChange) => onCodeChange(tab, changed, isHelperChange)}
          onBuild={onBuild} onSave={onSave}
          lineErrors={tab === "canvas" ? layerErrors : errorShader === tab ? lineErrors : []}
          autoFocus={tab === docState.justAdded}
          skeleton={starterFunction(tab)} onFixed={onFixed}
          lastFrame={typeof tab === "number" ? "iBuffer" + tab : "iPrevFrame"}
          definitionElsewhere={tab === "shared" || tab === "canvas" ? undefined : tabs.sharedDefinition}
          onShowExpression={tab === "canvas" ? undefined : (view, range) => onShowExpression(tab, view, range)}
          codeTabs={tabs.glslTabs}
          onView={view => onView(tab, view)}
          onPickerEdit={(changed, from, to) => onPickerEdit(tab, changed, from, to)}
          onPickerRelease={changed => onPickerRelease(tab, changed)}
        />)}
      {docs && tabs.docsLoaded &&
        <Suspense fallback={<div className="referencePanel" hidden={!docsShown} />}>
          <ReferencePanel
            target={docs} active={docsShown} tabName={shaderName(codeTab)}
            language={codeTab === "canvas" ? "js" : "glsl"} hasCanvas={layer !== undefined} onInsert={tabs.insertFromDocs}
          />
        </Suspense>}
    </section>
  );
}
