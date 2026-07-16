// Pure status-derivation logic for the AI Ecosystem panel + nav-rail dot.
// Kept free of Wails imports so it is unit-tested like lib/format.ts.

export interface CLIStatus {
  installed: boolean;
  version: string;
  path: string;
  managed: string; // "npm" | "external" | "" — plain string so it stays
                   // assignable from the generated Wails model (which types it string)
  latestVersion: string;
  updateAvailable: boolean;
}

export interface SkillStatus {
  installed: boolean;
  version: string;
  agents: string[];
}

export interface EcoStatus {
  npmAvailable: boolean;
  cli: CLIStatus;
  skill: SkillStatus;
}

export type DotState = 'ok' | 'update' | 'off';

// dotState maps the CLI status to the nav-rail status dot.
export function dotState(cli: CLIStatus): DotState {
  if (!cli.installed) return 'off';
  if (cli.updateAvailable) return 'update';
  return 'ok';
}

// ecoTooltip is the nav-rail shortcut tooltip, mirroring dotState.
export function ecoTooltip(cli: CLIStatus): string {
  if (!cli.installed) return 'openobserve-cli not installed';
  if (cli.updateAvailable) return `Update available: v${cli.version} -> v${cli.latestVersion}`;
  return `openobserve-cli v${cli.version} - up to date`;
}

export type PillTone = 'ok' | 'update' | 'ext' | 'off';

// cliPill is the status pill on the CLI card. External wins over update because
// o3 cannot auto-upgrade a binary it did not install via npm.
export function cliPill(cli: CLIStatus): { label: string; tone: PillTone } {
  if (!cli.installed) return { label: 'Not installed', tone: 'off' };
  if (cli.managed === 'external') return { label: 'Installed - external', tone: 'ext' };
  if (cli.updateAvailable) return { label: 'Update available', tone: 'update' };
  return { label: 'Installed', tone: 'ok' };
}

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
};

// agentLabel maps an agent id to a display label, falling back to the raw id.
export function agentLabel(id: string): string {
  return AGENT_LABELS[id] ?? id;
}
