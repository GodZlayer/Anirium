#!/bin/sh
set -eu

install -d -o www-data -g www-data -m 775 \
    /var/www/html/storage/framework/cache/rate-limit \
    /var/www/html/storage/framework/cache/rate-limit-locks

cron_file=/etc/crontabs/root
cron_job='* * * * * cd /var/www/html && /usr/local/bin/php artisan schedule:run >> /var/www/html/storage/logs/scheduler.log 2>&1'
if ! grep -Fq '/usr/local/bin/php artisan schedule:run' "$cron_file"; then
    printf '\n%s\n' "$cron_job" >> "$cron_file"
fi
crontab "$cron_file"

if [ "${1:-}" = '--install-cron' ]; then
    exit 0
fi

php artisan config:cache
php artisan route:cache

exec sh /var/www/html/docker/supervise-app.sh
