#!/bin/sh
set -eu

php_pid=''
cleanup() {
    trap - EXIT INT TERM
    [ -z "$php_pid" ] || kill "$php_pid" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

php-fpm -F &
php_pid=$!

wait "$php_pid"
