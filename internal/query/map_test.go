package query

import (
	"reflect"
	"testing"
)

func findKV(kvs []KV, key string) (KV, bool) {
	for _, kv := range kvs {
		if kv.K == key {
			return kv, true
		}
	}
	return KV{}, false
}

func TestMapHitsFieldDetection(t *testing.T) {
	hits := []map[string]any{
		{
			"_timestamp":        float64(1751337480530000),
			"severity":          "info",
			"service_name":      "dingtalk-corp",
			"body":              "corp:message",
			"metadata_log_type": "rabbitmq",
			"ctx_trace_id":      "00000000b093900ad9162fec",
			"dropped_count":     float64(0),
		},
	}
	rows := MapHits(hits)
	if len(rows) != 1 {
		t.Fatalf("want 1 row, got %d", len(rows))
	}
	r := rows[0]
	if r.ID != "0" {
		t.Fatalf("ID = %q, want 0", r.ID)
	}
	if r.Level != "info" {
		t.Fatalf("Level = %q, want info", r.Level)
	}
	if r.Service != "dingtalk-corp" {
		t.Fatalf("Service = %q, want dingtalk-corp", r.Service)
	}
	if r.Body != "corp:message" {
		t.Fatalf("Body = %q, want corp:message", r.Body)
	}
	if r.LType != "rabbitmq" {
		t.Fatalf("LType = %q, want rabbitmq", r.LType)
	}
	if r.Trace != "00000000b093900ad9162fec" {
		t.Fatalf("Trace = %q, want trace id", r.Trace)
	}
	if r.Time != "2026-06-25 13:58:00.530" && r.Time == "" {
		t.Fatalf("Time not formatted: %q", r.Time)
	}
}

func TestMapHitsKVTypingAndOrder(t *testing.T) {
	hits := []map[string]any{
		{
			"severity":   "warn",
			"count":      float64(42),
			"name":       "alpha",
			"_timestamp": float64(1751337480530000),
		},
	}
	kvs := MapHits(hits)[0].JSON
	// keys are sorted alphabetically
	gotKeys := make([]string, len(kvs))
	for i, kv := range kvs {
		gotKeys[i] = kv.K
	}
	wantKeys := []string{"_timestamp", "count", "name", "severity"}
	if !reflect.DeepEqual(gotKeys, wantKeys) {
		t.Fatalf("keys = %v, want %v", gotKeys, wantKeys)
	}
	if kv, _ := findKV(kvs, "count"); kv.Kind != "num" || kv.V != "42" {
		t.Fatalf("count kv = %+v, want num/42", kv)
	}
	if kv, _ := findKV(kvs, "name"); kv.Kind != "str" || kv.V != `"alpha"` {
		t.Fatalf("name kv = %+v, want str/\"alpha\"", kv)
	}
	if kv, _ := findKV(kvs, "severity"); kv.Kind != "lvl" || kv.V != `"warn"` {
		t.Fatalf("severity kv = %+v, want lvl/\"warn\"", kv)
	}
	if kv, _ := findKV(kvs, "_timestamp"); kv.Kind != "num" || kv.V != "1751337480530000" {
		t.Fatalf("_timestamp kv = %+v, want num/1751337480530000", kv)
	}
}

func TestMapHitsMissingFields(t *testing.T) {
	rows := MapHits([]map[string]any{{"foo": "bar"}})
	r := rows[0]
	if r.Level != "" || r.Service != "" || r.Body != "" || r.LType != "" || r.Trace != "" {
		t.Fatalf("expected blank derived fields, got %+v", r)
	}
	if len(r.JSON) != 1 || r.JSON[0].K != "foo" {
		t.Fatalf("JSON = %+v, want single foo entry", r.JSON)
	}
}

func TestMapHistogramNormalizes(t *testing.T) {
	hits := []map[string]any{
		{"zo_sql_key": "2026-06-26T10:00:00", "zo_sql_num": float64(5)},
		{"zo_sql_key": "2026-06-26T10:00:30", "zo_sql_num": float64(20)},
		{"zo_sql_key": "2026-06-26T10:01:00", "zo_sql_num": float64(0)},
	}
	buckets := MapHistogram(hits)
	if len(buckets) != 3 {
		t.Fatalf("want 3 buckets, got %d", len(buckets))
	}
	if buckets[0].H != 0.25 || buckets[1].H != 1.0 || buckets[2].H != 0.0 {
		t.Fatalf("heights = %v, want [0.25 1 0]", []float64{buckets[0].H, buckets[1].H, buckets[2].H})
	}
	if buckets[1].T != "2026-06-26T10:00:30" {
		t.Fatalf("bucket label = %q", buckets[1].T)
	}
	if buckets[0].C != 5 || buckets[1].C != 20 || buckets[2].C != 0 {
		t.Fatalf("counts = %v, want [5 20 0]", []int64{buckets[0].C, buckets[1].C, buckets[2].C})
	}
}

func TestMapHistogramEmpty(t *testing.T) {
	if got := MapHistogram(nil); len(got) != 0 {
		t.Fatalf("want empty, got %v", got)
	}
}
