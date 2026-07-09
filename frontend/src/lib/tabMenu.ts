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
