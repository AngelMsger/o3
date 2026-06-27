import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { sql } from '@codemirror/lang-sql';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { computeSuggestions } from '../lib/format';
import { makeEditorTheme, sqlHighlight } from './sqlEditorTheme';
import type { Field, QueryMode } from '../types';

// Imperative handle so the surrounding app can focus the editor and insert a
// field name at the caret (field-click), the same affordances the old textarea
// exposed via a ref.
export interface SqlEditorHandle {
  focus(): void;
  insertAtCursor(text: string): void;
}

export interface SqlEditorProps {
  value: string;
  mode: QueryMode;
  fields: Field[];
  accent: string;
  onChange: (v: string) => void;
  onRun: () => void;
}

// SqlEditor wraps a single CodeMirror 6 EditorView. It is controlled by `value`
// (synced via a transaction, guarded against echo) and reconfigures language +
// theme through Compartments rather than rebuilding the view.
export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, mode, fields, accent, onChange, onRun },
  ref,
) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Live refs keep the build-once extensions reading fresh callbacks/data.
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const fieldsRef = useRef(fields);
  onRunRef.current = onRun;
  onChangeRef.current = onChange;
  fieldsRef.current = fields;

  const langConf = useRef(new Compartment());
  const themeConf = useRef(new Compartment());

  // Stable completion source reading the latest live fields (keywords + funcs +
  // stream fields), reusing the same computeSuggestions logic as before.
  const completionSourceRef = useRef<((ctx: CompletionContext) => CompletionResult | null) | null>(null);
  if (!completionSourceRef.current) {
    completionSourceRef.current = (ctx: CompletionContext): CompletionResult | null => {
      const word = ctx.matchBefore(/[\w.]+/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      const items = computeSuggestions(word.text, fieldsRef.current);
      if (items.length === 0) return null;
      return {
        from: word.from,
        options: items.map((s) => ({ label: s.label, type: s.kind, detail: s.detail })),
        validFor: /^[\w.]*$/,
      };
    };
  }

  // Language extensions: SQL grammar + native autocomplete in SQL mode; plain
  // text (no completion) in free-text search mode.
  const languageExt = (m: QueryMode) =>
    m === 'sql'
      ? [sql(), autocompletion({ override: [completionSourceRef.current!] })]
      : [];

  // Build the editor once.
  useEffect(() => {
    if (!elRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        syntaxHighlighting(sqlHighlight),
        langConf.current.of(languageExt(mode)),
        themeConf.current.of(makeEditorTheme(accent)),
        keymap.of([
          { key: 'Mod-Enter', preventDefault: true, run: () => { onRunRef.current(); return true; } },
          ...completionKeymap, // Tab/Enter accept, arrows navigate, Esc close
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: elRef.current });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // Build once; later prop changes flow through the dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value -> editor, guarded so our own edits don't loop.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Reconfigure language/autocomplete when the query mode changes.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: langConf.current.reconfigure(languageExt(mode)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Re-theme (caret + selection) when the accent changes.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeConf.current.reconfigure(makeEditorTheme(accent)) });
  }, [accent]);

  useImperativeHandle(ref, () => ({
    focus() { viewRef.current?.focus(); },
    insertAtCursor(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const sel = view.state.selection.main;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: sel.from + text.length },
      });
      view.focus();
    },
  }), []);

  return <div ref={elRef} style={{ width: '100%' }} />;
});
