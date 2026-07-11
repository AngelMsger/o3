package query

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Field-detection precedence lists. The first present key wins.
var (
	levelKeys   = []string{"level", "severity", "log_level", "severitytext"}
	serviceKeys = []string{"service_name", "service", "k8s_container_name"}
	bodyKeys    = []string{"body", "message", "msg", "log"}
	ltypeKeys   = []string{"metadata_log_type", "log_type"}
	traceKeys   = []string{"trace_id", "ctx_trace_id", "traceId"}
)

// MapHits converts raw search hits into the frontend's LogRow shape. Missing
// fields render blank; the detected level key is marked kind "lvl".
func MapHits(hits []map[string]any) []LogRow {
	rows := make([]LogRow, 0, len(hits))
	for i, hit := range hits {
		row := LogRow{ID: strconv.Itoa(i)}
		row.Time = formatTime(hit["_timestamp"])
		row.Level = strings.ToLower(firstString(hit, levelKeys))
		row.Service = firstString(hit, serviceKeys)
		row.Body = firstString(hit, bodyKeys)
		row.LType = firstString(hit, ltypeKeys)
		row.Trace = firstString(hit, traceKeys)

		levelKey := firstPresentKey(hit, levelKeys)
		row.JSON = buildKVs(hit, levelKey)
		rows = append(rows, row)
	}
	return rows
}

// MapHistogram reads the zo_sql_key / zo_sql_num columns and normalizes counts
// to [0,1] against the max count in the set.
func MapHistogram(hits []map[string]any) []Bucket {
	buckets := make([]Bucket, 0, len(hits))
	var max float64
	counts := make([]float64, len(hits))
	labels := make([]string, len(hits))
	for i, hit := range hits {
		labels[i] = asString(hit["zo_sql_key"])
		c := asFloat(hit["zo_sql_num"])
		counts[i] = c
		if c > max {
			max = c
		}
	}
	for i := range hits {
		h := 0.0
		if max > 0 {
			h = counts[i] / max
		}
		buckets = append(buckets, Bucket{T: labels[i], H: h, C: int64(counts[i])})
	}
	return buckets
}

func firstPresentKey(hit map[string]any, keys []string) string {
	for _, k := range keys {
		if _, ok := hit[k]; ok {
			return k
		}
	}
	return ""
}

func firstString(hit map[string]any, keys []string) string {
	for _, k := range keys {
		if v, ok := hit[k]; ok {
			return asString(v)
		}
	}
	return ""
}

// buildKVs expands every key, sorted, typing each value. The levelKey (if any)
// is marked "lvl" so the drawer colors it.
//
// V is the RAW field value, never a display-formatted one: strings are stored
// unquoted and numbers as their plain digits. Kind carries the type so the
// frontend can add quotes for rendering, reconstruct typed values for Copy JSON,
// and — critically — feed the unquoted value straight into the SQL filter
// builder (a value of `foo` must yield `field = 'foo'`, not `field = '"foo"'`).
func buildKVs(hit map[string]any, levelKey string) []KV {
	keys := make([]string, 0, len(hit))
	for k := range hit {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	kvs := make([]KV, 0, len(keys))
	for _, k := range keys {
		v := hit[k]
		kv := KV{K: k, V: asString(v)}
		switch {
		case k == levelKey:
			kv.Kind = "lvl"
		case isNumber(v):
			kv.Kind = "num"
			kv.V = formatNumber(v)
		default:
			kv.Kind = "str"
		}
		kvs = append(kvs, kv)
	}
	return kvs
}

func isNumber(v any) bool {
	switch v.(type) {
	case float64, float32, int, int64, json.Number:
		return true
	}
	return false
}

func formatNumber(v any) string {
	switch n := v.(type) {
	case float64:
		if n == math.Trunc(n) && math.Abs(n) < 1e18 {
			return strconv.FormatInt(int64(n), 10)
		}
		return strconv.FormatFloat(n, 'f', -1, 64)
	case json.Number:
		return n.String()
	default:
		return asString(v)
	}
}

// asString renders any JSON value as a plain (unquoted) string.
func asString(v any) string {
	switch s := v.(type) {
	case nil:
		return ""
	case string:
		return s
	case float64:
		return formatNumber(s)
	case bool:
		return strconv.FormatBool(s)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

// formatTime renders _timestamp (epoch micros as a number, or an RFC3339
// string) as "YYYY-MM-DD HH:mm:ss.SSS" in local time. Unparseable values yield
// the raw string.
func formatTime(v any) string {
	const layout = "2006-01-02 15:04:05.000"
	switch t := v.(type) {
	case nil:
		return ""
	case float64:
		micros := int64(t)
		return time.UnixMicro(micros).Local().Format(layout)
	case string:
		if parsed, err := time.Parse(time.RFC3339Nano, t); err == nil {
			return parsed.Local().Format(layout)
		}
		return t
	default:
		return asString(v)
	}
}
