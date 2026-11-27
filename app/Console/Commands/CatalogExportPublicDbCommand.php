<?php

namespace App\Console\Commands;

use App\Support\CatalogRevisionRecorder;
use Illuminate\Console\Command;
use PDO;

class CatalogExportPublicDbCommand extends Command
{
    protected $signature = 'catalog:export-public-db
                            {--output= : Caminho destino do arquivo .sqlite.gz (padrão: public/data/catalog-public.sqlite.gz)}';

    protected $description = 'Exporta uma base SQLite pública enxuta e comprimida (gzip) sem dados privados para SQLite WASM no navegador';

    public function handle(CatalogRevisionRecorder $recorder): int
    {
        $sourcePath = (string) config('database.connections.sqlite.database');
        if (! is_file($sourcePath)) {
            $this->error("Banco SQLite origem não encontrado: {$sourcePath}");

            return self::FAILURE;
        }

        $targetGz = (string) ($this->option('output') ?: public_path('data/catalog-public.sqlite.gz'));
        $targetDir = dirname($targetGz);
        if (! is_dir($targetDir)) {
            mkdir($targetDir, 0775, true);
        }

        $tmpSqlite = $targetDir.DIRECTORY_SEPARATOR.'catalog-public.sqlite.tmp';
        $tmpGz = $targetGz.'.tmp';
        @unlink($tmpSqlite);
        @unlink($tmpGz);

        $startedAt = microtime(true);
        $this->info('Exportando base SQLite pública enxuta (via ATTACH nativo)...');

        $pdo = new PDO('sqlite:'.$tmpSqlite, options: [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdo->exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;');

        $pdo->exec(<<<'SQL'
CREATE TABLE works (
    id TEXT PRIMARY KEY,
    media TEXT NOT NULL,
    title TEXT NOT NULL,
    format TEXT,
    status TEXT,
    episode_count INTEGER,
    is_adult INTEGER NOT NULL DEFAULT 0,
    image_url TEXT
);

CREATE TABLE schedules (
    work_id TEXT PRIMARY KEY,
    airing_day TEXT NOT NULL,
    airing_time TEXT,
    latest_episode_num INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE titles (
    entity_id TEXT NOT NULL,
    title TEXT NOT NULL
);

CREATE TABLE universes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL
);

CREATE TABLE search_tokens (
    token TEXT NOT NULL,
    work_id TEXT NOT NULL
);

CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
SQL);

        $quotedSrc = $pdo->quote($sourcePath);
        $pdo->exec("ATTACH DATABASE {$quotedSrc} AS src;");

        $pdo->exec(<<<'SQL'
INSERT INTO works (id, media, title, format, status, episode_count, is_adult, image_url)
SELECT
    w.id,
    COALESCE(w.media, 'anime'),
    COALESCE(w.title, ''),
    w.format,
    w.status,
    w.episode_count,
    COALESCE(w.is_adult, 0),
    a.image_url
FROM src.catalog_works w
LEFT JOIN src.catalog_work_assets a ON a.work_id = w.id;
SQL);

        $pdo->exec(<<<'SQL'
INSERT INTO schedules (work_id, airing_day, airing_time, latest_episode_num)
SELECT
    s.work_id,
    LOWER(TRIM(s.airing_day)),
    s.airing_time,
    COALESCE(s.latest_episode_num, 1)
FROM src.catalog_work_schedules s
INNER JOIN src.catalog_works w ON w.id = s.work_id
WHERE s.airing_day IS NOT NULL
  AND s.airing_day != ''
  AND UPPER(COALESCE(w.status, '')) IN ('RELEASING', 'PUBLISHING', 'CURRENT')
  AND (w.media = 'anime' OR (s.airing_time IS NOT NULL AND s.airing_time != '00:00'));
SQL);

        $pdo->exec(<<<'SQL'
INSERT INTO titles (entity_id, title)
SELECT DISTINCT t.entity_id, TRIM(t.title)
FROM src.catalog_entity_titles t
INNER JOIN works w ON w.id = t.entity_id
WHERE t.title IS NOT NULL AND TRIM(t.title) != '';
SQL);

        $pdo->exec(<<<'SQL'
INSERT INTO universes (id, title)
SELECT u.id, MIN(TRIM(t.title))
FROM src.catalog_universes u
INNER JOIN src.catalog_entity_titles t ON t.entity_id = u.id
WHERE t.title IS NOT NULL AND TRIM(t.title) != ''
GROUP BY u.id;
SQL);

        $pdo->exec('DETACH DATABASE src;');
        $pdo->exec('CREATE INDEX idx_titles_entity ON titles (entity_id);');

        $this->info('Populando índice invertido B-Tree (search_tokens) para busca < 15ms no sql.js...');
        $pdo->exec('BEGIN TRANSACTION;');
        $insTok = $pdo->prepare('INSERT INTO search_tokens (token, work_id) VALUES (?, ?)');
        $stmtWorks = $pdo->query("SELECT w.id, w.title, (SELECT GROUP_CONCAT(t.title, ' ') FROM titles t WHERE t.entity_id = w.id) AS extra FROM works w WHERE (w.image_url IS NOT NULL AND w.image_url != '') OR (w.media IN ('manga', 'novel') AND UPPER(COALESCE(w.format, '')) NOT IN ('DOUJINSHI', 'OTHER'))");
        while ($row = $stmtWorks->fetch(PDO::FETCH_ASSOC)) {
            $raw = trim(($row['title'] ?? '').' '.($row['extra'] ?? ''));
            if ($raw === '') {
                continue;
            }
            $norm = mb_strtolower($raw, 'UTF-8');
            if (function_exists('iconv')) {
                $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $norm);
                if (is_string($ascii) && $ascii !== '') {
                    $norm .= ' '.strtolower($ascii);
                }
            }
            preg_match_all('/[\p{L}\p{N}]{2,}/u', $norm, $m);
            if (empty($m[0])) {
                continue;
            }
            $seen = [];
            foreach ($m[0] as $tok) {
                if (isset($seen[$tok])) {
                    continue;
                }
                $seen[$tok] = true;
                $insTok->execute([$tok, $row['id']]);
            }
        }
        $pdo->exec('COMMIT;');
        $pdo->exec('CREATE INDEX idx_search_tokens ON search_tokens (token, work_id);');

        $revision = $recorder->currentRevision();
        $stmtMeta = $pdo->prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
        $stmtMeta->execute(['revision', (string) $revision]);
        $stmtMeta->execute(['generated_at', gmdate('c')]);

        // Pré-calcula totais exatos para contagem instantânea (0ms) no Explorar sem pesquisa
        $countQueries = [
            'count:work:0' => "SELECT COUNT(*) FROM works WHERE media = 'anime' AND is_adult = 0 AND image_url IS NOT NULL AND image_url != ''",
            'count:work:1' => "SELECT COUNT(*) FROM works WHERE media = 'anime' AND image_url IS NOT NULL AND image_url != ''",
            'count:manga:0' => "SELECT COUNT(*) FROM works WHERE media IN ('manga', 'novel') AND is_adult = 0 AND UPPER(COALESCE(format, '')) NOT IN ('DOUJINSHI', 'OTHER')",
            'count:manga:1' => "SELECT COUNT(*) FROM works WHERE media IN ('manga', 'novel') AND UPPER(COALESCE(format, '')) NOT IN ('DOUJINSHI', 'OTHER')",
        ];
        foreach ($countQueries as $k => $qSql) {
            $stmtMeta->execute([$k, (string) $pdo->query($qSql)->fetchColumn()]);
        }

        $this->info('Criando índices otimizados e compactando (VACUUM)...');
        $pdo->exec(<<<'SQL'
CREATE INDEX idx_works_media_adult_title ON works (media, is_adult, title);
CREATE INDEX idx_works_status ON works (status);
CREATE INDEX idx_schedules_day_time ON schedules (airing_day, airing_time);
CREATE INDEX idx_titles_title ON titles (title COLLATE NOCASE);
VACUUM;
SQL);

        $worksCount = (int) $pdo->query('SELECT COUNT(*) FROM works')->fetchColumn();
        $schedCount = (int) $pdo->query('SELECT COUNT(*) FROM schedules')->fetchColumn();
        $titlesCount = (int) $pdo->query('SELECT COUNT(*) FROM titles')->fetchColumn();
        $pdo = null;

        $rawBytes = filesize($tmpSqlite) ?: 0;

        $in = fopen($tmpSqlite, 'rb');
        $out = gzopen($tmpGz, 'wb9');
        if (! $in || ! $out) {
            $this->error('Falha ao comprimir catalog-public.sqlite.');

            return self::FAILURE;
        }
        while (! feof($in)) {
            $chunk = fread($in, 1024 * 1024);
            if ($chunk !== false && $chunk !== '') {
                gzwrite($out, $chunk);
            }
        }
        fclose($in);
        gzclose($out);
        @unlink($tmpSqlite);

        rename($tmpGz, $targetGz);
        $gzBytes = filesize($targetGz) ?: 0;
        $elapsed = microtime(true) - $startedAt;

        $this->info(sprintf(
            'Exportado com sucesso em %.2fs: %d works, %d schedules, %d titles | raw=%.2f MB -> gz=%.2f MB (%s)',
            $elapsed,
            $worksCount,
            $schedCount,
            $titlesCount,
            $rawBytes / 1048576,
            $gzBytes / 1048576,
            $targetGz
        ));

        return self::SUCCESS;
    }
}
