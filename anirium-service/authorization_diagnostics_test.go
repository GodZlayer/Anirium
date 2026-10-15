package main

import (
	"strings"
	"testing"
)

func TestAuthorizationDiagnosticKnownReason(t *testing.T) {
	msg := formatAuthorizationDiagnostic(&serviceAuthRejection{status: 401, reason: "token_invalid"})
	if !strings.Contains(msg, "status=401") || !strings.Contains(msg, "reason=token_invalid") {
		t.Fatalf("unexpected diagnostic: %q", msg)
	}
}

func TestAuthorizationDiagnosticUnknownReasonInjection(t *testing.T) {
	msg := formatAuthorizationDiagnostic(&serviceAuthRejection{status: 403, reason: "token_invalid\nsecret-token https://core/player?account=acc"})
	if !strings.Contains(msg, "reason=session_invalid") {
		t.Fatalf("injection not collapsed: %q", msg)
	}
	for _, leaked := range []string{"secret-token", "\n", "https://", "account="} {
		if strings.Contains(msg, leaked) {
			t.Fatalf("diagnostic leaked %q: %q", leaked, msg)
		}
	}
}

func TestAuthorizationDiagnosticNil(t *testing.T) {
	if msg := formatAuthorizationDiagnostic(nil); msg != "" {
		t.Fatalf("nil rejection should render empty, got %q", msg)
	}
}
