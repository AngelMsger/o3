/* ReleaseNotes — renders the block tree from lib/releaseNotes as React elements.
   Deliberately dumb: all parsing lives in the (pure, tested) lib module.

   Links are <button>s, not <a>s. o3 IS the WebView, so a real anchor that the
   user clicks would navigate the whole app window away to GitHub with no way
   back; routing every link through BrowserOpenURL opens the user's real browser
   instead. Making it a button means that cannot be forgotten. */
import type { ReactElement, ReactNode } from 'react';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { parseReleaseNotes } from '../lib/releaseNotes';
import type { Inline } from '../lib/releaseNotes';
import styles from './ReleaseNotes.module.css';

function renderInline(nodes: Inline[], accent: string): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'code':
        return <code key={i} className={styles.code}>{n.v}</code>;
      case 'strong':
        return <strong key={i} className={styles.strong}>{n.v}</strong>;
      case 'em':
        return <em key={i}>{n.v}</em>;
      case 'link':
        return (
          <button
            key={i}
            type="button"
            className={styles.link}
            style={{ color: accent }}
            onClick={() => BrowserOpenURL(n.href)}
          >
            {n.v}
          </button>
        );
      default:
        return <span key={i}>{n.v}</span>;
    }
  });
}

export function ReleaseNotes({ md, accent }: { md: string; accent: string }): ReactElement {
  const blocks = parseReleaseNotes(md);

  if (!blocks.length) {
    return <div className={styles.empty}>This release ships without notes.</div>;
  }

  return (
    <div className={styles.notes}>
      {blocks.map((b, i) => {
        if (b.t === 'h') {
          const cls = b.level === 2 ? styles.h2 : styles.h3;
          return <div key={i} className={cls}>{renderInline(b.c, accent)}</div>;
        }
        if (b.t === 'ul') {
          return (
            <ul key={i} className={styles.list}>
              {b.items.map((item, j) => (
                <li key={j} className={styles.item}>{renderInline(item, accent)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i} className={styles.para}>{renderInline(b.c, accent)}</p>;
      })}
    </div>
  );
}
