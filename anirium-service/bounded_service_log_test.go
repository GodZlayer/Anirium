package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"golang.org/x/sys/windows"
)

// All Service tests use their own log store. Running tests must never rotate a
// user's real logs or write the former global TEMP log.
func TestMain(m *testing.M) {
	directory, err := os.MkdirTemp("", "anirium-service-tests-")
	if err != nil {
		panic("cannot create isolated test log store")
	}
	serviceLog = newBoundedServiceLog(directory)
	code := m.Run()
	resolved, err := filepath.Abs(directory)
	tempRoot, rootErr := filepath.Abs(os.TempDir())
	if err == nil && rootErr == nil && filepath.Dir(resolved) == filepath.Clean(tempRoot) && strings.HasPrefix(filepath.Base(resolved), "anirium-service-tests-") {
		if cleanupErr := os.RemoveAll(resolved); cleanupErr != nil {
			fmt.Fprintln(os.Stderr, "isolated test store cleanup failed")
			code = 1
		}
	} else {
		fmt.Fprintln(os.Stderr, "isolated test store cleanup path rejected")
		code = 1
	}
	os.Exit(code)
}

func TestBoundedServiceLogRotationAndSingleLineBudget(t *testing.T) {
	directory := t.TempDir()
	writer := newBoundedServiceLog(directory)
	writer.maxBytes = 512
	legacy := filepath.Join(directory, "anirium_service.log")
	if err := os.WriteFile(legacy, []byte("legacy evidence"), 0600); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 30; index++ {
		if err := writer.append(fmt.Sprintf("entry%02d\n\r\x00%s", index, strings.Repeat("á", 5000))); err != nil {
			t.Fatal(err)
		}
	}
	var total int64
	for _, name := range []string{"service.log", "service.log.1", "service.log.2"} {
		path := filepath.Join(directory, name)
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Size() > 512 {
			t.Fatalf("file limit exceeded: %d", info.Size())
		}
		total += info.Size()
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !utf8.Valid(body) || strings.ContainsAny(string(body), "\r\x00") || strings.Count(string(body), "\n") != 1 || !strings.Contains(string(body), "[truncated]") {
			t.Fatal("record budget/one-line encoding invalid")
		}
	}
	if total > 3*512 {
		t.Fatal("total log size exceeded")
	}
	current, _ := os.ReadFile(filepath.Join(directory, "service.log"))
	if !strings.Contains(string(current), "entry29") {
		t.Fatal("newest log entry missing")
	}
	old, _ := os.ReadFile(legacy)
	if string(old) != "legacy evidence" {
		t.Fatal("legacy evidence changed")
	}
}

func TestBoundedServiceLogAgeUsesOldestRecordNotMtime(t *testing.T) {
	directory := t.TempDir()
	writer := newBoundedServiceLog(directory)
	now := time.Date(2026, 10, 7, 3, 0, 0, 0, time.UTC)
	writer.now = func() time.Time { return now }
	for name, age := range map[string]time.Duration{"service.log": 8 * 24 * time.Hour, "service.log.1": 6 * 24 * time.Hour, "service.log.2": 9 * 24 * time.Hour, "service.log.3": 9 * 24 * time.Hour} {
		body := now.Add(-age).Format(time.RFC3339Nano) + " event_id=fixture old record\n"
		if err := os.WriteFile(filepath.Join(directory, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.append("fresh record"); err != nil {
		t.Fatal(err)
	}
	current, _ := os.ReadFile(filepath.Join(directory, "service.log"))
	if strings.Contains(string(current), "old record") || !strings.Contains(string(current), "fresh record") {
		t.Fatal("expired active records kept")
	}
	if _, err := os.Stat(filepath.Join(directory, "service.log.2")); !os.IsNotExist(err) {
		t.Fatal("expired backup kept")
	}
	for _, name := range []string{"service.log.1", "service.log.3"} {
		if _, err := os.Stat(filepath.Join(directory, name)); err != nil {
			t.Fatal("recent or unowned file removed")
		}
	}
}

func TestBoundedServiceLogRejectsInvalidOwnedFileBeforeMutation(t *testing.T) {
	directory := t.TempDir()
	writer := newBoundedServiceLog(directory)
	if err := writer.append("preserved"); err != nil {
		t.Fatal(err)
	}
	current := filepath.Join(directory, "service.log")
	before, _ := os.ReadFile(current)
	if err := os.Mkdir(filepath.Join(directory, "service.log.2"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := writer.append("must not write"); err == nil {
		t.Fatal("non-regular owned path accepted")
	}
	after, _ := os.ReadFile(current)
	if string(before) != string(after) || writer.failures.Load() != 1 {
		t.Fatal("mutation or failure tracking incorrect")
	}
}

func TestBoundedServiceLogRejectsSymlink(t *testing.T) {
	directory := t.TempDir()
	writer := newBoundedServiceLog(directory)
	target := filepath.Join(t.TempDir(), "evidence.txt")
	if err := os.WriteFile(target, []byte("preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(directory, "service.log")); err != nil {
		t.Skip("Windows symlink privilege unavailable")
	}
	if err := writer.append("must not follow"); err == nil {
		t.Fatal("managed symlink accepted")
	}
	body, _ := os.ReadFile(target)
	if string(body) != "preserve" {
		t.Fatal("symlink target changed")
	}
}

func TestBoundedServiceLogUnavailableStoreDoesNotFallback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "file-not-directory")
	if err := os.WriteFile(path, []byte("preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	writer := newBoundedServiceLog(path)
	if err := writer.append("cannot write"); err == nil || writer.failures.Load() != 1 {
		t.Fatal("unavailable store not tracked")
	}
	body, _ := os.ReadFile(path)
	if string(body) != "preserve" {
		t.Fatal("failed store overwritten")
	}
}

func TestBoundedServiceLogFailureIsObservableWithoutRawError(t *testing.T) {
	before := serviceLog.failures.Load()
	serviceLog.mu.Lock()
	previous := serviceLog.initError
	serviceLog.initError = errors.New("private-failure-marker")
	serviceLog.mu.Unlock()
	defer func() { serviceLog.mu.Lock(); serviceLog.initError = previous; serviceLog.mu.Unlock() }()
	appendLog("logger failure fixture")
	response := httptest.NewRecorder()
	newServiceHTTPHandler(4004).ServeHTTP(response, httptest.NewRequest("GET", "http://127.0.0.1:4004/health", nil))
	var report HealthResponse
	if err := json.Unmarshal(response.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || report.LogFailures < before+1 || strings.Contains(response.Body.String(), "private-failure-marker") {
		t.Fatal("logger failure metric missing or raw error exposed")
	}
}

func TestBoundedServiceLogRejectsJunctionAncestorBeforeCreatingDirectory(t *testing.T) {
	root := t.TempDir()
	target := t.TempDir()
	link := filepath.Join(root, "junction")
	command := exec.Command("cmd.exe", "/c", "mklink", "/J", link, target)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("cannot prepare junction fixture: %v %s", err, output)
	}
	writer := newBoundedServiceLog(filepath.Join(link, "logs"))
	if err := writer.append("must not follow junction"); err == nil {
		t.Fatal("junction ancestor accepted")
	}
	if _, err := os.Stat(filepath.Join(target, "logs")); !os.IsNotExist(err) {
		t.Fatal("directory created through junction")
	}
}

func logDACL(t *testing.T, path string) string {
	t.Helper()
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal("cannot read fixture DACL")
	}
	return sd.String()
}

func TestBoundedServiceLogPrivateACLAndUnownedFilePreservation(t *testing.T) {
	parent := t.TempDir()
	parentDACL := logDACL(t, parent)
	directory := filepath.Join(parent, "logs")
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	unowned := filepath.Join(directory, "unowned-evidence.txt")
	if err := os.WriteFile(unowned, []byte("preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	unownedDACL := logDACL(t, unowned)
	writer := newBoundedServiceLog(directory)
	writer.maxBytes = 512
	for index := 0; index < 10; index++ {
		if err := writer.append(strings.Repeat("record ", 100)); err != nil {
			t.Fatal(err)
		}
	}
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"", "service.log", "service.log.1", "service.log.2", "service.log.lock"} {
		dacl := logDACL(t, filepath.Join(directory, name))
		if !strings.HasPrefix(dacl, "D:P") || strings.Count(dacl, "(A;") != 2 || !strings.Contains(dacl, ";;;SY)") || !strings.Contains(dacl, ";;;"+user.User.Sid.String()+")") {
			t.Fatalf("private managed DACL not applied to %s", name)
		}
	}
	if logDACL(t, parent) != parentDACL || logDACL(t, unowned) != unownedDACL {
		t.Fatal("ACL propagated to parent or unowned file")
	}
	body, err := os.ReadFile(unowned)
	if err != nil || string(body) != "preserve" {
		t.Fatal("unowned evidence changed")
	}
}

func TestBoundedServiceLogCreatesMissingDirectory(t *testing.T) {
	writer := newBoundedServiceLog(filepath.Join(t.TempDir(), "Anirium", "logs"))
	if err := writer.append("fresh installation"); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(writer.directory, "service.log"))
	if err != nil || !strings.Contains(string(body), "fresh installation") {
		t.Fatal("fresh store did not create private log")
	}
}

func TestBoundedServiceLogRejectsHardlinkWithoutChangingTargetACL(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(t.TempDir(), "evidence.txt")
	if err := os.WriteFile(target, []byte("preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	before := logDACL(t, target)
	if err := os.Link(target, filepath.Join(directory, "service.log")); err != nil {
		t.Fatal(err)
	}
	writer := newBoundedServiceLog(directory)
	if err := writer.append("must not mutate hardlink"); err == nil {
		t.Fatal("hardlink accepted")
	}
	body, err := os.ReadFile(target)
	if err != nil || string(body) != "preserve" || logDACL(t, target) != before {
		t.Fatal("hardlink target changed")
	}
}

func TestBoundedServiceLogConcurrentWriters(t *testing.T) {
	directory := t.TempDir()
	writers := []*boundedServiceLog{newBoundedServiceLog(directory), newBoundedServiceLog(directory)}
	var work sync.WaitGroup
	for index := 0; index < 100; index++ {
		work.Add(1)
		go func(index int) {
			defer work.Done()
			if err := writers[index%2].append(fmt.Sprintf("entry=%d", index)); err != nil {
				t.Error(err)
			}
		}(index)
	}
	work.Wait()
	body, err := os.ReadFile(filepath.Join(directory, "service.log"))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(body)), "\n")
	if len(lines) != 100 {
		t.Fatalf("lost concurrent records: %d", len(lines))
	}
	ids := map[string]bool{}
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 4 || ids[fields[1]] {
			t.Fatal("corrupt or repeated event ID")
		}
		ids[fields[1]] = true
	}
}

func TestBoundedServiceLogChildHelper(t *testing.T) {
	directory := os.Getenv("ANIRIUM_TEST_LOG_DIRECTORY")
	if directory == "" {
		t.Skip("subprocess helper")
	}
	writer := newBoundedServiceLog(directory)
	for index := 0; index < 40; index++ {
		if err := writer.append(fmt.Sprintf("child entry=%d", index)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestBoundedServiceLogCrossProcessLock(t *testing.T) {
	directory := t.TempDir()
	var work sync.WaitGroup
	for index := 0; index < 3; index++ {
		work.Add(1)
		go func() {
			defer work.Done()
			child := exec.Command(os.Args[0], "-test.run=^TestBoundedServiceLogChildHelper$", "-test.count=1")
			child.Env = append(os.Environ(), "ANIRIUM_TEST_LOG_DIRECTORY="+directory)
			if output, err := child.CombinedOutput(); err != nil {
				t.Errorf("subprocess failed: %v %s", err, output)
			}
		}()
	}
	work.Wait()
	body, err := os.ReadFile(filepath.Join(directory, "service.log"))
	if err != nil {
		t.Fatal(err)
	}
	if count := strings.Count(string(body), "\n"); count != 120 {
		t.Fatalf("lost cross-process records: %d", count)
	}
}
