#!/bin/sh
set -eu

install -d -o www-data -g www-data -m 775 \
    /var/www/html/storage/framework/cache/rate-limit \
    /var/www/html/storage/framework/cache/rate-limit-locks \
    /var/www/html/storage/logs

cron_file=/etc/crontabs/root
cron_job="* * * * * su -s /bin/sh www-data -c 'cd /var/www/html && /usr/local/bin/php artisan schedule:run >> /dev/null 2>> /var/www/html/storage/logs/scheduler.log'"
printf '%s\n' "$cron_job" > "$cron_file"
chmod 600 "$cron_file"

if [ "${1:-}" = '--install-cron' ]; then
    exit 0
fi

exec sh /var/www/html/docker/supervise-app.sh
