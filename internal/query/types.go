// Package query builds OpenObserve search requests (time ranges, intervals,
// histogram SQL) and maps raw hits into the frontend's row shape. It is pure:
// no HTTP, no client. The bound methods in package main supply the client.
package query

// KV is one key/value entry in a row's expanded JSON, typed for coloring.
// Kind is "str", "num", or "lvl".
type KV struct {
	K    string `json:"k"`
	V    string `json:"v"`
	Kind string `json:"kind"`
}

// LogRow mirrors the frontend's LogRow (types.ts) field-for-field.
type LogRow struct {
	ID      string `json:"id"`
	Time    string `json:"time"`
	Level   string `json:"level"`
	Service string `json:"service"`
	Body    string `json:"body"`
	LType   string `json:"ltype"`
	Trace   string `json:"trace"`
	JSON    []KV   `json:"json"`
}

// Bucket is one histogram column: T is the bucket label, H is the normalized
// height in [0,1].
type Bucket struct {
	T string  `json:"t"`
	H float64 `json:"h"`
}

// QueryMeta summarizes a search for the results header.
type QueryMeta struct {
	Total     int64   `json:"total"`
	TookMs    int     `json:"tookMs"`
	ScanBytes float64 `json:"scanBytes"`
}

// SearchResult is the full payload RunQuery returns to the frontend.
type SearchResult struct {
	Meta      QueryMeta `json:"meta"`
	Rows      []LogRow  `json:"rows"`
	Histogram []Bucket  `json:"histogram"`
}

// SearchParams is the frontend's RunQuery request.
type SearchParams struct {
	Stream      string `json:"stream"`
	SQL         string `json:"sql"`
	StartMicros int64  `json:"startMicros"`
	EndMicros   int64  `json:"endMicros"`
	From        int    `json:"from"`
	Size        int    `json:"size"`
	Histogram   bool   `json:"histogram"`
}
