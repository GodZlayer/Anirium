package main

import (
	"context"
	"sync"
)

func probeSources(ctx context.Context, sources []string, probe func(string)) {
	jobs := make(chan string)
	var workers sync.WaitGroup
	count := 4
	if len(sources) < count {
		count = len(sources)
	}
	for index := 0; index < count; index++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for source := range jobs {
				if ctx.Err() != nil {
					return
				}
				probe(source)
			}
		}()
	}
dispatch:
	for _, source := range sources {
		select {
		case jobs <- source:
		case <-ctx.Done():
			break dispatch
		}
	}
	close(jobs)
	workers.Wait()
}
