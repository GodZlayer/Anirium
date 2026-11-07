package main

import "net/http"

// recheckPrepareAuthorization compares the authorization verdict observed
// after provider search with the initial one. Any change in the bound
// account or player session means the playback request must not proceed.
func recheckPrepareAuthorization(initial, rechecked serviceAuthorization) *serviceAuthRejection {
	if rechecked.AccountID != initial.AccountID {
		return &serviceAuthRejection{status: http.StatusForbidden, reason: "account_mismatch"}
	}
	if rechecked.PlayerSessionID != initial.PlayerSessionID {
		return &serviceAuthRejection{status: http.StatusForbidden, reason: "session_mismatch"}
	}
	return nil
}
