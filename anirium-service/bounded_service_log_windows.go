package main

import (
	"bufio"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/sys/windows"
)

const serviceLogMaxBytes = 1 << 20
const serviceLogMaxAge = 7 * 24 * time.Hour

// Only these three managed files are rotated or expired. The former TEMP log
// is neither read nor deleted. Age cleanup occurs on the next append/start.
type boundedServiceLog struct {
	mu         sync.Mutex
	directory  string
	maxBytes   int64
	maxAge     time.Duration
	now        func() time.Time
	bootID     string
	sequence   uint64
	failures   atomic.Uint64
	initError  error
	descriptor *windows.SECURITY_DESCRIPTOR
}

func newBoundedServiceLog(directory string) *boundedServiceLog {
	return &boundedServiceLog{directory: directory, maxBytes: serviceLogMaxBytes,
		maxAge: serviceLogMaxAge, now: time.Now, bootID: rand.Text()}
}

var serviceLog = func() *boundedServiceLog {
	directory, err := os.UserCacheDir()
	writer := newBoundedServiceLog(filepath.Join(directory, "Anirium", "logs"))
	writer.initError = err
	return writer
}()

func regularLogPath(path string) error {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("managed log path is not a regular file")
	}
	return nil
}

func regularLogDirectory(directory string) error {
	// Check ancestors too: a junction in Anirium/ must not redirect logs into
	// another store. Missing directories may be created only after this check.
	for path := directory; ; path = filepath.Dir(path) {
		info, err := os.Lstat(path)
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		if err == nil && (!info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
			return errors.New("invalid managed log directory")
		}
		if filepath.Dir(path) == path {
			return nil
		}
	}
}

func oldestLogEntry(path string) (time.Time, error) {
	f, err := os.Open(path)
	if err != nil {
		return time.Time{}, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return time.Time{}, err
	}
	if info.Size() == 0 {
		return time.Time{}, nil
	}
	stamp, err := bufio.NewReaderSize(f, 64).ReadSlice(' ')
	if err != nil {
		return time.Time{}, errors.New("invalid managed log timestamp")
	}
	return time.Parse(time.RFC3339Nano, strings.TrimSpace(string(stamp)))
}

func (l *boundedServiceLog) entry(now time.Time, message string) ([]byte, error) {
	l.sequence++
	prefix := fmt.Sprintf("%s event_id=%s.%d pid=%d ", now.UTC().Format(time.RFC3339Nano), l.bootID, l.sequence, os.Getpid())
	limit := int64(4096)
	if l.maxBytes < limit {
		limit = l.maxBytes
	}
	budget := int(limit) - len(prefix) - len(" [truncated]\n")
	if budget < 1 {
		return nil, errors.New("log record budget too small")
	}
	var text strings.Builder
	truncated := false
	for _, r := range message {
		if unicode.IsControl(r) || r == '\u2028' || r == '\u2029' {
			r = ' '
		}
		if text.Len()+utf8.RuneLen(r) > budget {
			truncated = true
			break
		}
		text.WriteRune(r)
	}
	if truncated {
		text.WriteString(" [truncated]")
	}
	return []byte(prefix + text.String() + "\n"), nil
}

func (l *boundedServiceLog) append(message string) (err error) {
	defer func() {
		if err != nil {
			l.failures.Add(1)
		}
	}()
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.initError != nil {
		return l.initError
	}
	if !filepath.IsAbs(l.directory) || l.maxBytes < 256 || l.maxAge <= 0 {
		return errors.New("invalid managed log policy")
	}
	if err = regularLogDirectory(l.directory); err != nil {
		return err
	}
	if l.descriptor == nil {
		l.descriptor, err = privateLogDescriptor()
		if err != nil {
			return err
		}
	}
	if err = os.MkdirAll(l.directory, 0700); err != nil {
		return err
	}
	if err = regularLogDirectory(l.directory); err != nil {
		return err
	}
	lockPath := filepath.Join(l.directory, "service.log.lock")
	if err = regularLogPath(lockPath); err != nil {
		return err
	}
	lock, err := privateLogHandle(lockPath, windows.GENERIC_READ|windows.GENERIC_WRITE, windows.OPEN_ALWAYS, 0, l.descriptor)
	if err != nil {
		return err
	}
	defer lock.Close()
	var overlap windows.Overlapped
	if err = windows.LockFileEx(windows.Handle(lock.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK, 0, 1, 0, &overlap); err != nil {
		return err
	}
	defer windows.UnlockFileEx(windows.Handle(lock.Fd()), 0, 1, 0, &overlap)
	// Serialize directory DACL updates too. MAXIMUM_ALLOWED includes DELETE;
	// concurrent directory handles without FILE_SHARE_DELETE would conflict.
	directory, err := privateLogHandle(l.directory, 0, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS, l.descriptor)
	if err != nil {
		return err
	}
	defer directory.Close()

	paths := []string{filepath.Join(l.directory, "service.log"), filepath.Join(l.directory, "service.log.1"), filepath.Join(l.directory, "service.log.2")}
	// Validate every owned path before any removal/rename. Unknown files stay.
	for _, path := range paths {
		if err = regularLogPath(path); err != nil {
			return err
		}
	}
	for _, path := range paths {
		file, openErr := privateLogHandle(path, 0, windows.OPEN_EXISTING, 0, l.descriptor)
		if os.IsNotExist(openErr) {
			continue
		}
		if openErr != nil {
			return openErr
		}
		if err = file.Close(); err != nil {
			return err
		}
	}
	now := l.now()
	for _, path := range paths {
		oldest, readErr := oldestLogEntry(path)
		if os.IsNotExist(readErr) {
			continue
		}
		if readErr != nil {
			return readErr
		}
		if !oldest.IsZero() && !oldest.After(now.Add(-l.maxAge)) {
			if err = os.Remove(path); err != nil {
				return err
			}
		}
	}
	entry, err := l.entry(now, message)
	if err != nil {
		return err
	}
	info, err := os.Stat(paths[0])
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil && info.Size()+int64(len(entry)) > l.maxBytes {
		if err = os.Remove(paths[2]); err != nil && !os.IsNotExist(err) {
			return err
		}
		if err = os.Rename(paths[1], paths[2]); err != nil && !os.IsNotExist(err) {
			return err
		}
		if err = os.Rename(paths[0], paths[1]); err != nil {
			return err
		}
	}
	f, err := privateLogHandle(paths[0], windows.FILE_APPEND_DATA, windows.OPEN_ALWAYS, 0, l.descriptor)
	if err != nil {
		return err
	}
	_, writeErr := f.Write(entry)
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}
