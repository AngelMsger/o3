import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// sqlHighlight maps Lezer SQL syntax tags to the design's editor palette
// (Observe.dc.html lines 193-260). Default identifiers fall through to the
// theme's base text color.
export const sqlHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#ff7b9c' },
  { tag: [t.string, t.special(t.string)], color: '#a3e08c' },
  { tag: [t.number, t.bool, t.null], color: '#f6c177' },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: '#7dd3fc' },
  { tag: [t.operator, t.punctuation, t.separator, t.paren, t.bracket], color: '#7b8496' },
  { tag: [t.variableName, t.propertyName], color: '#cfd6e4' },
  { tag: t.comment, color: '#4b5362', fontStyle: 'italic' },
]);

// makeEditorTheme builds the CodeMirror theme. It reacts to the runtime accent
// (caret + selection) so changing the accent in Settings recolors the editor.
// Lives in a Compartment so it can be reconfigured without rebuilding the view.
export function makeEditorTheme(accent: string) {
  const selectionBg = 'rgba(45, 212, 191, 0.18)';
  return EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', color: '#cfd6e4' },
      '.cm-content': {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12.5px',
        lineHeight: '19px',
        padding: '10px 12px',
        caretColor: accent,
        minHeight: '76px',
      },
      '.cm-scroller': { lineHeight: '19px', maxHeight: '220px' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: selectionBg,
      },
      '.cm-gutters': {
        backgroundColor: '#0b0d12',
        color: '#3a4150',
        border: 'none',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 9px 0 16px' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
      '&.cm-focused': { outline: 'none' },

      // Autocomplete tooltip — matches the design's suggestions dropdown.
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: "'JetBrains Mono', monospace",
        backgroundColor: '#0f131a',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '9px',
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.8)',
        maxHeight: '252px',
        padding: '4px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        padding: '6px 8px',
        borderRadius: '6px',
        color: '#dde3ee',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: '#161b23',
        color: '#fff',
      },
      '.cm-completionLabel': { fontSize: '12px' },
      '.cm-completionDetail': {
        marginLeft: 'auto',
        color: '#5b6371',
        fontStyle: 'normal',
        fontSize: '10px',
      },
      // Colored badge per completion kind (K / ƒ / · in the design colors).
      '.cm-completionIcon': { width: '1.1em', paddingRight: '2px', opacity: '1', textAlign: 'center' },
      '.cm-completionIcon-keyword::after': { content: "'K'", color: '#ff7b9c', fontWeight: '700' },
      '.cm-completionIcon-function::after': { content: "'\\0192'", color: '#7dd3fc', fontWeight: '700' },
      '.cm-completionIcon-field::after': { content: "'\\00B7'", color: '#a3e08c', fontWeight: '700' },
    },
    { dark: true },
  );
}
