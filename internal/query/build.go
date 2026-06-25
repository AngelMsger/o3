package query

import (
	"fmt"
	"time"
)

// RelativeRange returns [start,end] in epoch microseconds for "last amount·unit"
// ending at now. unit is one of s, m, h, d, w.
func RelativeRange(now time.Time, amount int, unit string) (start, end int64, err error) {
	if amount <= 0 {
		return 0, 0, fmt.Errorf("amount must be positive, got %d", amount)
	}
	var d time.Duration
	switch unit {
	case "s":
		d = time.Duration(amount) * time.Second
	case "m":
		d = time.Duration(amount) * time.Minute
	case "h":
		d = time.Duration(amount) * time.Hour
	case "d":
		d = time.Duration(amount) * 24 * time.Hour
	case "w":
		d = time.Duration(amount) * 7 * 24 * time.Hour
	default:
		return 0, 0, fmt.Errorf("unknown time unit %q (want s, m, h, d, w)", unit)
	}
	end = now.UnixMicro()
	start = now.Add(-d).UnixMicro()
	return start, end, nil
}

// absLayout is the wall-clock format the absolute time picker emits.
const absLayout = "2006-01-02 15:04:05"

// AbsoluteRange parses "YYYY-MM-DD HH:mm:ss" from/to in loc into epoch micros.
func AbsoluteRange(from, to string, loc *time.Location) (start, end int64, err error) {
	if loc == nil {
		loc = time.Local
	}
	f, err := time.ParseInLocation(absLayout, from, loc)
	if err != nil {
		return 0, 0, fmt.Errorf("bad start time %q: %w", from, err)
	}
	t, err := time.ParseInLocation(absLayout, to, loc)
	if err != nil {
		return 0, 0, fmt.Errorf("bad end time %q: %w", to, err)
	}
	start, end = f.UnixMicro(), t.UnixMicro()
	if end <= start {
		return 0, 0, fmt.Errorf("end time must be after start time")
	}
	return start, end, nil
}

// intervalLadder maps a bucket size in seconds to its OpenObserve word form,
// ordered ascending. Interval snaps a target up to the smallest ladder entry.
var intervalLadder = []struct {
	sec  int64
	word string
}{
	{1, "1 second"}, {5, "5 second"}, {10, "10 second"}, {30, "30 second"},
	{60, "1 minute"}, {300, "5 minute"}, {900, "15 minute"}, {1800, "30 minute"},
	{3600, "1 hour"}, {7200, "2 hour"}, {21600, "6 hour"}, {43200, "12 hour"},
	{86400, "1 day"},
}

// Interval picks a histogram bucket size for the span, aiming for ~60 buckets,
// snapped up to the nearest ladder entry and capped at one day.
func Interval(startMicros, endMicros int64) string {
	spanSec := (endMicros - startMicros) / 1_000_000
	if spanSec < 0 {
		spanSec = 0
	}
	target := spanSec / 60
	for _, e := range intervalLadder {
		if e.sec >= target {
			return e.word
		}
	}
	return intervalLadder[len(intervalLadder)-1].word
}

// HistogramSQL builds the time-bucket aggregation, matching the CLI's
// buildHistogramSQL shape (zo_sql_key / zo_sql_num columns).
func HistogramSQL(stream, interval string) string {
	return fmt.Sprintf(
		`SELECT histogram(_timestamp, '%s') AS zo_sql_key, count(*) AS zo_sql_num FROM "%s" GROUP BY zo_sql_key ORDER BY zo_sql_key`,
		interval, stream,
	)
}
