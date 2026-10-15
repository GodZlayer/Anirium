package main

import (
	"context"
	"testing"
)

func TestMediaWorkersHaveNoConsoleWindow(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	command := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-version")
	if command.SysProcAttr == nil || !command.SysProcAttr.HideWindow || command.SysProcAttr.CreationFlags&0x08000000 == 0 {
		t.Fatal("media worker can open a console")
	}
	if err := command.Run(); err != context.Canceled {
		t.Fatalf("cancelled worker started: %v", err)
	}
}
