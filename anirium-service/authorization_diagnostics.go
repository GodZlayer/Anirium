package main

import "fmt"

// formatAuthorizationDiagnostic renders one secret-free log record for an
// authorization rejection. The reason is restricted to the Core allowlist:
// anything unknown, including a crafted reason carrying newlines, collapses
// to session_invalid, so a denial can never inject log lines or echo
// tokens, devices, accounts, tickets, URLs or payloads. nil yields "".
func formatAuthorizationDiagnostic(rejection *serviceAuthRejection) string {
	if rejection == nil {
		return ""
	}
	safe := safeCoreReason(rejection.reason)
	if safe == "" {
		safe = serviceAuthReasonInvalid
	}
	return fmt.Sprintf("authorization status=%d reason=%s", rejection.status, safe)
}

// logAuthorizationDiagnostic records an authorization verdict through the
// existing service log with only its HTTP status and allowlisted reason.
// Credentials and request content never reach the log.
func logAuthorizationDiagnostic(rejection *serviceAuthRejection) {
	if msg := formatAuthorizationDiagnostic(rejection); msg != "" {
		appendLog(msg)
	}
}
