package query

import "testing"

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

func TestExtractWhere(t *testing.T) {
	tests := []struct {
		sql  string
		want string
	}{
		{`SELECT * FROM "s" WHERE level='error'`, "level='error'"},
		{`SELECT * FROM "s" WHERE a=1 ORDER BY _timestamp DESC`, "a=1"},
		{`SELECT * FROM "s" WHERE a=1 GROUP BY x LIMIT 10`, "a=1"},
		{`select * from "s" where level='x' order by t`, "level='x'"},
		{`SELECT * FROM "s"`, ""},
		{`SELECT * FROM "s" ORDER BY _timestamp DESC LIMIT 50`, ""},
		{`SELECT * FROM "s" WHERE  service_name = 'api'  LIMIT 5`, "service_name = 'api'"},
	}
	for _, tt := range tests {
		if got := ExtractWhere(tt.sql); got != tt.want {
			t.Fatalf("ExtractWhere(%q) = %q, want %q", tt.sql, got, tt.want)
		}
	}
}

func TestHistogramSQL(t *testing.T) {
	got := HistogramSQL("demo_logs", "", "30 second")
	want := `SELECT histogram(_timestamp, '30 second') AS zo_sql_key, count(*) AS zo_sql_num FROM "demo_logs" GROUP BY zo_sql_key ORDER BY zo_sql_key`
	if got != want {
		t.Fatalf("HistogramSQL no-where =\n%q\nwant\n%q", got, want)
	}

	gotW := HistogramSQL("demo_logs", "level='error'", "30 second")
	wantW := `SELECT histogram(_timestamp, '30 second') AS zo_sql_key, count(*) AS zo_sql_num FROM "demo_logs" WHERE level='error' GROUP BY zo_sql_key ORDER BY zo_sql_key`
	if gotW != wantW {
		t.Fatalf("HistogramSQL with-where =\n%q\nwant\n%q", gotW, wantW)
	}
}
