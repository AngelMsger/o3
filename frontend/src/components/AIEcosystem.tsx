/* AIEcosystem — Settings "AI Ecosystem" tab (design Observe.dc.html). Two cards:
   openobserve-cli (npm-managed, provenance-aware) and its companion Skill
   (managed by shelling out to the CLI). Driven entirely by EcoStatus + callbacks
   so the flow is testable via lib/ecosystem. */
import type { ReactElement } from 'react';
import { hexA } from '../lib/format';
import { cliPill, agentLabel } from '../lib/ecosystem';
import type { EcoStatus } from '../lib/ecosystem';
import styles from './AIEcosystem.module.css';

export interface EcosystemPaneProps {
  status: EcoStatus | null;
  busy: string | null;
  error: string;
  onInstallCli: () => void;
  onUpgradeCli: () => void;
  onUninstallCli: () => void;
  onInstallSkill: () => void;
  onUninstallSkill: () => void;
  onOpenDocs: () => void;
  onCopy: (cmd: string) => void;
}

const PKG = '@angelmsger/openobserve-cli';
const CLI_INSTALL_CMD = `npm install -g ${PKG}`;
const SKILL_INSTALL_CMD = 'openobserve-cli skill install';

const PILL_TONE: Record<string, { bg: string; fg: string }> = {
  ok: { bg: 'rgba(52,224,161,.12)', fg: '#34e0a1' },
  update: { bg: 'rgba(245,179,64,.12)', fg: '#f5b340' },
  ext: { bg: 'rgba(255,255,255,.06)', fg: 'var(--tx-06)' },
  off: { bg: 'rgba(255,255,255,.05)', fg: 'var(--tx-09)' },
};

export function AIEcosystem({
  status, busy, error, accent,
  onInstallCli, onUpgradeCli, onUninstallCli, onInstallSkill, onUninstallSkill, onOpenDocs, onCopy,
}: EcosystemPaneProps & { accent: string }): ReactElement {
  const cli = status?.cli;
  const skill = status?.skill;
  const npm = status?.npmAvailable ?? false;
  const pill = cli ? cliPill(cli) : { label: 'Checking…', tone: 'off' as const };
  const tone = PILL_TONE[pill.tone];

  // CLI primary button: Install (not installed) / Upgrade (update available) /
  // nothing when current. npm-managed only; external defers to docs.
  const cliInstalled = !!cli?.installed;
  const cliExternal = cli?.managed === 'external';
  const cliUpdate = !!cli?.updateAvailable;

  return (
    <div>
      <div className={styles.panelTitle}>AI Ecosystem</div>
      <div className={styles.panelSub}>
        o3 pairs with <b style={{ color: 'var(--tx-06)' }}>openobserve-cli</b> — an agent-native command-line tool that lets Claude Code, Codex and other coding agents query this instance directly. It covers the agent scenarios end-to-end, so there is no MCP server to run or expose. Install the CLI and its companion Skill below.
      </div>

      {/* ===== openobserve-cli card ===== */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.iconMono} style={{ color: accent }}>&gt;_</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardTitle}>openobserve-cli</span>
              {cli?.version && <span className={styles.verLabel}>v{cli.version}</span>}
            </div>
            <div className={styles.cardDesc}>Query logs, metrics &amp; traces from the terminal — JSON output built for agents.</div>
          </div>
          <span className={styles.pill} style={{ background: tone.bg, color: tone.fg }}>{pill.label}</span>
        </div>

        <div className={styles.cmdRow}>
          <code className={styles.cmd}>{CLI_INSTALL_CMD}</code>
          <button className={styles.copyBtn} title="Copy" onClick={() => onCopy(CLI_INSTALL_CMD)}>⧉</button>
        </div>

        <div className={styles.actions}>
          {!cliInstalled && (
            npm
              ? <button className={styles.primary} style={{ background: accent }} disabled={busy === 'cli-install'} onClick={onInstallCli}>{busy === 'cli-install' ? 'Installing…' : 'Install'}</button>
              : <button className={styles.primary} style={{ background: accent }} onClick={onOpenDocs}>Install docs</button>
          )}
          {cliInstalled && cliExternal && (
            <button className={styles.secondary} onClick={onOpenDocs}>Manage via docs</button>
          )}
          {cliInstalled && !cliExternal && cliUpdate && (
            <button className={styles.primary} style={{ background: accent }} disabled={busy === 'cli-upgrade'} onClick={onUpgradeCli}>{busy === 'cli-upgrade' ? 'Upgrading…' : `Upgrade to v${cli?.latestVersion}`}</button>
          )}
          {cliInstalled && !cliExternal && (
            <button className={styles.danger} disabled={busy === 'cli-uninstall'} onClick={onUninstallCli}>{busy === 'cli-uninstall' ? 'Removing…' : 'Uninstall'}</button>
          )}
        </div>
        {cliInstalled && cliExternal && (
          <div className={styles.hint}>Installed outside npm (e.g. go install). o3 leaves it untouched — upgrade or remove it the way you installed it.</div>
        )}
      </div>

      {/* ===== companion Skill card ===== */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.iconBox}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardTitle}>openobserve</span>
              <span className={styles.skillTag}>Skill</span>
            </div>
            <div className={styles.cardDesc}>Teaches your coding agent the CLI — deploys into each agent it detects.</div>
          </div>
          <span className={styles.pill} style={skill?.installed ? { background: PILL_TONE.ok.bg, color: PILL_TONE.ok.fg } : { background: PILL_TONE.off.bg, color: PILL_TONE.off.fg }}>
            {skill?.installed ? 'Deployed' : 'Not installed'}
          </span>
        </div>

        {skill?.installed && skill.agents.length > 0 && (
          <div className={styles.agentRow}>
            <span className={styles.agentLabel}>Deployed to</span>
            {skill.agents.map((a) => (
              <span key={a} className={styles.agentChip} style={{ borderColor: hexA(accent, 0.3) }}>
                <span className={styles.agentDot} style={{ background: accent }} />{agentLabel(a)}
              </span>
            ))}
          </div>
        )}

        <div className={styles.cmdRow}>
          <code className={styles.cmd}>{SKILL_INSTALL_CMD}</code>
        </div>

        {!cliInstalled ? (
          <div className={styles.hint}>Install openobserve-cli first — the Skill ships inside the binary.</div>
        ) : (
          <div className={styles.actions}>
            <button className={styles.primary} style={{ background: accent }} disabled={busy === 'skill-install'} onClick={onInstallSkill}>
              {busy === 'skill-install' ? 'Installing…' : (skill?.installed ? 'Re-deploy' : 'Install')}
            </button>
            {skill?.installed && (
              <button className={styles.danger} disabled={busy === 'skill-uninstall'} onClick={onUninstallSkill}>{busy === 'skill-uninstall' ? 'Removing…' : 'Uninstall'}</button>
            )}
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.learn}>
        <span>Learn more:</span>
        <button className={styles.learnLink} style={{ color: accent }} onClick={onOpenDocs}>CLI reference</button>
      </div>
    </div>
  );
}
