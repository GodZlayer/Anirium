<?php

namespace App\Console\Commands;

use App\Console\Concerns\LocksCatalogPipeline;
use App\Support\CatalogActionBackfill;
use App\Support\CatalogDatabaseBackup;
use App\Support\CatalogEpisodeReferenceRepair;
use App\Support\CatalogIdentityActivation;
use App\Support\CatalogIdentityImportRun;
use App\Support\CatalogRegistryAdoption;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;

class ImportCatalogIdentities extends Command
{
    use LocksCatalogPipeline;

    protected $signature = 'catalog:identities {action : backup, export, import, activate, adopt-registry, backfill or status} {--input= : Private exported identity input} {--registry= : Archived registry snapshot to reconcile against completed SQL import} {--candidate= : Private SQLite identity candidate for initial activation}';

    protected $description = 'Back up, import and inspect the relational catalog identity graph';

    public function handle(): int
    {
        try {
            return $this->argument('action') === 'status' ? $this->status() : $this->withCatalogPipelineLock(fn () => $this->executeAction());
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }

    private function executeAction(): int
    {
        switch ($this->argument('action')) {
            case 'activate':
                $path = realpath((string) $this->option('candidate'));
                $root = realpath(storage_path('app/catalog'));
                if (! $path || ! $root || ! str_starts_with($path, $root.DIRECTORY_SEPARATOR)) {
                    throw new \DomainException('Candidate must be inside the private catalog directory');
                }
                $this->line(json_encode(app(CatalogIdentityActivation::class)->run($path), JSON_THROW_ON_ERROR));

                return self::SUCCESS;
            case 'adopt-registry':
                $this->line(json_encode(app(CatalogRegistryAdoption::class)->run((string) $this->option('registry')), JSON_THROW_ON_ERROR));

                return self::SUCCESS;
            case 'backfill':
                $this->line(json_encode(app(CatalogActionBackfill::class)->run(), JSON_THROW_ON_ERROR));

                return self::SUCCESS;
            case 'backup':
                $this->info(app(CatalogDatabaseBackup::class)->create());

                return self::SUCCESS;
            case 'export':
                $result = Process::path(base_path())->timeout(7200)->run(['node', base_path('scripts/export-catalog-identities.mjs')], fn (string $type, string $output) => $this->output->write($output));

                return $result->successful() ? self::SUCCESS : self::FAILURE;
            case 'import':
                $path = realpath((string) $this->option('input'));
                $root = realpath(storage_path('app/catalog/identity-inputs'));
                if (! $path || ! $root || ! str_starts_with($path, $root.DIRECTORY_SEPARATOR)) {
                    throw new \DomainException('Input must be inside the private identity-inputs directory');
                }
                $database = DB::connection();
                $checkpoint = storage_path('app/catalog/identity-checkpoints/'.hash('sha256', $database->getDriverName().'|'.$database->getDatabaseName().'|'.$path).'.json');
                $state = app(CatalogIdentityImportRun::class)->run($path, $checkpoint, function (string $phase, array $state): void {
                    $this->line(json_encode(['phase' => $phase, ...$state], JSON_THROW_ON_ERROR));
                });
                if (! $state['complete']) {
                    $this->line(json_encode($state, JSON_THROW_ON_ERROR));

                    return self::FAILURE;
                }
                $references = app(CatalogEpisodeReferenceRepair::class)->run();
                $this->line(json_encode(['phase' => 'episode-references-repaired', ...$references], JSON_THROW_ON_ERROR));
                $registry = app(CatalogRegistryAdoption::class)->forGeneration($state['generation']);
                $this->line(json_encode(['phase' => 'identities-imported', 'input' => $state, 'registry' => $registry], JSON_THROW_ON_ERROR));

                return self::SUCCESS;
            default:
                throw new \DomainException('Unknown identity operation');
        }
    }

    private function status(): int
    {
        $this->line('users: '.DB::table('users')->count());
        $this->table(['Entity', 'Count'], DB::table('catalog_entities')->selectRaw('kind, count(*) AS total')->groupBy('kind')->get()->map(fn (object $row) => [$row->kind, $row->total])->all());
        foreach (['user_entity_preferences', 'entity_discussions', 'user_interaction_events'] as $table) {
            $this->line($table.' without entity_id: '.DB::table($table)->whereNull('entity_id')->count());
        }

        return self::SUCCESS;
    }
}
