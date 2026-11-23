package main

import (
	"crypto/sha256"
	"encoding/hex"
	"golang.org/x/sync/singleflight"
)

var coreAuthorizationFlights singleflight.Group

type coreAuthorizationResult struct {
	Authorization serviceAuthorization
	Rejection     *serviceAuthRejection
}

// Coalesce only overlapping checks for the exact credential/device pair.
// No TTL or previous positive verdict is reused after a request completes.
func validateServiceTokenDetailed(token, deviceID string) (serviceAuthorization, *serviceAuthRejection) {
	key := sha256.Sum256([]byte(token + "\x00" + deviceID))
	value, _, _ := coreAuthorizationFlights.Do(hex.EncodeToString(key[:]), func() (any, error) {
		authorization, rejection := validateServiceTokenUnshared(token, deviceID)
		return coreAuthorizationResult{authorization, rejection}, nil
	})
	result := value.(coreAuthorizationResult)
	return result.Authorization, result.Rejection
}
