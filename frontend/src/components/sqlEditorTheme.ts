import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// sqlHighlight maps Lezer SQL syntax tags to the design's editor palette
// (Observe.dc.html lines 193-260), via the --sy-*/--tx-* theme tokens so the
// editor recolors with the light/dark theme. Default identifiers fall through
// to the theme's base text color.
export const sqlHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--sy-kw)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--sy-str)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--sy-num)' },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: 'var(--sy-fn)' },
  { tag: [t.operator, t.punctuation, t.separator, t.paren, t.bracket], color: 'var(--tx-7b)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--tx-03)' },
  { tag: t.comment, color: 'var(--tx-12)', fontStyle: 'italic' },
]);

// makeEditorTheme builds the CodeMirror theme. Colors resolve from theme tokens
// (via CSS custom properties) so they follow the light/dark theme; caret and
// selection react to the runtime accent. `isDark` sets CodeMirror's own dark
// flag so its built-in defaults match the active theme. Lives in a Compartment
// so it can be reconfigured (accent/theme change) without rebuilding the view.
export function makeEditorTheme(accent: string, isDark: boolean) {
  const selectionBg = 'rgba(45, 212, 191, 0.18)';
  return EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', color: 'var(--tx-03)' },
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
        backgroundColor: 'var(--sf-02)',
        color: 'var(--tx-14)',
        border: 'none',
        borderRight: '1px solid rgba(var(--ink), 0.05)',
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
        backgroundColor: 'var(--sf-pop)',
        border: '1px solid rgba(var(--ink), 0.12)',
        borderRadius: '9px',
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.8)',
        maxHeight: '252px',
        padding: '4px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
        padding: '6px 8px',
        borderRadius: '6px',
        color: 'var(--tx-01)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--sf-hov2)',
        color: 'var(--tx-max)',
      },
      '.cm-completionLabel': { fontSize: '12px' },
      '.cm-completionDetail': {
        marginLeft: 'auto',
        color: 'var(--tx-10)',
        fontStyle: 'normal',
        fontSize: '10px',
      },
      // Colored badge per completion kind (K / ƒ / · in the design colors).
      '.cm-completionIcon': { width: '1.1em', paddingRight: '2px', opacity: '1', textAlign: 'center' },
      '.cm-completionIcon-keyword::after': { content: "'K'", color: 'var(--sy-kw)', fontWeight: '700' },
      '.cm-completionIcon-function::after': { content: "'\\0192'", color: 'var(--sy-fn)', fontWeight: '700' },
      '.cm-completionIcon-field::after': { content: "'\\00B7'", color: 'var(--sy-str)', fontWeight: '700' },
    },
    { dark: isDark },
  );
}
