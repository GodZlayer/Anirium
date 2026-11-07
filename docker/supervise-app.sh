#!/bin/sh
set -eu

cron_pid=''
php_pid=''
cleanup() {
    trap - EXIT INT TERM
    [ -z "$cron_pid" ] || kill "$cron_pid" 2>/dev/null || true
    [ -z "$php_pid" ] || kill "$php_pid" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

crond -f -l 8 &
cron_pid=$!
php-fpm -F &
php_pid=$!

while kill -0 "$php_pid" 2>/dev/null; do
    if ! kill -0 "$cron_pid" 2>/dev/null; then
        wait "$cron_pid" 2>/dev/null || true
        printf '%s\n' 'Scheduler exited; restarting cron.' >&2
        crond -f -l 8 &
        cron_pid=$!
    fi
    sleep 2
done
wait "$php_pid"
