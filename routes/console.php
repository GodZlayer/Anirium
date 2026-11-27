<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Grade semanal de animes e eventuais adiamentos (1x/dia de madrugada)
Schedule::command('catalog:sync-airing')
    ->dailyAt('04:00')
    ->withoutOverlapping(30)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-airing-sync.log'));

// Coletor canônico completo: descobre novas obras e republica o índice SQLite (1x/semana no domingo)
Schedule::command('catalog:candidate auto')
    ->weeklyOn(0, '05:30')
    ->withoutOverlapping(180)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-candidate.log'));

// Curadoria canônica de Universos unindo Anime + Mangá + Novel (1x/semana no domingo após coleta)
Schedule::command('catalog:curate-universes')
    ->weeklyOn(0, '07:00')
    ->withoutOverlapping(60)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-curate-universes.log'));

// Força-tarefa contínua de enriquecimento de literatura (capítulos, volumes e capas) com checkpoint retomável
Schedule::command('catalog:enrich-literature --limit=2000')
    ->hourly()
    ->withoutOverlapping(55)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-literature-enrich.log'));

// Tradução autônoma contínua de sinopses pendentes (diário às 03:00)
Schedule::command('catalog:translate-synopses --limit=500')
    ->dailyAt('03:00')
    ->withoutOverlapping(60)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-translate-synopses.log'));

// Exporta base SQLite pública enxuta (.sqlite.gz) após sincronização diária da grade
Schedule::command('catalog:export-public-db')
    ->dailyAt('04:20')
    ->withoutOverlapping(30)
    ->runInBackground()
    ->sendOutputTo(storage_path('logs/catalog-export-public-db.log'));
