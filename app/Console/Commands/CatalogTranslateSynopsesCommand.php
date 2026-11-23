<?php

namespace App\Console\Commands;

use App\Support\LocaleResolver;
use App\Support\SynopsisTranslator;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class CatalogTranslateSynopsesCommand extends Command
{
    protected $signature = 'catalog:translate-synopses
                            {--locales=pt-BR,es-ES,ja-JP,zh-CN,ru-RU,it-IT,fr-FR,de-DE,hi-IN : Locales destino separados por vírgula}
                            {--limit=0 : Quantidade máxima de traduções por execução (0 = ilimitado)}
                            {--sleep-ms=0 : Pausa entre requisições em milissegundos}';

    protected $description = 'Pré-traduz sinopses em inglês da tabela catalog_translations para todos os idiomas suportados';

    public function handle(LocaleResolver $locales, SynopsisTranslator $translator): int
    {
        try {
            DB::connection()->getPdo()->exec('PRAGMA busy_timeout = 10000;');
        } catch (\Throwable) {
        }

        $targetLocales = collect(explode(',', (string) $this->option('locales')))
            ->map(fn (string $item): ?string => $locales->normalize($item))
            ->filter(fn (?string $loc): bool => $loc !== null && $loc !== 'en-US')
            ->unique()
            ->values()
            ->all();

        if ($targetLocales === []) {
            $this->warn('Nenhum locale destino válido informado.');

            return self::INVALID;
        }

        $limit = max(0, (int) $this->option('limit'));
        $sleepMs = max(0, (int) $this->option('sleep-ms'));
        $batchSize = $limit > 0 ? min(100, $limit) : 100;

        $totalTranslated = 0;
        $totalFailures = 0;
        $rateLimitWaitSeconds = 5;
        /** @var array<string, array<string, true>> */
        $skippedThisRun = [];
        /** @var array<string, bool> */
        $completedLocales = [];

        $this->info('Iniciando tradução contínua de sinopses para: '.implode(', ', $targetLocales));

        while (count($completedLocales) < count($targetLocales)) {
            $madeProgressInPass = false;

            foreach ($targetLocales as $targetLocale) {
                if (isset($completedLocales[$targetLocale])) {
                    continue;
                }

                if ($limit > 0 && $totalTranslated >= $limit) {
                    break 2;
                }

                $rows = $this->fetchPendingRows($targetLocale, $batchSize, $skippedThisRun[$targetLocale] ?? []);
                if ($rows === []) {
                    $completedLocales[$targetLocale] = true;
                    $this->info("[{$targetLocale}] Concluído: nenhuma sinopse pendente.");

                    continue;
                }

                $madeProgressInPass = true;

                foreach ($rows as $row) {
                    if ($limit > 0 && $totalTranslated >= $limit) {
                        break 3;
                    }

                    $entityId = (string) $row->entity_id;
                    $sourceEn = (string) $row->value;

                    try {
                        $result = $translator->translateAndStore($entityId, $sourceEn, $targetLocale);
                    } catch (QueryException $e) {
                        $totalFailures++;
                        $this->warn("[{$targetLocale}] Erro SQLite em {$entityId}: {$e->getMessage()}");
                        usleep(500_000);

                        continue;
                    } catch (\Throwable $e) {
                        $skippedThisRun[$targetLocale][$entityId] = true;
                        $totalFailures++;
                        $this->warn("[{$targetLocale}] Erro inesperado em {$entityId}: {$e->getMessage()}");

                        continue;
                    }

                    if ($translator->consumeRateLimitFlag()) {
                        $totalFailures++;
                        $this->warn("[{$targetLocale}] HTTP 429 recebido. Aguardando {$rateLimitWaitSeconds}s antes de retomar...");
                        sleep($rateLimitWaitSeconds);
                        $rateLimitWaitSeconds = min(60, $rateLimitWaitSeconds * 2);

                        break;
                    }

                    if ($result === null) {
                        $skippedThisRun[$targetLocale][$entityId] = true;
                        $totalFailures++;

                        continue;
                    }

                    $rateLimitWaitSeconds = 5;
                    $totalTranslated++;

                    if ($totalTranslated % 100 === 0) {
                        $this->line("Progresso: {$totalTranslated} sinopses traduzidas ({$totalFailures} falhas). Última: [{$targetLocale}] {$entityId}");
                    }

                    if ($sleepMs > 0) {
                        usleep($sleepMs * 1000);
                    }
                }
            }

            if (! $madeProgressInPass) {
                break;
            }
        }

        $this->info("Finalizado. Traduzidas: {$totalTranslated} | Falhas/Ignoradas: {$totalFailures}");

        return self::SUCCESS;
    }

    /**
     * @param  array<string, true>  $excludedIds
     * @return list<object>
     */
    private function fetchPendingRows(string $targetLocale, int $limit, array $excludedIds): array
    {
        $filtered = [];
        $seen = $excludedIds;
        $queries = [
            "SELECT en.entity_id, en.value
             FROM catalog_works w
             JOIN catalog_translations en
               ON en.entity_id = w.id
              AND en.field = 'synopsis'
              AND en.locale = 'en'
             WHERE w.status = 'RELEASING'
               AND trim(en.value) != ''
               AND NOT EXISTS (
                   SELECT 1
                   FROM catalog_translations target
                   WHERE target.entity_id = en.entity_id
                     AND target.field = 'synopsis'
                     AND target.locale = ?
               )
             LIMIT ?",
            "SELECT en.entity_id, en.value
             FROM catalog_translations en
             WHERE en.entity_kind = 'work'
               AND en.field = 'synopsis'
               AND en.locale = 'en'
               AND trim(en.value) != ''
               AND NOT EXISTS (
                   SELECT 1
                   FROM catalog_translations target
                   WHERE target.entity_id = en.entity_id
                     AND target.field = 'synopsis'
                     AND target.locale = ?
               )
             LIMIT ?",
        ];

        foreach ($queries as $sql) {
            $remaining = $limit - count($filtered);
            if ($remaining <= 0) {
                break;
            }

            $fetchLimit = min(500, max($remaining + count($seen), 1));
            foreach (DB::select($sql, [$targetLocale, $fetchLimit]) as $row) {
                $id = (string) $row->entity_id;
                if (isset($seen[$id])) {
                    continue;
                }

                $seen[$id] = true;
                $filtered[] = $row;
                if (count($filtered) >= $limit) {
                    break;
                }
            }
        }

        return $filtered;
    }
}
