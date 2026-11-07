<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// One scheduled writer: collect, validate, then atomically publish.
Schedule::command('catalog:candidate auto')->everyTwoHours()->withoutOverlapping(130)
    ->sendOutputTo(storage_path('logs/catalog-candidate.log'));
