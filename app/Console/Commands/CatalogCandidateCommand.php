<?php

namespace App\Console\Commands;

use App\Console\Concerns\LocksCatalogPipeline;
use Illuminate\Console\Command;
use Illuminate\Contracts\Console\Isolatable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

class CatalogCandidateCommand extends Command implements Isolatable
{
    use LocksCatalogPipeline;

    protected $signature = 'catalog:candidate {action : bootstrap, sync, auto, repair, audit, rollback ou status} {--output= : Diretório privado da candidata}';

    protected $description = 'Coleta e verifica a candidata; auto publica somente depois das verificações';

    protected $isolated = true;

    protected $isolatedExitCode = Command::FAILURE;

    public function isolationLockExpiresAt(): \DateInterval
    {
        return new \DateInterval('PT2H');
    }

    public function isolatableId(): string
    {
        return in_array($this->argument('action'), ['audit', 'status'], true) ? $this->argument('action') : 'write';
    }

    public function handle(): int
    {
        return in_array($this->argument('action'), ['audit', 'status'], true)
            ? $this->runAction() : $this->withCatalogPipelineLock(fn () => $this->runAction());
    }

    private function runAction(): int
    {
        if (! in_array($this->argument('action'), ['bootstrap', 'sync', 'auto', 'repair', 'audit', 'rollback', 'status'], true)) {
            $this->error('Ação inválida.');

            return self::FAILURE;
        }
        $heap = (int) config('catalog.heap_mb', 6144);
        if ($heap < 1024 || $heap > 16384) {
            $this->error('Orçamento de memória do catálogo inválido.');

            return self::FAILURE;
        }
        $command = ['node', '--max-old-space-size='.$heap, base_path('scripts/catalog-candidate.mjs'), $this->argument('action')];
        if ($this->option('output')) {
            $command[] = '--output='.$this->option('output');
        }
        try {
            if (DB::connection()->getDriverName() !== 'sqlite') {
                throw new \DomainException('O registro canônico do coletor exige SQLite nesta instalação.');
            }
            $result = Process::path(base_path())->env([
                'CATALOG_IDENTITY_DATABASE' => DB::connection()->getDatabaseName(),
                'CATALOG_HEAP_MB' => (string) $heap,
                'MAL_CLIENT_ID' => (string) config('services.myanimelist.client_id', ''),
                'MAL_DETAIL_BUDGET' => (string) config('services.myanimelist.detail_budget', 200),
                'EPISODE_DETAIL_BUDGET' => (string) config('services.catalog.episode_budget', 100),
                'MEDIAWIKI_WORK_BUDGET' => (string) config('services.catalog.arc_budget', 10),
            ])->timeout(7200)->run($command,
                fn (string $stream, string $output) => $this->output->write($output));

            return $result->successful() ? self::SUCCESS : self::FAILURE;
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}
