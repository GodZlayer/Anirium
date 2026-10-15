package main

import (
	"context"
	"os/exec"
	"syscall"
)

// Media tools are local worker processes, never interactive console windows.
func mediaCommandContext(ctx context.Context, executable string, args ...string) *exec.Cmd {
	command := exec.CommandContext(ctx, executable, args...)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return command
}
