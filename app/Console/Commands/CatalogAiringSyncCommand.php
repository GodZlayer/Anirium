<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

class CatalogAiringSyncCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'catalog:sync-airing';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sincroniza grade de exibição e episódios em tempo real via AniList GraphQL';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('Iniciando sincronização da grade e episódios com AniList GraphQL...');

        $script = base_path('scripts/sync_airing_anilist.py');
        $result = Process::path(base_path())
            ->timeout(600)
            ->run(['python', $script], function (string $type, string $output) {
                $this->output->write($output);
            });

        if ($result->successful()) {
            $this->info('Sincronização concluída com sucesso.');

            return Command::SUCCESS;
        }

        $this->error('Erro ao executar sincronização de grade.');

        return Command::FAILURE;
    }
}
