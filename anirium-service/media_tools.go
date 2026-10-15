package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func resolveMediaTool(name, installDir string) (string, error) {
	fileName := name
	if runtime.GOOS == "windows" {
		fileName += ".exe"
	}
	bundled := filepath.Join(installDir, "tools", fileName)
	if info, err := os.Stat(bundled); err == nil && !info.IsDir() {
		return bundled, nil
	}
	return exec.LookPath(name)
}

func mediaTool(name string) string {
	executable, err := os.Executable()
	if err == nil {
		if path, err := resolveMediaTool(name, filepath.Dir(executable)); err == nil {
			return path
		}
	}
	// Preserve exec.Command's normal executable-not-found diagnostic.
	return name
}

func mediaToolsAvailable() bool {
	executable, err := os.Executable()
	if err != nil {
		return false
	}
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if _, err := resolveMediaTool(name, filepath.Dir(executable)); err != nil {
			return false
		}
	}
	return true
}
