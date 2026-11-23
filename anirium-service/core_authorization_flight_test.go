package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestConcurrentAuthorizationSharesInflightCheckButNeverCachesRevocation(t *testing.T) {
	var calls atomic.Int32
	var denied atomic.Bool
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		time.Sleep(100 * time.Millisecond)
		if denied.Load() {
			w.WriteHeader(403)
			fmt.Fprint(w, `{"status":"unauthorized","reason":"plus_required"}`)
			return
		}
		fmt.Fprint(w, `{"status":"authorized","level":2,"accountId":"fixture","playerSessionId":"fixture-player"}`)
	}))
	defer core.Close()
	t.Setenv("ANIRIUM_CORE_URL", core.URL)
	var group sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 16; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			auth, rejection := validateServiceTokenDetailed("fixture", "device")
			if rejection != nil || auth.AccountID != "fixture" {
				t.Error("concurrent verdict changed")
			}
		}()
	}
	close(start)
	group.Wait()
	if calls.Load() != 1 {
		t.Fatalf("duplicate Core requests: %d", calls.Load())
	}
	denied.Store(true)
	_, rejection := validateServiceTokenDetailed("fixture", "device")
	if rejection == nil || rejection.reason != "plus_required" || calls.Load() != 2 {
		t.Fatal("completed verdict masked revocation")
	}
}
