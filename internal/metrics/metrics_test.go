package metrics

import (
	"encoding/json"
	"testing"
)

func TestPromStep(t *testing.T) {
	cases := []struct {
		name       string
		spanSec    int64
		wantPrefix string
	}{
		{"5 minutes", 300, "15s"},     // 300/120 = 2.5 -> first ladder rung >=2 is 15s
		{"1 hour", 3600, "30s"},       // 3600/120 = 30 -> 30s
		{"6 hours", 21600, "5m"},      // 21600/120 = 180 -> 5m
		{"1 day", 86400, "15m"},       // 86400/120 = 720 -> 15m
		{"30 days", 2592000, "6h"},    // 2592000/120 = 21600 -> 6h
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := PromStep(0, c.spanSec*1_000_000)
			if got != c.wantPrefix {
				t.Fatalf("PromStep(%ds) = %q, want %q", c.spanSec, got, c.wantPrefix)
			}
		})
	}
}

func TestMapMatrix(t *testing.T) {
	data := json.RawMessage(`{
		"resultType": "matrix",
		"result": [
			{ "metric": {"__name__":"http_requests","svc":"api"}, "values": [[1719320400,"12.5"],[1719320430,"13"]] },
			{ "metric": {"__name__":"http_requests","svc":"web"}, "values": [[1719320400,"4"]] }
		]
	}`)
	series, err := MapMatrix(data)
	if err != nil {
		t.Fatalf("MapMatrix error: %v", err)
	}
	if len(series) != 2 {
		t.Fatalf("got %d series, want 2", len(series))
	}
	if series[0].Name != `http_requests{svc="api"}` {
		t.Fatalf("series name = %q", series[0].Name)
	}
	if len(series[0].Points) != 2 {
		t.Fatalf("series[0] points = %d, want 2", len(series[0].Points))
	}
	// Unix seconds become epoch milliseconds.
	if series[0].Points[0].T != 1719320400000 {
		t.Fatalf("point T = %d, want 1719320400000", series[0].Points[0].T)
	}
	if series[0].Points[0].V != 12.5 {
		t.Fatalf("point V = %v, want 12.5", series[0].Points[0].V)
	}
}

func TestMapMatrixSkipsMalformed(t *testing.T) {
	// A non-numeric value and a wrong-arity pair are skipped, not fatal.
	data := json.RawMessage(`{
		"resultType": "matrix",
		"result": [
			{ "metric": {"__name__":"m"}, "values": [[1719320400,"NaNskip?"],[1719320430],[1719320460,"7"]] }
		]
	}`)
	series, err := MapMatrix(data)
	if err != nil {
		t.Fatalf("MapMatrix error: %v", err)
	}
	if len(series) != 1 {
		t.Fatalf("got %d series, want 1", len(series))
	}
	if len(series[0].Points) != 1 || series[0].Points[0].V != 7 {
		t.Fatalf("expected one valid point V=7, got %+v", series[0].Points)
	}
	if series[0].Name != "m" {
		t.Fatalf("name = %q, want m", series[0].Name)
	}
}

func TestMapMatrixEmpty(t *testing.T) {
	series, err := MapMatrix(nil)
	if err != nil || series != nil {
		t.Fatalf("empty data should yield (nil,nil), got (%v,%v)", series, err)
	}
}
