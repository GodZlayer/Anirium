<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$start = microtime(true);
$request = Illuminate\Http\Request::create('/api/catalog/graph/work/59eff475-b7a0-4657-bf8f-c367fb1c3f8c', 'GET', ['render' => 'blade']);
$response = $kernel->handle($request);
$elapsed = round((microtime(true) - $start) * 1000, 2);

echo "Status: " . $response->getStatusCode() . " | Time: " . $elapsed . "ms | Content-Length: " . strlen($response->getContent()) . "\n";
