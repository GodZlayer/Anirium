<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Console\Isolatable;

class SyncCatalogCommand extends Command implements Isolatable
{
    protected $signature = 'catalog:sync {--type=all : Compatibilidade com versões anteriores} {--pages=1 : Compatibilidade com versões anteriores}';

    protected $description = 'Sincroniza e publica pelo pipeline canônico de IDs';

    protected $isolated = true;

    protected $isolatedExitCode = Command::FAILURE;

    public function isolationLockExpiresAt(): \DateInterval
    {
        return new \DateInterval('PT2H');
    }

    public function handle(): int
    {
        // The canonical command owns the shared process lock and publication gate.
        return $this->call('catalog:candidate', ['action' => 'auto']);
    }
}
