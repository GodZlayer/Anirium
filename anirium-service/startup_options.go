package main

import (
	"flag"
	"fmt"
	"io"
	"path/filepath"
)

type serviceStartupOptions struct {
	Headless        bool
	Port            int
	DataDir         string
	NoPeerDiscovery bool
}

func parseServiceStartupOptions(args []string) (serviceStartupOptions, error) {
	var options serviceStartupOptions
	flags := flag.NewFlagSet("anirium-service", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.BoolVar(&options.Headless, "headless", false, "run local API without desktop UI")
	flags.IntVar(&options.Port, "port", 4004, "loopback API port (0 selects an available port)")
	flags.StringVar(&options.DataDir, "data-dir", "", "private torrent data directory")
	flags.BoolVar(&options.NoPeerDiscovery, "no-peer-discovery", false, "disable external peer discovery for isolated runs")
	if err := flags.Parse(args); err != nil {
		return options, err
	}
	if flags.NArg() != 0 || options.Port < 0 || options.Port > 65535 {
		return options, fmt.Errorf("invalid startup options")
	}
	if !options.Headless && (options.Port != 4004 || options.DataDir != "" || options.NoPeerDiscovery) {
		return options, fmt.Errorf("isolated options require headless mode")
	}
	if options.Headless && (options.DataDir == "" || !filepath.IsAbs(options.DataDir)) {
		return options, fmt.Errorf("headless mode requires an absolute private data directory")
	}
	return options, nil
}
