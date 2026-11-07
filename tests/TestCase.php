<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication(): Application
    {
        $app = parent::createApplication();
        $connection = $app['config']->get('database.default');
        if ($connection !== 'sqlite' || $app['config']->get('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Tests require an isolated in-memory database');
        }
        $app['config']->set('catalog.pipeline_lock_path', $app->storagePath('framework/testing/catalog-pipeline-'.getmypid().'.lock'));

        return $app;
    }
}
