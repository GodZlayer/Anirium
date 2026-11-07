<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$req = Illuminate\Http\Request::create('/', 'GET');
$res = $kernel->handle($req);
echo "STATUS: " . $res->getStatusCode() . PHP_EOL;
echo "CONTENT LEN: " . strlen($res->getContent()) . PHP_EOL;
echo substr($res->getContent(), 0, 500) . PHP_EOL;
