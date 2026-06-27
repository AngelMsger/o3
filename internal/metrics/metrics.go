// Package metrics maps OpenObserve's Prometheus-compatible PromQL range
// responses into chart-ready series for the Metrics explorer. It is pure: no
// HTTP, no client. The bound method in package main supplies the client.
package metrics

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Params is the metrics range-query request from the frontend.
type Params struct {
	PromQL      string `json:"promql"`
	StartMicros int64  `json:"startMicros"`
	EndMicros   int64  `json:"endMicros"`
}

// Point is one sample on a series. T is epoch milliseconds (for the chart's
// time axis); V is the sample value.
type Point struct {
	T int64   `json:"t"`
	V float64 `json:"v"`
}

// Series is one labelled time series in a metrics result.
type Series struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels"`
	Points []Point           `json:"points"`
}

// Result is the mapped metrics range-query reply for the frontend.
type Result struct {
	Series []Series `json:"series"`
	Step   string   `json:"step"`
}

// stepLadder mirrors the histogram interval ladder but renders Prometheus
// durations, targeting ~120 points across the window.
var stepLadder = []struct {
	sec  int64
	prom string
}{
	{15, "15s"}, {30, "30s"}, {60, "1m"}, {300, "5m"}, {900, "15m"},
	{1800, "30m"}, {3600, "1h"}, {7200, "2h"}, {21600, "6h"}, {43200, "12h"}, {86400, "1d"},
}

// PromStep picks a Prometheus step duration for a [start,end] window so the
// range query returns a chart-friendly number of points (~120 max).
func PromStep(startMicros, endMicros int64) string {
	spanSec := (endMicros - startMicros) / 1_000_000
	if spanSec < 0 {
		spanSec = 0
	}
	target := spanSec / 120
	for _, e := range stepLadder {
		if e.sec >= target {
			return e.prom
		}
	}
	return stepLadder[len(stepLadder)-1].prom
}

// promMatrix is the shape of a Prometheus matrix result inside the PromQL
// response's data envelope.
type promMatrix struct {
	ResultType string `json:"resultType"`
	Result     []struct {
		Metric map[string]string   `json:"metric"`
		Values [][]json.RawMessage `json:"values"`
	} `json:"result"`
}

// MapMatrix decodes a PromQL range-query data envelope into chart-ready series.
// Each Prometheus sample is [unixSeconds, "value"]; timestamps become epoch ms.
// Malformed samples are skipped rather than failing the whole result.
func MapMatrix(data json.RawMessage) ([]Series, error) {
	if len(data) == 0 {
		return nil, nil
	}
	var m promMatrix
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	out := make([]Series, 0, len(m.Result))
	for _, r := range m.Result {
		s := Series{Name: seriesName(r.Metric), Labels: r.Metric, Points: make([]Point, 0, len(r.Values))}
		for _, pair := range r.Values {
			if len(pair) != 2 {
				continue
			}
			var ts float64
			if err := json.Unmarshal(pair[0], &ts); err != nil {
				continue
			}
			var vs string
			if err := json.Unmarshal(pair[1], &vs); err != nil {
				continue
			}
			v, err := strconv.ParseFloat(vs, 64)
			if err != nil {
				continue
			}
			s.Points = append(s.Points, Point{T: int64(ts * 1000), V: v})
		}
		out = append(out, s)
	}
	return out, nil
}

// seriesName renders Prometheus labels as `name{k="v",...}` for the legend,
// falling back to "value" when a series carries no labels.
func seriesName(labels map[string]string) string {
	name := labels["__name__"]
	keys := make([]string, 0, len(labels))
	for k := range labels {
		if k == "__name__" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		if name == "" {
			return "value"
		}
		return name
	}
	var b strings.Builder
	b.WriteString(name)
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%s=%q", k, labels[k])
	}
	b.WriteByte('}')
	return b.String()
}
