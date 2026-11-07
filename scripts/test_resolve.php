<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$id = '59eff475-b7a0-4657-bf8f-c367fb1c3f8c';

// Test step 1: external identities
$s = microtime(true);
$ext = \Illuminate\Support\Facades\DB::table('catalog_external_identities')->where('external_id', $id)->value('entity_id');
echo "1. external_identities: " . round((microtime(true) - $s) * 1000, 2) . "ms\n";

// Test step 2: exists
$s = microtime(true);
$exists = \Illuminate\Support\Facades\DB::table('catalog_works')->where('id', $id)->exists();
echo "2. exists in catalog_works: " . round((microtime(true) - $s) * 1000, 2) . "ms\n";

// Test step 3: like %id%
$s = microtime(true);
$like = \Illuminate\Support\Facades\DB::table('catalog_works')->where('id', 'like', "%{$id}%")->value('id');
echo "3. like in catalog_works: " . round((microtime(true) - $s) * 1000, 2) . "ms\n";
