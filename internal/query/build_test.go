package query

import (
	"testing"
	"time"
)

func TestRelativeRange(t *testing.T) {
	now := time.Date(2026, 6, 26, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		amount     int
		unit       string
		wantSpanUS int64
		wantErr    bool
	}{
		{15, "m", 15 * 60 * 1_000_000, false},
		{1, "h", 60 * 60 * 1_000_000, false},
		{30, "s", 30 * 1_000_000, false},
		{2, "d", 2 * 24 * 60 * 60 * 1_000_000, false},
		{1, "w", 7 * 24 * 60 * 60 * 1_000_000, false},
		{5, "x", 0, true},
		{0, "m", 0, true},
	}
	for _, tt := range tests {
		start, end, err := RelativeRange(now, tt.amount, tt.unit)
		if (err != nil) != tt.wantErr {
			t.Fatalf("amount=%d unit=%q err=%v wantErr=%v", tt.amount, tt.unit, err, tt.wantErr)
		}
		if tt.wantErr {
			continue
		}
		if end != now.UnixMicro() {
			t.Fatalf("end = %d, want now %d", end, now.UnixMicro())
		}
		if got := end - start; got != tt.wantSpanUS {
			t.Fatalf("span = %d, want %d", got, tt.wantSpanUS)
		}
	}
}

func TestAbsoluteRange(t *testing.T) {
	loc := time.UTC
	start, end, err := AbsoluteRange("2026-06-26 10:00:00", "2026-06-26 11:00:00", loc)
	if err != nil {
		t.Fatalf("AbsoluteRange: %v", err)
	}
	wantStart := time.Date(2026, 6, 26, 10, 0, 0, 0, loc).UnixMicro()
	wantEnd := time.Date(2026, 6, 26, 11, 0, 0, 0, loc).UnixMicro()
	if start != wantStart || end != wantEnd {
		t.Fatalf("got (%d,%d), want (%d,%d)", start, end, wantStart, wantEnd)
	}

	if _, _, err := AbsoluteRange("nope", "2026-06-26 11:00:00", loc); err == nil {
		t.Fatal("expected parse error for bad 'from'")
	}
	if _, _, err := AbsoluteRange("2026-06-26 11:00:00", "2026-06-26 10:00:00", loc); err == nil {
		t.Fatal("expected error when end is before start")
	}
}

func TestInterval(t *testing.T) {
	us := func(sec int64) (int64, int64) { return 0, sec * 1_000_000 }
	tests := []struct {
		spanSec int64
		want    string
	}{
		{15 * 60, "30 second"}, // 900s/60 = 15 -> ladder >=15 is 30
		{5 * 60, "5 second"},   // 300s/60 = 5
		{60 * 60, "1 minute"},  // 3600s/60 = 60
		{24 * 60 * 60, "30 minute"},
		{7 * 24 * 60 * 60, "6 hour"},
		{365 * 24 * 60 * 60, "1 day"}, // capped
	}
	for _, tt := range tests {
		s, e := us(tt.spanSec)
		if got := Interval(s, e); got != tt.want {
			t.Fatalf("Interval span=%ds = %q, want %q", tt.spanSec, got, tt.want)
		}
	}
}

func TestHistogramSQL(t *testing.T) {
	got := HistogramSQL("demo_logs", "30 second")
	want := `SELECT histogram(_timestamp, '30 second') AS zo_sql_key, count(*) AS zo_sql_num FROM "demo_logs" GROUP BY zo_sql_key ORDER BY zo_sql_key`
	if got != want {
		t.Fatalf("HistogramSQL =\n%q\nwant\n%q", got, want)
	}
}
