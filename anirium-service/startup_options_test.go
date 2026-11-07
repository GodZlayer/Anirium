package main

import (
	"path/filepath"
	"testing"
)

func TestServiceStartupOptionsKeepDesktopDefaults(t *testing.T) {
	options, err := parseServiceStartupOptions(nil)
	if err != nil || options.Headless || options.Port != 4004 || options.NoPeerDiscovery || options.DataDir != "" {
		t.Fatalf("defaults changed: %+v %v", options, err)
	}
	for _, args := range [][]string{{"--port=0"}, {"--headless"}, {"--headless", "--data-dir=relative"}, {"--unknown"}, {"--port=-1"}, {"--port=65536"}} {
		if _, err := parseServiceStartupOptions(args); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	options, err = parseServiceStartupOptions([]string{"--headless", "--port=0", "--data-dir=" + filepath.Join(t.TempDir(), "data"), "--no-peer-discovery"})
	if err != nil || !options.Headless || options.Port != 0 || !options.NoPeerDiscovery {
		t.Fatalf("isolated options: %+v %v", options, err)
	}
}
