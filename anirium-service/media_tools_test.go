package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestBundledMediaToolIsPreferredToHostPATH(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "tools")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		fileName := name
		if runtime.GOOS == "windows" {
			fileName += ".exe"
		}
		bundled := filepath.Join(dir, fileName)
		if err := os.WriteFile(bundled, []byte("fixture"), 0700); err != nil {
			t.Fatal(err)
		}
		actual, err := resolveMediaTool(name, root)
		if err != nil || actual != bundled {
			t.Fatalf("bundled tool not selected: %s %v", actual, err)
		}
	}
}
