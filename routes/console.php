<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Sincronizador contínuo de exibição e episódios reais via AniList (horários exatos & novos episódios)
Schedule::command('catalog:sync-airing')
    ->hourlyAt(10)
    ->withoutOverlapping(30)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-airing-sync.log'));

// Coletor canônico completo: coleta snapshots, descobre novas obras, valida e publica atomicamente
Schedule::command('catalog:candidate auto')
    ->dailyAt('07:25')
    ->withoutOverlapping(180)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-candidate.log'));
