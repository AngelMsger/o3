export type Density = 'ultra' | 'comfortable';
export type SettingsTab = 'connection' | 'appearance' | 'agent' | 'about';
export type TimeTab = 'relative' | 'absolute';
export type QueryMode = 'sql' | 'search';

export interface Field { name: string; type: string; }            // 'string' | 'int' | 'datetime'
export interface StreamInfo { name: string; size: string; color: string; }
export interface LogRow {
  id: string; time: string; level: string;       // INFO|WARN|ERROR|DEBUG
  service: string; body: string; ltype: string; trace: string;
  json: { k: string; v: string; kind: 'str' | 'num' | 'lvl' }[];
}
export interface HistoryItem { q: string; preview: string; stream: string; meta: string; ago: string; }
export interface Suggestion { label: string; kind: 'keyword'|'function'|'field'; tag: string; detail: string; color: string; }
export interface QueryTab {
  id: string;
  name: string;
  mode: QueryMode;   // active editor mode for this tab
  sql: string;       // SQL-mode buffer
  search: string;    // Search-mode buffer (free-text terms)
  stream: string;    // target stream
}
export interface GuideSection { title: string; items: { code: string; note: string }[]; }
export interface NavItem { name: string; icon: 'logs'|'metrics'|'traces'|'streams'|'dash'|'alerts'; soon: boolean; }
export interface HistoBar { h: number; }   // normalized 0..1 height
export interface HistoBucket { t: string; h: number; c: number }  // t=label, h=0..1 height, c=raw count
