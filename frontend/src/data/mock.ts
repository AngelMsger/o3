import type {
  Field, StreamInfo, LogRow, HistoryItem, GuideSection, NavItem,
} from '../types';

// ---------------------------------------------------------------------------
// KEYWORDS — design line 694
// ---------------------------------------------------------------------------
export const KEYWORDS: string[] = [
  'SELECT','FROM','WHERE','AND','OR','NOT','IN','LIKE','ILIKE','ORDER','BY','GROUP',
  'LIMIT','OFFSET','AS','ON','JOIN','LEFT','INNER','HAVING','DISTINCT','ASC','DESC',
  'BETWEEN','IS','NULL','CASE','WHEN','THEN','ELSE','END','UNION','MATCH_ALL',
];

// ---------------------------------------------------------------------------
// FUNCS — design lines 695-699
// ---------------------------------------------------------------------------
export const FUNCS: [string, string][] = [
  ['count','count(*) → int'],
  ['histogram',"histogram(_timestamp,'30s')"],
  ['approx_count_distinct','approx_count_distinct(f)'],
  ['min','min(expr)'],
  ['max','max(expr)'],
  ['avg','avg(expr)'],
  ['sum','sum(expr)'],
  ['str_match','str_match(field, sub)'],
  ['re_match','re_match(field, regex)'],
  ['date_bin','date_bin(iv, ts)'],
  ['to_timestamp','to_timestamp(expr)'],
  ['coalesce','coalesce(a, b)'],
  ['lower','lower(str)'],
  ['upper','upper(str)'],
];

// ---------------------------------------------------------------------------
// FIELDS — design lines 701-706
// ---------------------------------------------------------------------------
export const FIELDS: Field[] = [
  { name: '_timestamp', type: 'datetime' },
  { name: 'body', type: 'string' },
  { name: 'ctx_trace_id', type: 'string' },
  { name: 'dropped_attributes_count', type: 'int' },
  { name: 'host_name', type: 'string' },
  { name: 'instrumentation_library_name', type: 'string' },
  { name: 'instrumentation_library_version', type: 'string' },
  { name: 'logger', type: 'string' },
  { name: 'metadata_log_type', type: 'string' },
  { name: 'service_env', type: 'string' },
  { name: 'service_name', type: 'string' },
  { name: 'service_version', type: 'string' },
  { name: 'severity', type: 'string' },
  { name: 'span_id', type: 'string' },
  { name: 'trace_flags', type: 'int' },
];

// ---------------------------------------------------------------------------
// STREAMS — design line 707 + STREAM_COLORS line 708
// ---------------------------------------------------------------------------
export const STREAMS: StreamInfo[] = [
  { name: 'demo_logs',     size: '1.74 GB', color: '#2dd4bf' },
  { name: 'demo_audit',    size: '402 MB',  color: '#f5a86a' },
  { name: 'k8s_events',   size: '88 MB',   color: '#7c83ff' },
  { name: 'app_default',  size: '2.1 GB',  color: '#5b9dff' },
  { name: 'nginx_access', size: '5.6 GB',  color: '#34e0a1' },
  { name: 'otel_traces',  size: '910 MB',  color: '#f4685f' },
];

// ---------------------------------------------------------------------------
// TIMES — design line 709
// ---------------------------------------------------------------------------
export const TIMES: string[] = [
  'Past 5 Minutes','Past 15 Minutes','Past 30 Minutes',
  'Past 1 Hour','Past 4 Hours','Past 1 Day','Past 7 Days',
];

// ---------------------------------------------------------------------------
// NAV — design lines 710-717; icon keys from nav rail lines 64-72
// ---------------------------------------------------------------------------
export const NAV: NavItem[] = [
  { name: 'Logs',       icon: 'logs',    soon: false },
  { name: 'Metrics',    icon: 'metrics', soon: true },
  { name: 'Traces',     icon: 'traces',  soon: true },
  { name: 'Dashboards', icon: 'dash',    soon: true },
  { name: 'Streams',    icon: 'streams', soon: true },
  { name: 'Alerts',     icon: 'alerts',  soon: true },
];

// ---------------------------------------------------------------------------
// LOGS — derived from LOGSRC (design lines 726-748) via makeRows transform
// (design lines 814-825). Base timestamp fixed; no Date.now().
// ---------------------------------------------------------------------------

const LOGSRC: [string, string, string, string][] = [
  ['info',  'dingtalk-corp',   'corp:message:dingtalk_corp',                           'rabbitmq'],
  ['info',  'mail-relay',      'corp:message:email',                                   'rabbitmq'],
  ['warn',  'sso-gateway',     'token refresh deferred sub=5e3e461e',                  'auth'    ],
  ['error', 'fx-corp',         'outgoing http request failed: 502 bad gateway',        'http'    ],
  ['info',  'wechat-svc',      'corp:message:wechat_service',                          'rabbitmq'],
  ['debug', 'rabbit-consumer', 'consumer ack delivery_tag=80213 queue=corp.msg',       'amqp'    ],
  ['info',  'fx-corp',         'corp:message:system',                                  'rabbitmq'],
  ['info',  'dingtalk-corp',   'outgoing http request status=200 dur=84ms',            'http'    ],
  ['warn',  'rabbit-consumer', 'redelivery count=3 queue=corp.msg.retry',              'amqp'    ],
  ['error', 'mail-relay',      'smtp 421 service not available, closing channel',      'smtp'    ],
  ['info',  'wechat-svc',      'corp:message:wechat_service',                          'rabbitmq'],
  ['info',  'sso-gateway',     'token refreshed sub=5e3e461e ttl=3600',                'auth'    ],
  ['info',  'fx-corp',         'corp:message:dingtalk_corp',                           'rabbitmq'],
  ['debug', 'fx-corp',         'payload validated bytes=1284 schema=v3',               'http'    ],
  ['info',  'dingtalk-corp',   'corp:message:email',                                   'rabbitmq'],
  ['warn',  'fx-corp',         'slow downstream call dur=1284ms target=notify',        'http'    ],
  ['info',  'wechat-svc',      'corp:message:system',                                  'rabbitmq'],
  ['error', 'rabbit-consumer', 'channel closed unexpectedly, reconnecting',            'amqp'    ],
  ['info',  'mail-relay',      'corp:message:wechat_service',                          'rabbitmq'],
  ['info',  'sso-gateway',     'outgoing http request status=204',                     'http'    ],
  ['debug', 'fx-corp',         'consumer ack delivery_tag=80198',                     'amqp'    ],
  ['info',  'dingtalk-corp',   'corp:message:dingtalk_corp',                           'rabbitmq'],
];

function buildLogs(): LogRow[] {
  const BASE = new Date('2026-06-25T13:58:00.530+08:00').getTime();
  let t = BASE;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return LOGSRC.map((r, i) => {
    t -= (i % 5 === 0 ? 41 : i % 3 === 0 ? 13 : 6) + (i * 7) % 9;
    const d = new Date(t);
    const time = `2026-06-25 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    const [level, svc, body, ltype] = r;
    const trace = (i * 2654435761 >>> 0).toString(16).padStart(8, '0') + 'b093900ad9162fec';
    const tmsStr = String(t) + '000';
    const json: LogRow['json'] = [
      { k: '_timestamp',                    v: tmsStr,                                          kind: 'num' },
      { k: 'body',                          v: '"' + body + '"',                                kind: 'str' },
      { k: 'ctx_trace_id',                  v: '"' + trace + '"',                               kind: 'str' },
      { k: 'dropped_attributes_count',      v: '0',                                             kind: 'num' },
      { k: 'host_name',                     v: '"demo-worker-7d5b56f564-cp2jx"',            kind: 'str' },
      { k: 'instrumentation_library_name',  v: '"@opentelemetry/winston-transport"',            kind: 'str' },
      { k: 'logger',                        v: '"' + svc + '"',                                 kind: 'str' },
      { k: 'metadata_log_type',             v: '"' + ltype + '"',                               kind: 'str' },
      { k: 'service_env',                   v: '"production"',                                  kind: 'str' },
      { k: 'service_name',                  v: '"' + svc + '"',                                 kind: 'str' },
      { k: 'service_version',               v: '"11.3.6"',                                      kind: 'str' },
      { k: 'severity',                      v: '"' + level + '"',                               kind: 'lvl' },
    ];
    return { id: String(i), time, level, service: svc, body, ltype, trace, json };
  });
}

export const LOGS: LogRow[] = buildLogs();

// ---------------------------------------------------------------------------
// HISTORY — design lines 793-799 (state.history array)
// Maps design's { q, stream, ago, ms, rows } to HistoryItem { q, preview, stream, meta, ago }
// ---------------------------------------------------------------------------
export const HISTORY: HistoryItem[] = [
  {
    q: "SELECT _timestamp, service_name, body\nFROM demo_logs\nWHERE severity = 'error'\nORDER BY _timestamp DESC",
    preview: "SELECT _timestamp, service_name, body",
    stream: 'demo_logs',
    meta: '596ms · 402,170 rows',
    ago: '2m ago',
  },
  {
    q: "SELECT severity, count(*) AS events\nFROM demo_logs\nGROUP BY severity\nORDER BY events DESC",
    preview: "SELECT severity, count(*) AS events",
    stream: 'demo_logs',
    meta: '318ms · 5 rows',
    ago: '14m ago',
  },
  {
    q: "SELECT service_name, count(*) AS events\nFROM demo_logs\nWHERE body LIKE '%timeout%'\nGROUP BY service_name",
    preview: "SELECT service_name, count(*) AS events",
    stream: 'demo_logs',
    meta: '742ms · 12 rows',
    ago: '38m ago',
  },
  {
    q: "SELECT * FROM demo_audit\nWHERE str_match(body, 'login failed')\nLIMIT 200",
    preview: "SELECT * FROM demo_audit",
    stream: 'demo_audit',
    meta: '211ms · 83 rows',
    ago: '1h ago',
  },
  {
    q: "SELECT histogram(_timestamp, '1m') AS ts, count(*)\nFROM nginx_access\nWHERE status >= 500\nGROUP BY ts",
    preview: "SELECT histogram(_timestamp, '1m') AS ts, count(*)",
    stream: 'nginx_access',
    meta: '1043ms · 94 rows',
    ago: '2h ago',
  },
];

// ---------------------------------------------------------------------------
// GUIDE — design lines 752-773 (guideSections / this.GUIDE)
// ---------------------------------------------------------------------------
export const GUIDE: GuideSection[] = [
  {
    title: 'Query shape',
    items: [
      { code: "SELECT * FROM demo_logs", note: 'every column, newest first' },
      { code: "SELECT _timestamp, body FROM demo_logs\nWHERE severity = 'error'", note: 'pick columns + filter' },
      { code: "... ORDER BY _timestamp DESC LIMIT 100", note: 'sort and cap rows' },
    ],
  },
  {
    title: 'Filtering',
    items: [
      { code: "WHERE service_name = 'fx-corp'", note: 'exact match' },
      { code: "WHERE body LIKE '%timeout%'", note: 'substring match' },
      { code: "WHERE match_all('login failed')", note: 'full-text across fields' },
    ],
  },
  {
    title: 'Aggregation',
    items: [
      { code: "SELECT severity, count(*) FROM demo_logs\nGROUP BY severity", note: 'counts per level' },
      { code: "histogram(_timestamp, '30s')", note: 'time buckets for charts' },
      { code: "approx_count_distinct(ctx_trace_id)", note: 'unique cardinality, fast' },
    ],
  },
  {
    title: 'Functions',
    items: [
      { code: "str_match(body, 'dingtalk')", note: 'case-insensitive contains' },
      { code: "re_match(host_name, 'worker-\\\\d+')", note: 'regex match' },
      { code: "coalesce(logger, 'default')", note: 'first non-null' },
    ],
  },
];

// ---------------------------------------------------------------------------
// QUICK_RANGES — design lines 1112-1116
// ---------------------------------------------------------------------------
export const QUICK_RANGES: [string, number, string][] = [
  ['Past 5 Minutes',  5,  'm'],
  ['Past 15 Minutes', 15, 'm'],
  ['Past 30 Minutes', 30, 'm'],
  ['Past 1 Hour',     1,  'h'],
  ['Past 4 Hours',    4,  'h'],
  ['Past 12 Hours',   12, 'h'],
  ['Past 1 Day',      1,  'd'],
  ['Past 3 Days',     3,  'd'],
  ['Past 7 Days',     7,  'd'],
];
