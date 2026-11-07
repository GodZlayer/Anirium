FROM php:8.4-fpm-alpine

# Dependências essenciais do sistema
RUN apk add --no-cache \
    git \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    sqlite-dev \
    oniguruma-dev \
    nodejs \
    npm

# Instalar extensões PHP do Laravel
RUN docker-php-ext-install pdo pdo_sqlite mbstring bcmath gd

# Copiar Composer oficial
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY docker/php-performance.ini /usr/local/etc/php/conf.d/anirium-performance.ini

# Configura o Scheduler nativo do Laravel dentro do container (a cada minuto)
RUN echo "* * * * * cd /var/www/html && /usr/local/bin/php artisan schedule:run >> /var/www/html/storage/logs/scheduler.log 2>&1" >> /etc/crontabs/root

EXPOSE 9000
COPY docker/start-app.sh /usr/local/bin/start-anirium
CMD ["sh", "/usr/local/bin/start-anirium"]
