import { EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LineError } from '../lib/types';
import { editorExtensions } from './extensions';
import { errorLinePos, setLineErrors } from './lineErrors';
import { pickerEdit } from './popups';
import './editor.scss';

export interface CodeEditorProps {
  value: string;
  onChange(code: string, isHelperChange: boolean): void;
  onBuild(): void;
  onSave(): void;
  lineErrors: LineError[];
}

export default function CodeEditor({ value, onChange, onBuild, onSave, lineErrors }: CodeEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension | null>(null);
  const callbacksRef = useRef({ onChange, onBuild, onSave });
  const lineErrorsRef = useRef(lineErrors);
  // The code the editor last reported or was given, so our own edits coming back as `value` are ignored.
  const knownValueRef = useRef(value);

  useLayoutEffect(() => {
    callbacksRef.current = { onChange, onBuild, onSave };
    lineErrorsRef.current = lineErrors;
  });

  useEffect(() => {
    const extensions = [
      editorExtensions({
        onBuild: () => callbacksRef.current.onBuild(),
        onSave: () => callbacksRef.current.onSave(),
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const code = update.state.doc.toString();
        knownValueRef.current = code;
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
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === knownValueRef.current) return;
    knownValueRef.current = value;
    if (value === view.state.doc.toString()) return;
    // A new document gets a fresh state, so undo can't step back into the previous one.
    view.setState(EditorState.create({ doc: value, extensions: extensionsRef.current! }));
    view.dispatch({
      effects: setLineErrors.of(lineErrorsRef.current),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value]);

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

  return <div className="ss-code-editor" ref={parentRef} />;
}
