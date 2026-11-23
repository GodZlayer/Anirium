package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"time"
)

func resolveCatalogPlaybackContext(parent context.Context, input PlaybackPrepareRequest, auth serviceAuthorization) (PlaybackPrepareRequest, *serviceAuthRejection) {
	if input.WorkID == "" {
		return input, nil
	}
	body, _ := json.Marshal(map[string]string{"workId": input.WorkID, "episodeId": input.EpisodeID})
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, configuredCoreURL()+"/api/service/playback/context", bytes.NewReader(body))
	if err != nil {
		return input, catalogContextUnavailable()
	}
	request.Header.Set("Authorization", "Bearer "+input.Token)
	request.Header.Set("X-Anirium-Device", input.DeviceID)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Cache-Control", "no-store")
	response, err := coreAuthorizationClient.Do(request)
	if err != nil {
		return input, catalogContextUnavailable()
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound || response.StatusCode == http.StatusUnprocessableEntity {
		return input, &serviceAuthRejection{status: http.StatusNotFound, reason: "catalog_identity_invalid"}
	}
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		var denial struct {
			Reason string `json:"reason"`
		}
		if decodeProviderJSON(response.Body, 4096, &denial) != nil {
			return input, catalogContextUnavailable()
		}
		reason := safeCoreReason(denial.Reason)
		if reason == "" {
			reason = serviceAuthReasonInvalid
		}
		return input, &serviceAuthRejection{status: response.StatusCode, reason: reason}
	}
	if response.StatusCode != http.StatusOK {
		return input, catalogContextUnavailable()
	}
	var data corePlaybackContext
	if decodeProviderJSON(response.Body, 1<<20, &data) != nil {
		return input, catalogContextUnavailable()
	}
	resolved, err := applyCatalogPlaybackContext(input, data, auth)
	if err != nil {
		return input, catalogContextUnavailable()
	}
	return resolved, nil
}

func catalogContextUnavailable() *serviceAuthRejection {
	return &serviceAuthRejection{status: http.StatusServiceUnavailable, reason: "catalog_context_unavailable"}
}
