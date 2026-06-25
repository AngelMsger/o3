// Package apperr converts the CLI client's rich errors into a small, JSON-safe
// shape the frontend can place (connection vs query) and display.
package apperr

import (
	cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
)

// CategoryNotConfigured marks the "no connection configured yet" state, which
// the UI treats as "open the setup wizard".
const CategoryNotConfigured = "not_configured"

// AppError is the JSON-encodable error surfaced across the Wails boundary.
type AppError struct {
	Category string `json:"category"`
	Message  string `json:"message"`
	Hint     string `json:"hint"`
}

func (e AppError) Error() string { return e.Message }

// Wrap converts any error into an AppError. CLIErrors keep their category and
// hint; plain errors become an "internal" AppError with the error text.
func Wrap(err error) error {
	if err == nil {
		return nil
	}
	if ae, ok := err.(AppError); ok {
		return ae
	}
	ce := cerr.AsCLIError(err)
	return AppError{
		Category: string(ce.Category),
		Message:  ce.Message,
		Hint:     ce.Hint,
	}
}

// NotConfigured builds an AppError the UI maps to the setup wizard.
func NotConfigured(msg string) error {
	return AppError{Category: CategoryNotConfigured, Message: msg}
}
