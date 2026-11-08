#!/bin/sh
set -eu

install -d -o www-data -g www-data -m 775 \
    /var/www/html/storage/framework/cache/rate-limit \
    /var/www/html/storage/framework/cache/rate-limit-locks

# Cron scheduler desativado no ambiente atual para prevenir locks concorrentes no SQLite
echo "" > /etc/crontabs/root

if [ "${1:-}" = '--install-cron' ]; then
    exit 0
fi

exec sh /var/www/html/docker/supervise-app.sh
