<?php

namespace App\Providers;

use App\Support\AtomicFileCache;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Cache::extend('atomic-file', function ($app, array $config) {
            $store = (new AtomicFileCache($app['files'], $config['path'], null, false))
                ->setLockDirectory($config['lock_path'] ?? null);

            return $app['cache']->repository($store, $config);
        });
    }
}
