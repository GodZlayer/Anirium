<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$req = Request::create('/', 'GET');
$res = $kernel->handle($req);
echo 'STATUS: '.$res->getStatusCode().PHP_EOL;
echo 'CONTENT LEN: '.strlen($res->getContent()).PHP_EOL;
echo substr($res->getContent(), 0, 500).PHP_EOL;
