package main

import (
	"os"
	"strings"
)

const officialCoreURL = "https://anirium.com.br"

// The Store build works without asking users to set an environment variable.
// Explicit deployments/tests may still select their own Core. Credentials are
// never used to discover a Core URL from a provider or playback request.
func configuredCoreURL() string {
	configured := strings.TrimSpace(os.Getenv("ANIRIUM_CORE_URL"))
	if configured == "" {
		return officialCoreURL
	}
	return strings.TrimRight(configured, "/")
}
