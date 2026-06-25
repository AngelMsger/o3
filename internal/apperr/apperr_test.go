package apperr

import (
	"errors"
	"fmt"
	"testing"

	cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
)

func TestWrapClassifiesCLIError(t *testing.T) {
	src := cerr.New(cerr.CategoryAuth, "BAD", "bad creds").WithHint("check password")
	wrapped := Wrap(src)
	var ae AppError
	if !errors.As(wrapped, &ae) {
		t.Fatalf("Wrap did not produce an AppError: %T", wrapped)
	}
	if ae.Category != "auth" {
		t.Fatalf("Category = %q, want %q", ae.Category, "auth")
	}
	if ae.Message != "bad creds" {
		t.Fatalf("Message = %q, want %q", ae.Message, "bad creds")
	}
	if ae.Hint != "check password" {
		t.Fatalf("Hint = %q, want %q", ae.Hint, "check password")
	}
}

func TestWrapPlainError(t *testing.T) {
	wrapped := Wrap(errors.New("boom"))
	var ae AppError
	if !errors.As(wrapped, &ae) {
		t.Fatalf("Wrap did not produce an AppError: %T", wrapped)
	}
	if ae.Message != "boom" {
		t.Fatalf("Message = %q, want %q", ae.Message, "boom")
	}
}

func TestWrapNil(t *testing.T) {
	if Wrap(nil) != nil {
		t.Fatal("Wrap(nil) should be nil")
	}
}

func TestNotConfigured(t *testing.T) {
	var ae AppError
	if !errors.As(NotConfigured("set up first"), &ae) {
		t.Fatal("NotConfigured should be an AppError")
	}
	if ae.Category != CategoryNotConfigured {
		t.Fatalf("Category = %q, want %q", ae.Category, CategoryNotConfigured)
	}
}

func TestWrapPreservesWrappedAppError(t *testing.T) {
	orig := AppError{Category: "auth", Message: "bad creds", Hint: "check password"}
	wrapped := Wrap(fmt.Errorf("while connecting: %w", orig))
	var ae AppError
	if !errors.As(wrapped, &ae) {
		t.Fatalf("Wrap did not produce an AppError: %T", wrapped)
	}
	if ae.Category != "auth" || ae.Message != "bad creds" || ae.Hint != "check password" {
		t.Fatalf("wrapped AppError not preserved: %+v", ae)
	}
}
