package main

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

func TestDiagnosticsRejectsMissingBundledToolsWithoutHostFallback(t *testing.T) {
	var output bytes.Buffer
	if runServiceDiagnostics(&output, t.TempDir()) == nil {
		t.Fatal("missing bundled tools accepted")
	}
	var report map[string]any
	if err := json.Unmarshal(output.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report["bundledTools"] != false || report["mediaSmokeTest"] != false || report["networkStarted"] != false {
		t.Fatalf("false diagnostic success: %v", report)
	}
}

func TestDiagnosticsExecutesActualPackagedMediaTools(t *testing.T) {
	packageDir := os.Getenv("ANIRIUM_DIAGNOSTICS_PACKAGE_DIR")
	if packageDir == "" {
		t.Skip("set ANIRIUM_DIAGNOSTICS_PACKAGE_DIR to an actual extracted payload")
	}
	var output bytes.Buffer
	if err := runServiceDiagnostics(&output, packageDir); err != nil {
		t.Fatal(err)
	}
	var report map[string]any
	if err := json.Unmarshal(output.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report["bundledTools"] != true || report["mediaSmokeTest"] != true || report["networkStarted"] != false {
		t.Fatalf("packaged tool diagnostics failed: %v", report)
	}
}
