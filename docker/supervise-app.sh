#!/bin/sh
set -eu

php_pid=''
cleanup() {
    trap - EXIT INT TERM
    [ -z "$php_pid" ] || kill "$php_pid" 2>/dev/null || true
    killall crond 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# Inicia o daemon de tarefas agendadas (Cron do Laravel a cada minuto)
crond -b -l 8

php-fpm -F &
php_pid=$!

wait "$php_pid"
