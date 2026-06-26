// Package apperr converts the CLI client's rich errors into a small, JSON-safe
// shape the frontend can place (connection vs query) and display.
package apperr

import (
	"encoding/json"
	"errors"

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

// Error returns the JSON encoding of the error so the value survives the Wails
// boundary (Wails rejects a frontend promise with this string). The frontend
// parses it back into {category, message, hint}. On the rare marshal failure it
// falls back to the plain message.
func (e AppError) Error() string {
	b, err := json.Marshal(struct {
		Category string `json:"category"`
		Message  string `json:"message"`
		Hint     string `json:"hint"`
	}{e.Category, e.Message, e.Hint})
	if err != nil {
		return e.Message
	}
	return string(b)
}

// Wrap converts any error into an AppError. CLIErrors keep their category and
// hint; plain errors become an "internal" AppError with the error text.
func Wrap(err error) error {
	if err == nil {
		return nil
	}
	var ae AppError
	if errors.As(err, &ae) {
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
