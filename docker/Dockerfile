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

EXPOSE 9000
CMD ["php-fpm"]
