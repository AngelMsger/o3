// Connection-test result, shared by the Setup Wizard and Settings.
//
// Both surfaces own a "Test Connection" button, but only the wizard used to
// render an outcome — Settings called the backend and displayed nothing at all,
// so its button read as broken. Modelling the result here (rather than as a
// loose `tested: boolean` next to an unrelated error string) gives both the same
// four states, including the in-flight one that acknowledges the click.

export type ConnTest =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; orgCount: number; streamCount: number }
  | { state: 'error'; message: string };

export const IDLE: ConnTest = { state: 'idle' };

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// connTestLabel renders the one-line status shown beside the Test button. Empty
// at rest, so nothing is drawn until the user actually asks for a test.
export function connTestLabel(t: ConnTest): string {
  switch (t.state) {
    case 'testing':
      return 'Testing…';
    case 'ok':
      return `✓ reachable · ${plural(t.orgCount, 'org')}, ${plural(t.streamCount, 'log stream')}`;
    case 'error':
      return t.message;
    default:
      return '';
  }
}
