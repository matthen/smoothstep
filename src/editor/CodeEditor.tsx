import { EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LineError } from '../lib/types';
import { lastFrameName } from './completion';
import { editorExtensions, loadJavaScript, type EditorLanguage } from './extensions';
import type { CodeTabs, DefinitionElsewhere } from './goToDefinition';
import { errorLinePos, missingSkeleton, setLineErrors } from './lineErrors';
import { pickerEdit } from './popups';
import type { ShowExpression } from './showExpression';
import './editor.scss';

export interface CodeEditorProps {
  value: string;
  onChange(code: string, isHelperChange: boolean): void;
  onBuild(): void;
  onSave(): void;
  lineErrors: LineError[];
  // Kept but not shown, so another tab's editor keeps its undo history, cursor and scroll.
  hidden?: boolean;
  // What the code is written in. Fixed for the editor's life.
  language?: EditorLanguage;
  // Takes focus when it first shows, as a tab that's just been added does.
  autoFocus?: boolean;
  // The draw or mainImage this tab needs, which an error saying it's missing offers to insert.
  skeleton?: string;
  // After that's inserted.
  onFixed?(): void;
  // How a shader tab reads its own last frame, for the feedback snippet.
  lastFrame?: string;
  // Given the editor once it's made, and null when it goes, so code can be inserted from outside.
  onView?(view: EditorView | null): void;
  // Finds a name declared in another tab, for going to its definition.
  definitionElsewhere?: DefinitionElsewhere;
  // Shows a selected expression on the canvas, in a shader tab.
  onShowExpression?: ShowExpression;
  // The GLSL tabs, for finding and renaming a name's uses across them.
  codeTabs?: CodeTabs;
}

// Puts `code` at the cursor, on lines of its own, and shows it.
export function insertCode(view: EditorView, code: string) {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const before = state.sliceDoc(line.from, range.from).trim() ? '\n' : '';
  const after = state.sliceDoc(range.to, state.doc.lineAt(range.to).to).trim() ? '\n' : '';
  const text = before + code.replace(/\n$/, '') + after;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length - after.length },
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
}

export default function CodeEditor({
  value, onChange, onBuild, onSave, lineErrors, hidden, language = "glsl", autoFocus, skeleton, onFixed, lastFrame,
  onView, definitionElsewhere, onShowExpression, codeTabs,
}: CodeEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension | null>(null);
  const callbacksRef = useRef({ onChange, onBuild, onSave, onFixed, definitionElsewhere, onShowExpression, codeTabs });
  const lineErrorsRef = useRef(lineErrors);
  // The code the editor last reported or was given, so our own edits coming back as `value` are ignored.
  const knownValueRef = useRef(value);
  // Reports React hasn't caught up with: a fast picker drag can edit again before an older report's
  // effect runs, and that older code must not reset the editor.
  const reportedRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    callbacksRef.current = { onChange, onBuild, onSave, onFixed, definitionElsewhere, onShowExpression, codeTabs };
    lineErrorsRef.current = lineErrors;
  });

  useEffect(() => {
    const extensions = [
      editorExtensions({
        onBuild: () => callbacksRef.current.onBuild(),
        onSave: () => callbacksRef.current.onSave(),
        onFixed: () => callbacksRef.current.onFixed?.(),
        definitionElsewhere: (name) => callbacksRef.current.definitionElsewhere?.(name) ?? null,
        ...(onShowExpression ? { onShowExpression: (view, range) => callbacksRef.current.onShowExpression?.(view, range) } : {}),
        codeTabs: () => callbacksRef.current.codeTabs?.() ?? [],
      }, language),
      skeleton ? missingSkeleton.of(skeleton) : [],
      lastFrame ? lastFrameName.of(lastFrame) : [],
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const code = update.state.doc.toString();
        knownValueRef.current = code;
        reportedRef.current = [...reportedRef.current.slice(-49), code];
        const isHelperChange = update.transactions.some((tr) => tr.annotation(pickerEdit));
        callbacksRef.current.onChange(code, isHelperChange);
      }),
    ];
    extensionsRef.current = extensions;
    const view = new EditorView({
      parent: parentRef.current!,
      state: EditorState.create({ doc: knownValueRef.current, extensions }),
    });
    viewRef.current = view;
    if (language === "javascript") {
      // Until it loads, or if it can't, the code shows without colours.
      void loadJavaScript(view).catch((error: unknown) => console.error(error));
    }
    if (autoFocus) {
      view.focus();
    }
    onView?.(view);
    return () => {
      onView?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the view is made once; later props reach it through refs and the effects below

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === knownValueRef.current) {
      reportedRef.current = [];
      return;
    }
    if (reportedRef.current.includes(value)) return;
    knownValueRef.current = value;
    reportedRef.current = [];
    if (value === view.state.doc.toString()) return;
    // A new document gets a fresh state, so undo can't step back into the previous one.
    view.setState(EditorState.create({ doc: value, extensions: extensionsRef.current! }));
    if (language === "javascript") {
      void loadJavaScript(view).catch((error: unknown) => console.error(error));
    }
    view.dispatch({
      effects: setLineErrors.of(lineErrorsRef.current),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value, language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const first = lineErrors[0];
    view.dispatch({
      effects: [
        setLineErrors.of(lineErrors),
        ...(first ? [EditorView.scrollIntoView(errorLinePos(view.state, first), { y: 'nearest', yMargin: 48 })] : []),
      ],
    });
  }, [lineErrors]);

  // A hidden editor can't measure itself, so it does when it's shown again.
  useEffect(() => {
    if (!hidden) {
      viewRef.current?.requestMeasure();
    }
  }, [hidden]);

  return <div className="ss-code-editor" ref={parentRef} hidden={hidden} />;
}
