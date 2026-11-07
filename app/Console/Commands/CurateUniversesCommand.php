<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CurateUniversesCommand extends Command
{
    protected $signature = 'catalog:curate-universes {--dry-run : Apenas simular sem persistir no banco}';

    protected $description = 'Executa a curadoria limpa e poderosa dos Universos Canônicos por grafo de relações';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $this->info('Iniciando curadoria de Universos Canônicos...');

        $pdo = DB::connection()->getPdo();

        // 1. Carregar obras válidas de Anime
        $this->line('1. Carregando animes oficiais...');
        $stmtWorks = $pdo->query("SELECT id, title, format, episode_count FROM catalog_works WHERE media='anime'");
        $works = [];
        while ($row = $stmtWorks->fetch(\PDO::FETCH_ASSOC)) {
            $works[$row['id']] = $row;
        }
        $validAnimeIds = array_keys($works);
        $validAnimeSet = array_flip($validAnimeIds);
        $this->info("Total de Animes oficiais carregados: " . count($works));

        // 2. Carregar relações canônicas
        $this->line('2. Carregando relações canônicas...');
        $canonicalRelations = [
            'sequel', 'prequel', 'parent', 'parent_story', 'full_story',
            'side_story', 'spin_off', 'alternative_version', 'alternative_setting', 'compilation', 'summary'
        ];
        $inClause = "'" . implode("','", $canonicalRelations) . "'";
        $stmtRel = $pdo->query("SELECT from_work_id, to_work_id FROM catalog_work_relations WHERE from_work_id IS NOT NULL AND to_work_id IS NOT NULL AND relation_type IN ($inClause)");

        $adj = [];
        $edgeCount = 0;
        while ($row = $stmtRel->fetch(\PDO::FETCH_ASSOC)) {
            $from = $row['from_work_id'];
            $to = $row['to_work_id'];
            if (isset($validAnimeSet[$from]) && isset($validAnimeSet[$to]) && $from !== $to) {
                $adj[$from][] = $to;
                $adj[$to][] = $from;
                $edgeCount++;
            }
        }
        $this->info("Relações canônicas ativas entre animes: {$edgeCount}");
        $this->info("Animes conectados a outros animes: " . count($adj));

        // 3. Agrupamento por Grafo (BFS)
        $this->line('3. Agrupando universos conexos...');
        $visited = [];
        $universes = [];

        foreach ($adj as $node => $neighbors) {
            if (isset($visited[$node])) {
                continue;
            }
            $cluster = [];
            $queue = [$node];
            $visited[$node] = true;

            while (!empty($queue)) {
                $curr = array_shift($queue);
                $cluster[] = $curr;
                if (isset($adj[$curr])) {
                    foreach ($adj[$curr] as $neighbor) {
                        if (!isset($visited[$neighbor])) {
                            $visited[$neighbor] = true;
                            $queue[] = $neighbor;
                        }
                    }
                }
            }

            if (count($cluster) >= 2) {
                $universes[] = $cluster;
            }
        }

        // Ordenar universos pelo número de obras
        usort($universes, fn($a, $b) => count($b) <=> count($a));
        $totalUniverses = count($universes);
        $totalClusteredWorks = array_sum(array_map('count', $universes));

        $this->info("Total de Universos Canônicos encontrados: {$totalUniverses}");
        $this->info("Total de Animes mapeados em Franquias: {$totalClusteredWorks}");

        if ($dryRun) {
            $this->warn('Modo --dry-run: Nenhuma alteração foi persistida no banco.');
            return self::SUCCESS;
        }

        // 4. Executar Limpeza e Inserção Atômica
        $this->line('4. Aplicando limpeza e reestruturação atômica...');

        $pdo->beginTransaction();
        try {
            // Desativar foreign keys temporariamente para truncar universos com velocidade
            $pdo->exec("PRAGMA foreign_keys = OFF");

            $this->line('   -> Limpando catalog_universe_works...');
            $pdo->exec("DELETE FROM catalog_universe_works");

            $this->line('   -> Limpando catalog_universes antigas...');
            $pdo->exec("DELETE FROM catalog_universes");

            $this->line('   -> Limpando entities órfãs do tipo universe...');
            $pdo->exec("DELETE FROM catalog_entities WHERE kind='universe'");

            $this->line('   -> Inserindo os universos canônicos consolidados...');
            $stmtInsertEntity = $pdo->prepare("INSERT INTO catalog_entities (id, kind, resolution_status, created_at, updated_at) VALUES (?, 'universe', 'verified', datetime('now'), datetime('now'))");
            $stmtInsertUniverse = $pdo->prepare("INSERT INTO catalog_universes (id) VALUES (?)");
            $stmtInsertTitle = $pdo->prepare("INSERT OR REPLACE INTO catalog_entity_titles (entity_id, locale, title) VALUES (?, 'pt', ?)");
            $stmtInsertWorkUniverse = $pdo->prepare("INSERT INTO catalog_universe_works (universe_id, work_id) VALUES (?, ?)");

            $bar = $this->output->createProgressBar($totalUniverses);
            $bar->start();

            foreach ($universes as $cluster) {
                // Obra âncora: o anime com maior episode_count
                $anchorWork = null;
                $maxEps = -1;
                foreach ($cluster as $wId) {
                    $workData = $works[$wId];
                    $eps = (int) ($workData['episode_count'] ?? 0);
                    if ($eps > $maxEps) {
                        $maxEps = $eps;
                        $anchorWork = $workData;
                    }
                }
                if (!$anchorWork) {
                    $anchorWork = $works[$cluster[0]];
                }

                $universeId = (string) Str::uuid();
                $universeTitle = $anchorWork['title'];

                // 1. Entidade e Universo
                $stmtInsertEntity->execute([$universeId]);
                $stmtInsertUniverse->execute([$universeId]);
                $stmtInsertTitle->execute([$universeId, $universeTitle]);

                // 2. Membros do Universo
                foreach ($cluster as $wId) {
                    $stmtInsertWorkUniverse->execute([$universeId, $wId]);
                }

                $bar->advance();
            }

            $bar->finish();
            $this->newLine();

            $pdo->exec("PRAGMA foreign_keys = ON");
            $pdo->commit();

            $this->info("Curadoria concluída com sucesso!");
            $this->info("Banco de dados agora possui {$totalUniverses} universos canônicos puros.");

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            $pdo->exec("PRAGMA foreign_keys = ON");
            $this->error("Erro durante a curadoria: " . $e->getMessage());
            return self::FAILURE;
        }
    }
}
