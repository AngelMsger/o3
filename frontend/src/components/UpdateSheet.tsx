/* UpdateSheet — the Sparkle-style "a new version is available" sheet.

   Also the answer for an explicit check that finds nothing: a "Check for
   Updates…" menu item that silently does nothing reads as broken, so the sheet
   renders a "you're up to date" variant too. Which variant is decided by
   checkState() in lib/update, shared with the About tab so the two can't disagree.

   o3's builds are unsigned, so this never installs anything: the primary button
   opens the platform artifact in the user's real browser. */
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { BrandMark } from './BrandMark';
import { ReleaseNotes } from './ReleaseNotes';
import { assetLabel, versionLine, publishedLabel } from '../lib/update';
import type { UpdateResult, CheckState } from '../lib/update';
import styles from './UpdateSheet.module.css';

const INSTALL_NOTES_URL = 'https://github.com/AngelMsger/o3#download--install';

export interface UpdateSheetProps {
  visible: boolean;
  accent: string;
  isDark: boolean;
  state: CheckState;
  result: UpdateResult | null;
  error: string;
  onSkip: (version: string) => void;
  onClose: () => void;
}

export function UpdateSheet({
  visible, accent, isDark, state, result, error, onSkip, onClose,
}: UpdateSheetProps): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const available = state === 'available' && result !== null;
  const published = result ? publishedLabel(result.publishedAt) : '';

  const title = available
    ? 'A new version of o3 is available'
    : state === 'error'
      ? "Couldn't check for updates"
      : state === 'dev'
        ? 'Development build'
        : "You're up to date";

  const subtitle = available && result
    ? versionLine(result)
    : state === 'error'
      ? error
      : state === 'dev'
        ? 'This build was compiled locally, so there is no release to compare it against.'
        : result?.currentVersion
          ? `o3 ${result.currentVersion} is the latest version.`
          : 'o3 is the latest version.';

  return (
    <div
      className={`${styles.overlay} ${visible ? styles.shown : styles.hidden}`}
      onClick={onClose}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.icon}>
            <BrandMark variant={isDark ? 'void' : 'signal'} size={40} />
          </span>
          <div style={{ flex: 1 }}>
            <div className={styles.title}>{title}</div>
            <div className={styles.subtitle}>{subtitle}</div>
            {available && published && (
              <div className={styles.published}>Released {published}</div>
            )}
          </div>
          {available && <span className={styles.pill}>Update</span>}
        </div>

        {available && result && (
          <div className={styles.body}>
            <ReleaseNotes md={result.notes} accent={accent} />
          </div>
        )}

        <div className={styles.footer}>
          {available && result ? (
            <>
              <div className={styles.footerNote}>
                o3 is not code-signed — macOS and Windows will warn on first launch.{' '}
                <button
                  type="button"
                  className={styles.footerLink}
                  style={{ color: accent }}
                  onClick={() => BrowserOpenURL(INSTALL_NOTES_URL)}
                >
                  Install notes
                </button>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => onSkip(result.latestVersion)}
                >
                  Skip This Version
                </button>
                <button type="button" className={styles.ghost} onClick={onClose}>
                  Remind Me Later
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  style={{ background: accent }}
                  onClick={() => {
                    BrowserOpenURL(result.downloadURL);
                    onClose();
                  }}
                >
                  {assetLabel(result)}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.actions}>
              {result?.releaseURL && (
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => BrowserOpenURL(result.releaseURL)}
                >
                  Release Notes
                </button>
              )}
              <button
                type="button"
                className={styles.primary}
                style={{ background: accent }}
                onClick={onClose}
              >
                OK
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
