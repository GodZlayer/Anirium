<?php

namespace App\Support;

use Illuminate\Support\Str;
use PDO;

class CatalogSearch
{
    public function __construct(private ?string $manifestFile = null, private ?string $indexDirectory = null) {}

    private function connection(): array
    {
        $manifestFile = $this->manifestFile ?? config('catalog.manifest');
        if (! is_file($manifestFile)) {
            throw new CatalogUnavailable('Catalog generation unavailable');
        }
        $manifest = json_decode(file_get_contents($manifestFile), true, flags: JSON_THROW_ON_ERROR);
        $generation = $manifest['generation'] ?? '';
        if (($manifest['schema'] ?? null) !== 2 || ! preg_match('/^[a-f0-9-]{36}$/D', $generation)
            || ($manifest['search']['generation'] ?? null) !== $generation) {
            throw new CatalogUnavailable('Catalog search index unavailable');
        }
        $index = ($this->indexDirectory ?? config('catalog.indexes')).DIRECTORY_SEPARATOR.$generation.'.sqlite';
        if (! is_file($index)) {
            throw new CatalogUnavailable('Catalog search index unavailable');
        }
        $db = new PDO('sqlite:'.$index, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('PRAGMA query_only=ON; PRAGMA cache_size=-65536');

        return [$db, $generation, $manifest['search']['schema'] ?? 1];
    }

    public function resolve(string $reference, bool $adult): ?array
    {
        [$db, $generation, $schema] = $this->connection();
        if ($schema < 2) {
            throw new CatalogUnavailable('Catalog lookup index unavailable');
        }
        $uuid = Str::isUuid($reference) ? strtolower($reference)
            : (str_starts_with($reference, 'work:') && Str::isUuid(substr($reference, 5)) ? strtolower(substr($reference, 5)) : null);
        if ($uuid !== null) {
            $query = $db->prepare('SELECT work_id, partition_url FROM works WHERE work_id=?'.($adult ? '' : ' AND adult=0'));
            $query->execute([$uuid]);
            $work = $query->fetch(PDO::FETCH_ASSOC);

            return $work ? ['generation' => $generation, 'work_id' => $work['work_id'], 'url' => $work['partition_url']] : null;
        }
        if (preg_match('/^[1-9]\d*$/D', $reference)) {
            $reference = 'anime:'.$reference;
        }
        if (! preg_match('/^(?:(?:anime|manga|novel):[1-9]\d*|work:[a-f0-9-]{36})$/D', $reference)) {
            return null;
        }
        $query = $db->prepare('SELECT works.work_id, works.partition_url FROM aliases JOIN works USING(work_id) WHERE aliases.reference=?'.($adult ? '' : ' AND works.adult=0'));
        $query->execute([$reference]);
        $work = $query->fetch(PDO::FETCH_ASSOC);

        return $work ? ['generation' => $generation, 'work_id' => $work['work_id'], 'url' => $work['partition_url']] : null;
    }

    public function summaries(array $references, bool $adult): array
    {
        [$db, $generation, $schema] = $this->connection();
        if ($schema < 2) {
            throw new CatalogUnavailable('Catalog lookup index unavailable');
        }
        $resolved = [];
        foreach (array_chunk(array_values(array_unique($references)), 250) as $chunk) {
            $slots = implode(',', array_fill(0, count($chunk), '?'));
            $query = $db->prepare('SELECT aliases.reference, works.work_id, works.summary FROM aliases JOIN works USING(work_id) WHERE aliases.reference IN ('.$slots.')'.($adult ? '' : ' AND works.adult=0'));
            $query->execute($chunk);
            foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $resolved[$row['reference']] = ['work_id' => $row['work_id'], 'summary' => json_decode($row['summary'], true, flags: JSON_THROW_ON_ERROR)];
            }
        }

        return ['generation' => $generation, 'resolved' => $resolved];
    }

    public function aliases(string $reference, bool $adult, bool $animeOnly = false): array
    {
        [$db] = $this->connection();
        $query = $db->prepare('SELECT related.reference FROM aliases requested JOIN works ON works.work_id=requested.work_id JOIN aliases related ON related.work_id=works.work_id WHERE requested.reference=?'
            .($adult ? '' : ' AND works.adult=0').($animeOnly ? " AND works.media='anime'" : ''));
        $query->execute([$reference]);

        return $query->fetchAll(PDO::FETCH_COLUMN);
    }

    public function feed(string $view, int $page, bool $adult): array
    {
        [$db, $generation] = $this->connection();
        if ($view === 'home') {
            return app(CatalogEpisodeFeed::class)->read($this, $generation, $adult);
        }
        $where = "coalesce(json_extract(summary, '$.catalog_visibility'), 'visible')='visible' AND works.media='anime' AND json_extract(summary, '$.status')='RELEASING' AND (works.year IS NULL OR works.year<=CAST(strftime('%Y','now') AS INTEGER)) AND (json_extract(summary, '$.start_date') IS NULL OR json_extract(summary, '$.start_date')<=date('now'))";
        if (! $adult) {
            $where .= ' AND works.adult=0';
        }
        if ($view === 'calendar') {
            $where .= " AND json_extract(summary, '$.airing_timezone') IS NOT NULL AND (json_extract(summary, '$.airing_day') IS NOT NULL OR json_extract(summary, '$.release.air_date_utc') IS NOT NULL)";
        }
        $limit = $view === 'home' ? 3 : 100;
        $total = (int) $db->query('SELECT count(*) FROM works WHERE '.$where)->fetchColumn();
        $order = "coalesce(json_extract(summary, '$.latest_episode_at'), json_extract(summary, '$.start_date')) DESC, works.year DESC, works.score DESC, works.work_id";
        $items = $db->query('SELECT summary FROM works WHERE '.$where.' ORDER BY '.$order.' LIMIT '.$limit.' OFFSET '.(($page - 1) * $limit))->fetchAll(PDO::FETCH_COLUMN);

        return ['generation' => $generation, 'items' => array_map(fn ($json) => json_decode($json, true, flags: JSON_THROW_ON_ERROR), $items),
            'pages' => (int) ceil($total / $limit), 'total' => $total];
    }

    public function search(string $query, string $media, int $page, bool $adult, ?string $universe = null, array $filters = []): array
    {
        [$db, $generation] = $this->connection();
        preg_match_all('/[\pL\pN]+/u', $query, $matches);
        $tokens = array_slice($matches[0], 0, 8);
        $where = ["coalesce(json_extract(summary, '$.catalog_visibility'), 'visible')='visible'"];
        if (! $adult) {
            $where[] = 'works.adult=0';
        }
        $parameters = [];
        if ($universe !== null) {
            $where[] = "json_extract(works.summary, '$.universe_v2_id')=:universe";
            $parameters['universe'] = $universe;
        }
        if ($media !== 'all') {
            $where[] = 'works.media=:media';
            $parameters['media'] = $media;
        }
        $facetWhere = $where;
        $facetParameters = $parameters;
        CatalogSearchFilters::apply($filters, $where, $parameters);
        $from = 'works';
        if ($tokens) {
            $from .= ' JOIN search ON search.work_id=works.work_id';
            $where[] = 'search MATCH :query';
            $parameters['query'] = implode(' AND ', array_map(fn ($token) => '"'.$token.'"*', $tokens));
        }
        $sql = ' FROM '.$from.' WHERE '.implode(' AND ', $where);
        $count = $db->prepare('SELECT count(*)'.$sql);
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();
        $order = CatalogSearchFilters::order($filters['sort'] ?? null, (bool) $tokens);
        $select = $db->prepare('SELECT works.summary'.$sql.' ORDER BY '.$order.' LIMIT 12 OFFSET '.(($page - 1) * 12));
        $select->execute($parameters);

        return ['generation' => $generation, 'items' => array_map(fn ($json) => json_decode($json, true, flags: JSON_THROW_ON_ERROR), $select->fetchAll(PDO::FETCH_COLUMN)),
            'page' => $page, 'pages' => (int) ceil($total / 12), 'total' => $total,
            ...(! empty($filters['facets']) ? ['facets' => CatalogSearchFacets::read($db, $facetWhere, $facetParameters)] : [])];
    }
}
