# Design Refresh v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply five design updates from the refreshed `Observe.dc.html`: a reworked light theme (white cards on a soft-gray canvas, darker muted text, deeper backdrop), more settings padding, stronger glassmorphism, a right-click tab context menu with bulk-close actions, and a searchable stream dropdown.

**Architecture:** Most of the visual change is token-driven — every glass surface and card already reads CSS custom properties, so updating `tokens.css` propagates automatically; a new `--card-bg`/`--card-bd`/`--card-sh`/`--sheet-bg` token set makes cards lift off a sheet in light mode. The two interactive features (tab context menu, stream search) add small pure-logic helpers (unit-tested) plus thin React UI.

**Tech Stack:** React 18 + TypeScript + Vite, CSS custom properties (`data-oo-theme` attribute), vitest.

**Design source of truth:** [Observe.dc.html](https://claude.ai/design/p/8adced37-4c53-470e-ba07-a14910bc3c68?file=Observe.dc.html) (updated palette, glass, tab menu, stream search).

## Global Constraints

- **Theme mechanism:** light is applied via `document.documentElement.setAttribute('data-oo-theme','light')` (see `lib/theme.ts:11`); `tokens.css` has `:root` (dark default) + `:root[data-oo-theme="light"]`. Do NOT change the mechanism.
- **Accent** is the user-configurable `--accent` (default `#2dd4bf`); status/semantic colors stay fixed. New UI reacts to `--accent` where the design does.
- **Reconciliation note (Task 1):** the current `tokens.css` diverged from the design — it added `--desk-veil` and `brightness()` in `--glass-blur`, with lower glass opacities. This plan makes the app match the DESIGN's values: drop `brightness()`, use the design's glass opacities + `saturate(200%) blur(32px)` (dark) / `saturate(180%) blur(32px)` (light), and deepen the light desk. Keep the `--desk-veil` body-background mechanism (it exists for the macOS vibrancy backing) but set its values to the design's `--sf-desk`.
- **No secrets / no backend changes** — this is frontend-only. No Go, no bindings, no `wails generate`, no sibling repo.
- ASCII half-width punctuation in comments; commit trailer exactly `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do not push without the user asking.
- CSS-only tasks (1, 2) have no unit tests: the gate is `npm run build` (tsc + vite) green + the manual verify checklist. Feature tasks (3, 4) are TDD on their pure logic.

**Exact design token values (copy verbatim in Task 1):**

Dark `:root` glass (replace current):
```
--glass-titl: rgba(17,20,27,.55); --glass-bar: rgba(12,14,19,.46);
--glass-pop: rgba(16,20,28,.58); --glass-modal: rgba(13,16,22,.64);
--glass-drawer: rgba(11,13,18,.54); --glass-hi: rgba(255,255,255,.10);
--glass-blur: saturate(200%) blur(32px);
```
Dark `:root` new card/sheet tokens (add):
```
--sheet-bg: transparent; --card-bg: var(--sf-05); --card-bd: rgba(var(--ink),.09); --card-sh: none;
```
Light `:root[data-oo-theme="light"]` full replacement palette:
```
--ink: 20,28,42; --glow: 45,180,165;
--sf-desk:#d1d9e5; --sf-void:#c4cddb; --sf-rail:#e6ebf3; --sf-tabs:#e7ecf3;
--sf-main:#ffffff; --sf-01:#ffffff; --sf-02:#ecf1f7; --sf-03:#e6ecf4;
--sf-04:#ffffff; --sf-05:#ffffff; --sf-modal:#ffffff; --sf-ctrl:#e9eff5;
--sf-pop:#ffffff; --sf-hov:#e9eef4; --sf-06:#e0e7f0; --sf-07:#e6ecf4;
--sf-hov2:#e1e8f1; --sf-track:#c6cfdb; --sf-atint:#d0f2eb; --sf-atint2:#e0f5f0;
--sf-titl:#edf2f8;
--tx-max:#0b1119; --tx-glow:#08423a; --tx-hi:#0e161f; --tx-01:#18212e;
--tx-02:#1d2534; --tx-03:#252e3c; --tx-04:#2f3947; --tx-05:#404956;
--tx-06:#4c5563; --tx-07:#565f6c; --tx-7b:#5a6370; --tx-09:#576070;
--tx-10:#535e6e; --tx-11:#626b79; --tx-12:#6c7482; --tx-13:#838b97;
--tx-14:#969ea9; --tx-15:#a4abb6;
--gg-1:#243f39; --gg-2:#42605a; --gg-3:#556662; --gg-4:#6e7a76; --gg-5:#828b86;
--av-1:#b6bfce; --av-2:#8993a3;
--sy-str:#1f7a2b; --sy-num:#9a6410; --sy-key:#2350b8; --sy-bool:#1d4ed8;
--sy-null:#c62f26; --sy-kw:#c22f5b; --sy-fn:#0b7295;
--glass-titl: rgba(237,241,247,.55); --glass-bar: rgba(232,237,244,.48);
--glass-pop: rgba(252,253,255,.60); --glass-modal: rgba(255,255,255,.66);
--glass-drawer: rgba(250,251,253,.58); --glass-hi: rgba(255,255,255,.75);
--glass-blur: saturate(180%) blur(32px);
--sheet-bg:#eef2f7; --card-bg:#ffffff; --card-bd: rgba(20,28,42,.11);
--card-sh: 0 1px 2px rgba(28,39,58,.06), 0 6px 16px -8px rgba(28,39,58,.16);
--desk-veil:#d1d9e5;
```

---

## File Structure

- `frontend/src/styles/tokens.css` (MODIFY) — Task 1: dark glass values + new card/sheet tokens; full light-palette replacement; deepen `--desk-veil` (light).
- Card-surface stylesheets (MODIFY) — Task 2: `SettingsModal.module.css`, `AIEcosystem.module.css`, `SetupWizard.module.css` card rules -> card tokens; settings sheet + `.content` padding.
- `frontend/src/lib/tabMenu.ts` (NEW) + `tabMenu.test.ts` (NEW) — Task 3: pure `buildTabMenu(count, index)`.
- `frontend/src/components/TabContextMenu.tsx` (NEW) + `.module.css` (NEW) — Task 3: the menu UI (items + separators + disabled).
- `frontend/src/components/QueryTabs.tsx` (MODIFY) — Task 3: `onContextMenu` prop on tabs.
- `frontend/src/App.tsx` (MODIFY) — Task 3: `tabMenu` state, bulk-close handlers, render `<TabContextMenu>`.
- `frontend/src/lib/streams.ts` (NEW) + `streams.test.ts` (NEW) — Task 4: pure `filterStreams`.
- `frontend/src/components/FieldsPanel.tsx` (MODIFY) + `.module.css` (MODIFY) — Task 4: stream search input + filtered list + count + empty state.

---

## Task 1: tokens.css — light palette, glass, card/sheet tokens

**Files:**
- Modify: `frontend/src/styles/tokens.css`

**Interfaces:**
- Produces (consumed by Task 2 + all glass surfaces): the CSS variables `--card-bg`, `--card-bd`, `--card-sh`, `--sheet-bg` (both themes), updated `--glass-*` and light palette.

- [ ] **Step 1: Update the dark `:root` glass block**

In `frontend/src/styles/tokens.css`, replace the current dark glass lines (currently lines ~38-43):
```css
  --desk-veil: #05070b;                /* opaque desk — the frosted chrome blurs this + the glow */
  --glass-titl: rgba(17,20,27,.44); --glass-bar: rgba(12,14,19,.40);
  --glass-pop: rgba(16,20,28,.55); --glass-modal: rgba(13,16,22,.66);
  --glass-drawer: rgba(11,13,18,.54); --glass-hi: rgba(255,255,255,.12);
  /* brightness lift makes the blurred backdrop read as a frost on the dark UI */
  --glass-blur: saturate(190%) brightness(1.14) blur(28px);
```
with (matches the design: higher blur/saturation, no brightness, plus the new card/sheet tokens):
```css
  --desk-veil: #05070b;                /* opaque desk — the frosted chrome blurs this + the glow */
  --glass-titl: rgba(17,20,27,.55); --glass-bar: rgba(12,14,19,.46);
  --glass-pop: rgba(16,20,28,.58); --glass-modal: rgba(13,16,22,.64);
  --glass-drawer: rgba(11,13,18,.54); --glass-hi: rgba(255,255,255,.10);
  --glass-blur: saturate(200%) blur(32px);
  /* cards + sheets: cards lift off a sheet in light; in dark they match sf-05 with no shadow */
  --sheet-bg: transparent; --card-bg: var(--sf-05); --card-bd: rgba(var(--ink),.09); --card-sh: none;
```

- [ ] **Step 2: Replace the light theme block**

Replace the entire body of `:root[data-oo-theme="light"]` (currently lines ~48-73, from `--ink:` through `--glass-blur:` and keep the trailing `color-scheme: light;`) with the design's reworked palette. The new block is:
```css
:root[data-oo-theme="light"] {
  --ink: 20,28,42;
  --glow: 45,180,165;
  --sf-desk:#d1d9e5; --sf-void:#c4cddb; --sf-rail:#e6ebf3; --sf-tabs:#e7ecf3;
  --sf-main:#ffffff; --sf-01:#ffffff; --sf-02:#ecf1f7; --sf-03:#e6ecf4;
  --sf-04:#ffffff; --sf-05:#ffffff; --sf-modal:#ffffff; --sf-ctrl:#e9eff5;
  --sf-pop:#ffffff; --sf-hov:#e9eef4; --sf-06:#e0e7f0; --sf-07:#e6ecf4;
  --sf-hov2:#e1e8f1; --sf-track:#c6cfdb; --sf-atint:#d0f2eb; --sf-atint2:#e0f5f0;
  --sf-titl:#edf2f8;
  --tx-max:#0b1119; --tx-glow:#08423a; --tx-hi:#0e161f; --tx-01:#18212e;
  --tx-02:#1d2534; --tx-03:#252e3c; --tx-04:#2f3947; --tx-05:#404956;
  --tx-06:#4c5563; --tx-07:#565f6c; --tx-7b:#5a6370; --tx-09:#576070;
  --tx-10:#535e6e; --tx-11:#626b79; --tx-12:#6c7482; --tx-13:#838b97;
  --tx-14:#969ea9; --tx-15:#a4abb6;
  --gg-1:#243f39; --gg-2:#42605a; --gg-3:#556662; --gg-4:#6e7a76; --gg-5:#828b86;
  --av-1:#b6bfce; --av-2:#8993a3;
  --sy-str:#1f7a2b; --sy-num:#9a6410; --sy-key:#2350b8; --sy-bool:#1d4ed8;
  --sy-null:#c62f26; --sy-kw:#c22f5b; --sy-fn:#0b7295;
  --desk-veil:#d1d9e5;                /* deepened so panels lift off it */
  --glass-titl: rgba(237,241,247,.55); --glass-bar: rgba(232,237,244,.48);
  --glass-pop: rgba(252,253,255,.60); --glass-modal: rgba(255,255,255,.66);
  --glass-drawer: rgba(250,251,253,.58); --glass-hi: rgba(255,255,255,.75);
  --glass-blur: saturate(180%) blur(32px);
  --sheet-bg:#eef2f7; --card-bg:#ffffff; --card-bd: rgba(20,28,42,.11);
  --card-sh: 0 1px 2px rgba(28,39,58,.06), 0 6px 16px -8px rgba(28,39,58,.16);
  color-scheme: light;
}
```

- [ ] **Step 3: Build gate**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npm run build`
Expected: tsc + vite build succeed (CSS custom-property changes never break the type build; this confirms no syntax error in the CSS).

- [ ] **Step 4: Manual sanity (describe, do not block on it)**

In the report, note that both `--card-bg`/`--card-bd`/`--card-sh`/`--sheet-bg` are now defined in BOTH `:root` and `:root[data-oo-theme="light"]` (grep to confirm 2 definitions each), and that `--glass-blur` has no `brightness()` in either block.

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/styles/tokens.css
git commit -m "style(theme): reworked light palette, stronger glass, card/sheet tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Card + sheet sweep + settings padding

**Files:**
- Modify: `frontend/src/components/SettingsModal.module.css`
- Modify: `frontend/src/components/AIEcosystem.module.css`
- Modify: `frontend/src/components/SetupWizard.module.css`

**Interfaces:**
- Consumes: `--card-bg`, `--card-bd`, `--card-sh`, `--sheet-bg` (Task 1).

**Scope:** apply the card tokens to the dialog card surfaces (Settings, AI Ecosystem, Setup Wizard) — the surfaces the design shows as cards. Leave incidental `--sf-05` uses that are not standalone cards (e.g. list-row hovers) unchanged. The transform for each card rule:
- `background: var(--sf-05);` -> `background: var(--card-bg);`
- the card's border (e.g. `border: 1px solid rgba(var(--ink),.06);`) -> `border: 1px solid var(--card-bd);`
- add `box-shadow: var(--card-sh);` (if the rule has no box-shadow) — in dark `--card-sh` is `none`, so this is invisible in dark and adds the lift only in light.

- [ ] **Step 1: Find the card surfaces**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && grep -rn 'var(--sf-05)' src/components/SettingsModal.module.css src/components/AIEcosystem.module.css src/components/SetupWizard.module.css`
Record each hit. For each, decide if the rule is a CARD (a padded panel with border + radius that groups content — e.g. `.formCard`, `.statusCard`, `.brandCard`, `.card`, `.browserPane`, `.scopeCard`, `.leftPanel` style cards) or an incidental surface (a hover state, a segmented-control track, an input background). Apply the transform only to cards. List your classification in the report.

- [ ] **Step 2: Apply the card transform**

For each card rule identified, change its `background`/`border` to the card tokens and add `box-shadow: var(--card-sh);`. Example — `SettingsModal.module.css` `.formCard` (illustrative; apply the real rule's exact current values):
```css
.formCard {
  background: var(--card-bg);
  border: 1px solid var(--card-bd);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--card-sh);
}
```
Also handle inline-styled cards: in `SettingsModal.tsx` the Appearance tab renders cards with inline `background: 'var(--sf-05)', border: '1px solid rgba(var(--ink),.06)'` (around `SettingsModal.tsx:368,412,431,449`). Change those inline styles to `background: 'var(--card-bg)', border: '1px solid var(--card-bd)', boxShadow: 'var(--card-sh)'`. (This edits `SettingsModal.tsx` too — add it to this task's files.)

- [ ] **Step 3: Apply the sheet background + settings padding**

In `SettingsModal.module.css`:
- The scrollable content wrapper (`.scrollBody`, currently lines ~137-141) gets the sheet background so white cards read against gray in light mode:
```css
.scrollBody {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--sheet-bg);
}
```
- The content inner padding (`.content`, currently `padding: 26px 30px;` at ~line 144) becomes:
```css
.content {
  padding: 28px 34px;
}
```

- [ ] **Step 4: Build gate**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npm run build`
Expected: build succeeds.

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run`
Expected: PASS (no test changes; confirm no regression).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/components/SettingsModal.module.css frontend/src/components/SettingsModal.tsx frontend/src/components/AIEcosystem.module.css frontend/src/components/SetupWizard.module.css
git commit -m "style(theme): cards lift off sheet via card tokens; roomier settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Tab context menu (bulk close)

**Files:**
- Create: `frontend/src/lib/tabMenu.ts`
- Test: `frontend/src/lib/tabMenu.test.ts`
- Create: `frontend/src/components/TabContextMenu.tsx`, `frontend/src/components/TabContextMenu.module.css`
- Modify: `frontend/src/components/QueryTabs.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: `type TabMenuAction = 'close'|'closeLeft'|'closeRight'|'closeOthers'|'closeAll'`; `interface TabMenuItem { action: TabMenuAction; label: string; enabled: boolean }`; `buildTabMenu(count: number, index: number): (TabMenuItem | 'sep')[]`; `<TabContextMenu>` component; `QueryTabs` gains `onContextMenu?: (id: string, e: React.MouseEvent) => void`.

- [ ] **Step 1: Write the failing test for the pure menu builder**

Create `frontend/src/lib/tabMenu.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildTabMenu } from './tabMenu';
import type { TabMenuItem } from './tabMenu';

const items = (count: number, index: number) =>
  buildTabMenu(count, index).filter((e): e is TabMenuItem => e !== 'sep');

describe('buildTabMenu', () => {
  it('single tab: only Close All enabled', () => {
    const m = Object.fromEntries(items(1, 0).map((i) => [i.action, i.enabled]));
    expect(m).toEqual({ close: false, closeLeft: false, closeRight: false, closeOthers: false, closeAll: true });
  });
  it('middle of three: everything enabled', () => {
    const m = Object.fromEntries(items(3, 1).map((i) => [i.action, i.enabled]));
    expect(m).toEqual({ close: true, closeLeft: true, closeRight: true, closeOthers: true, closeAll: true });
  });
  it('first of three: no close-left', () => {
    const m = Object.fromEntries(items(3, 0).map((i) => [i.action, i.enabled]));
    expect(m.closeLeft).toBe(false);
    expect(m.closeRight).toBe(true);
  });
  it('last of three: no close-right', () => {
    const m = Object.fromEntries(items(3, 2).map((i) => [i.action, i.enabled]));
    expect(m.closeLeft).toBe(true);
    expect(m.closeRight).toBe(false);
  });
  it('has two separators in order', () => {
    const seq = buildTabMenu(3, 1).map((e) => (e === 'sep' ? 'sep' : e.action));
    expect(seq).toEqual(['close', 'sep', 'closeLeft', 'closeRight', 'closeOthers', 'sep', 'closeAll']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run src/lib/tabMenu.test.ts`
Expected: FAIL — cannot resolve `./tabMenu`.

- [ ] **Step 3: Implement the pure builder**

Create `frontend/src/lib/tabMenu.ts`:
```ts
// Pure builder for the query-tab right-click menu: given the tab count and the
// clicked tab's index, returns the ordered items (with separators) and their
// enabled state. The design's rules: Close Tab / Close Others need >1 tab;
// Close Left needs a tab to the left; Close Right needs one to the right;
// Close All is always available.
export type TabMenuAction = 'close' | 'closeLeft' | 'closeRight' | 'closeOthers' | 'closeAll';

export interface TabMenuItem {
  action: TabMenuAction;
  label: string;
  enabled: boolean;
}

export function buildTabMenu(count: number, index: number): (TabMenuItem | 'sep')[] {
  const many = count > 1;
  return [
    { action: 'close', label: 'Close Tab', enabled: many },
    'sep',
    { action: 'closeLeft', label: 'Close Tabs to the Left', enabled: index > 0 },
    { action: 'closeRight', label: 'Close Tabs to the Right', enabled: index < count - 1 },
    { action: 'closeOthers', label: 'Close Other Tabs', enabled: many },
    'sep',
    { action: 'closeAll', label: 'Close All', enabled: true },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run src/lib/tabMenu.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the TabContextMenu component**

Create `frontend/src/components/TabContextMenu.tsx`:
```tsx
/* TabContextMenu — right-click menu for query tabs (design Observe.dc.html tab
   context menu). Renders the pure buildTabMenu() items with separators and
   greyed-out disabled entries; a full-screen backdrop dismisses it. */
import type { ReactElement } from 'react';
import { buildTabMenu } from '../lib/tabMenu';
import type { TabMenuAction } from '../lib/tabMenu';
import styles from './TabContextMenu.module.css';

interface TabContextMenuProps {
  count: number;
  index: number;
  x: number;
  y: number;
  visible: boolean;
  onPick: (action: TabMenuAction) => void;
  onClose: () => void;
}

export function TabContextMenu({ count, index, x, y, visible, onPick, onClose }: TabContextMenuProps): ReactElement {
  const entries = buildTabMenu(count, index);
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className={`${styles.menu} ${visible ? styles.shown : styles.hidden}`}
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {entries.map((it, i) =>
          it === 'sep' ? (
            <div key={`sep-${i}`} className={styles.sep} />
          ) : (
            <div
              key={it.action}
              className={`${styles.item} ${it.enabled ? '' : styles.disabled}`}
              onClick={() => { if (it.enabled) { onPick(it.action); onClose(); } }}
            >
              {it.label}
            </div>
          ),
        )}
      </div>
    </>
  );
}
```

Create `frontend/src/components/TabContextMenu.module.css` (values from the design):
```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}

.menu {
  position: fixed;
  min-width: 216px;
  background: var(--glass-pop);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid rgba(var(--ink), 0.12);
  border-radius: 11px;
  box-shadow: 0 24px 56px -12px rgba(0, 0, 0, 0.55), inset 0 1px 0 var(--glass-hi);
  padding: 5px;
  z-index: 91;
  transform-origin: top left;
  transition: opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease);
}

.shown { opacity: 1; transform: none; }
.hidden { opacity: 0; transform: scale(0.97); }

.item {
  display: flex;
  align-items: center;
  height: 31px;
  padding: 0 12px;
  border-radius: 7px;
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--tx-02);
}

.item:hover {
  background: var(--sf-hov2);
  color: var(--tx-hi);
}

.disabled {
  color: var(--tx-12);
  cursor: default;
}

.disabled:hover {
  background: transparent;
  color: var(--tx-12);
}

.sep {
  height: 1px;
  margin: 5px 9px;
  background: rgba(var(--ink), 0.09);
}
```

- [ ] **Step 6: Add onContextMenu to QueryTabs**

In `frontend/src/components/QueryTabs.tsx`, extend the props (currently `{ tabs, activeId, onPick, onNew, onClose, onRename }`) with `onContextMenu?: (id: string, e: React.MouseEvent) => void;` and add the handler to each tab `<div>` (the element with `className={styles.tab ...}`, around line 44):
```tsx
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(t.id, e); }}
```
(Place it alongside the existing `onClick`/`onDoubleClick` on that tab div.)

- [ ] **Step 7: Wire App.tsx — state, handlers, render**

In `frontend/src/App.tsx`:

7a. Add imports near the other component imports:
```tsx
import { TabContextMenu } from './components/TabContextMenu';
import type { TabMenuAction } from './lib/tabMenu';
```

7b. Add state near the other tab state (after `tabSeq`, around `App.tsx:110`). Mirror the existing `ValueActionMenu` delayed-unmount pattern (keep the object during the exit animation, gate on `open`):
```tsx
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number; open: boolean } | null>(null);
  const tabMenuT = useDelayedUnmount(!!tabMenu?.open, 140);
```

7c. Add the bulk-close handlers next to `handleCloseTab` (around `App.tsx:620`). These reduce `tabs` and keep `activeTab` valid via `selectTab`:
```tsx
  // Bulk tab close actions for the right-click menu. Each keeps >=1 tab and
  // moves activeTab onto a surviving tab when the active one is closed.
  const closeTabsLeft = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    const next = tabs.slice(idx);
    setTabs(next);
    if (!next.some((t) => t.id === activeTab)) selectTab(id);
  };
  const closeTabsRight = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0 || idx >= tabs.length - 1) return;
    const next = tabs.slice(0, idx + 1);
    setTabs(next);
    if (!next.some((t) => t.id === activeTab)) selectTab(id);
  };
  const closeOtherTabs = (id: string) => {
    const keep = tabs.find((t) => t.id === id);
    if (!keep || tabs.length <= 1) return;
    setTabs([keep]);
    if (activeTab !== id) selectTab(id);
  };
  const closeAllTabs = () => {
    tabSeq.current += 1;
    const id = `t-new-${tabSeq.current}`;
    setTabs([{ id, name: 'untitled', mode: 'sql', sql: '', search: '', stream: '' }]);
    selectTab(id);
  };
  const onTabMenuPick = (action: TabMenuAction) => {
    if (!tabMenu) return;
    const id = tabMenu.id;
    if (action === 'close') handleCloseTab(id);
    else if (action === 'closeLeft') closeTabsLeft(id);
    else if (action === 'closeRight') closeTabsRight(id);
    else if (action === 'closeOthers') closeOtherTabs(id);
    else if (action === 'closeAll') closeAllTabs();
  };
```

7d. Pass `onContextMenu` to `<QueryTabs>` (its existing render, around `App.tsx:668`), clamping the menu position like the value menu does:
```tsx
            onContextMenu={(id, e) => {
              const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 232));
              const y = e.clientY + 4;
              setTabMenu({ id, x, y, open: true });
            }}
```

7e. Render the menu near the existing `<ValueActionMenu>` render (search for where `ctxMenu` / `ValueActionMenu` is rendered, around `App.tsx:943`). Add:
```tsx
        {tabMenuT.mounted && tabMenu && (
          <TabContextMenu
            count={tabs.length}
            index={tabs.findIndex((t) => t.id === tabMenu.id)}
            x={tabMenu.x}
            y={tabMenu.y}
            visible={tabMenuT.visible}
            onPick={onTabMenuPick}
            onClose={() => setTabMenu((m) => (m ? { ...m, open: false } : m))}
          />
        )}
```

- [ ] **Step 8: Build + test gate**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npm run build`
Expected: build succeeds.

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run`
Expected: PASS (incl the new tabMenu test).

- [ ] **Step 9: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/lib/tabMenu.ts frontend/src/lib/tabMenu.test.ts frontend/src/components/TabContextMenu.tsx frontend/src/components/TabContextMenu.module.css frontend/src/components/QueryTabs.tsx frontend/src/App.tsx
git commit -m "feat(tabs): right-click tab menu with bulk-close actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Stream dropdown search

**Files:**
- Create: `frontend/src/lib/streams.ts`
- Test: `frontend/src/lib/streams.test.ts`
- Modify: `frontend/src/components/FieldsPanel.tsx`
- Modify: `frontend/src/components/FieldsPanel.module.css`

**Interfaces:**
- Produces: `filterStreams<T extends { name: string }>(streams: T[], query: string): T[]`.
- Consumes: existing `FieldsPanel` props `streams: { name: string; size: string; color?: string }[]`, `stream`, `onPickStream`, `streamOpen`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/streams.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { filterStreams } from './streams';

const S = [{ name: 'nginx_access' }, { name: 'app_logs' }, { name: 'AUTH_events' }];

describe('filterStreams', () => {
  it('empty query returns all', () => {
    expect(filterStreams(S, '')).toHaveLength(3);
    expect(filterStreams(S, '   ')).toHaveLength(3);
  });
  it('case-insensitive substring match', () => {
    expect(filterStreams(S, 'AUTH').map((s) => s.name)).toEqual(['AUTH_events']);
    expect(filterStreams(S, 'log').map((s) => s.name)).toEqual(['app_logs']);
    expect(filterStreams(S, 'A').map((s) => s.name)).toEqual(['nginx_access', 'app_logs', 'AUTH_events']);
  });
  it('no match returns empty', () => {
    expect(filterStreams(S, 'zzz')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run src/lib/streams.test.ts`
Expected: FAIL — cannot resolve `./streams`.

- [ ] **Step 3: Implement the pure filter**

Create `frontend/src/lib/streams.ts`:
```ts
// Pure case-insensitive substring filter for the stream picker. A blank query
// (after trimming) returns the list unchanged.
export function filterStreams<T extends { name: string }>(streams: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return streams;
  return streams.filter((s) => s.name.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run src/lib/streams.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the search UI to FieldsPanel**

In `frontend/src/components/FieldsPanel.tsx`:

5a. Add imports + local state (top of the component). Import `useState`, `useRef`, `useEffect` (extend the existing React import) and:
```tsx
import { filterStreams } from '../lib/streams';
```

5b. Inside the component body add:
```tsx
  const [streamFilter, setStreamFilter] = useState('');
  const streamSearchRef = useRef<HTMLInputElement>(null);
  // Focus the search field and reset the query each time the dropdown opens.
  useEffect(() => {
    if (streamOpen) {
      setStreamFilter('');
      requestAnimationFrame(() => streamSearchRef.current?.focus());
    }
  }, [streamOpen]);
  const shownStreams = filterStreams(streams, streamFilter);
```

5c. Replace the current dropdown block (currently `FieldsPanel.tsx:121-139`, the `{streamOpen && (<div className={`oo-scroll ${styles.dropdown}`}> ... streams.map ... </div>)}`) with a version that has a fixed search header + a scroll area over `shownStreams` + an empty state:
```tsx
      {streamOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownSearch}>
            <div className={styles.searchBox}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--tx-11)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input
                ref={streamSearchRef}
                className={styles.searchInput}
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Search streams…"
                spellCheck={false}
              />
              <span className={styles.searchCount}>{shownStreams.length}</span>
            </div>
          </div>
          <div className={`oo-scroll ${styles.dropdownList}`}>
            {shownStreams.map((s) => (
              <div
                key={s.name}
                className={`${styles.dropdownItem} ${s.name === stream ? styles.dropdownItemActive : ''}`}
                onClick={() => onPickStream(s.name)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <ellipse cx="12" cy="6" rx="8" ry="3" />
                  <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
                </svg>
                <span className={styles.dropdownItemName}>{s.name}</span>
                <span style={{ flex: 1 }} />
                <span className={styles.dropdownItemSize}>{s.size}</span>
              </div>
            ))}
            {shownStreams.length === 0 && (
              <div className={styles.dropdownEmpty}>No streams match "{streamFilter}"</div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 6: Add the CSS**

In `frontend/src/components/FieldsPanel.module.css`, the existing `.dropdown` rule (lines ~127-142) currently has `padding: 4px; overflow-y: auto; max-height: 320px;`. Change `.dropdown` to be the container (remove its own scroll/padding; the inner list scrolls) and add the new classes:
```css
.dropdown {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 70px;
  background: var(--sf-pop);
  border: 1px solid rgba(var(--ink), 0.12);
  border-radius: 9px;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.85);
  z-index: 50;
  overflow: hidden;
  animation: ooFade var(--motion-base) var(--motion-ease);
}

.dropdownSearch {
  padding: 7px 8px;
  border-bottom: 1px solid rgba(var(--ink), 0.08);
}

.searchBox {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  background: var(--sf-04);
  border: 1px solid rgba(var(--ink), 0.12);
  border-radius: 8px;
}

.searchInput {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--tx-01);
  font-size: 12.5px;
  font-family: 'JetBrains Mono', monospace;
}

.searchCount {
  font-size: 10px;
  color: var(--tx-12);
  font-family: 'JetBrains Mono', monospace;
}

.dropdownList {
  max-height: 258px;
  overflow-y: auto;
  padding: 4px;
}

.dropdownEmpty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--tx-10);
  font-family: 'JetBrains Mono', monospace;
}
```
(Keep the existing `.dropdownItem`, `.dropdownItemActive`, `.dropdownItemName`, `.dropdownItemSize` rules unchanged.)

- [ ] **Step 7: Build + test gate**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npm run build`
Expected: build succeeds.

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run`
Expected: PASS (incl the new streams test).

- [ ] **Step 8: Full app build (whole feature)**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && wails build`
Expected: exit 0. Then `git checkout -- frontend/wailsjs/runtime/ go.mod go.sum` (defensive; this branch regenerated no bindings, so expect nothing to restore). Confirm `git status --short` shows only the intended source files.

- [ ] **Step 9: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/lib/streams.ts frontend/src/lib/streams.test.ts frontend/src/components/FieldsPanel.tsx frontend/src/components/FieldsPanel.module.css
git commit -m "feat(streams): searchable stream dropdown with match count + empty state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification (after Task 4)

Run `wails dev` on macOS:
1. **Light theme** (Settings -> Appearance -> Light): settings cards are pure white on a soft-gray sheet with a subtle lift-shadow; muted text (labels, hints) reads clearly; the desktop backdrop behind the window is a deeper gray so panels stand off it.
2. **Glass**: title bar, modal headers, and popovers show a clearly-visible frost (blur 32 / saturation 200) over content behind them.
3. **Settings padding**: the settings content has visibly more breathing room (28x34).
4. **Tab menu**: right-click a tab -> Close Tab / Close Tabs to the Left / Close Tabs to the Right / Close Other Tabs / Close All, with items correctly greyed when not applicable (single tab -> only Close All; first tab -> no Close Left; last tab -> no Close Right). Each action closes the right set and keeps a valid active tab.
5. **Stream search**: open the Stream dropdown -> a search field is focused; typing filters the list live; the count updates; a non-matching query shows "No streams match ...".
6. **Dark theme unchanged**: toggle back to Dark -> cards and glass look as before (card-sh is `none`, card-bg is sf-05 in dark).

## Notes / non-goals

- Font sizes are unchanged; the light-theme readability fix is via the darker text tokens (per the user's decision).
- No backend/bindings/sibling changes; frontend-only.
