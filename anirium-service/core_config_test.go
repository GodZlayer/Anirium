package main

import "testing"

func TestConfiguredCoreURL(t *testing.T) {
	for _, fixture := range []struct{ configured, want string }{
		{"", "https://anirium.com.br"},
		{"   ", "https://anirium.com.br"},
		{" https://example.test/// ", "https://example.test"},
		{"http://127.0.0.1:1234/", "http://127.0.0.1:1234"},
	} {
		t.Setenv("ANIRIUM_CORE_URL", fixture.configured)
		if got := configuredCoreURL(); got != fixture.want {
			t.Fatalf("configuredCoreURL() = %q, want %q", got, fixture.want)
		}
	}
}
