<?php

namespace App\Support;

class CatalogSearchFilters
{
    public static function apply(array $filters, array &$where, array &$parameters): void
    {
        $statuses = [
            'releasing' => "'RELEASING','AIRING','CURRENT','CURRENTLY_AIRING'",
            'upcoming' => "'NOT_YET_RELEASED','NOT_YET_AIRED','UPCOMING'",
            'finished' => "'COMPLETED','FINISHED','FINISHED_AIRING'",
        ];
        if (isset($statuses[$filters['status'] ?? ''])) {
            $where[] = "upper(json_extract(works.summary, '$.status')) IN (".$statuses[$filters['status']].')';
        }
        if (! empty($filters['format']) && $filters['format'] !== 'all') {
            $where[] = "upper(json_extract(works.summary, '$.format'))=:filter_format";
            $parameters['filter_format'] = strtoupper($filters['format']);
        }
        if (! empty($filters['genre']) && $filters['genre'] !== 'all') {
            $where[] = 'EXISTS (SELECT 1 FROM json_each('.self::genres().") g WHERE g.type='text' AND g.value=:filter_genre COLLATE NOCASE)";
            $parameters['filter_genre'] = $filters['genre'];
        }
    }

    public static function genres(): string
    {
        return "CASE WHEN json_valid(json_extract(works.summary, '$.genres_json')) THEN json_extract(works.summary, '$.genres_json') ELSE '[]' END";
    }

    public static function order(?string $sort, bool $searching): string
    {
        return match ($sort) {
            'title' => "json_extract(works.summary, '$.title') COLLATE NOCASE, works.work_id",
            'year' => 'works.year DESC, works.score DESC, works.work_id',
            'score' => 'works.score DESC, works.work_id',
            'popularity' => "CASE WHEN CAST(json_extract(works.summary, '$.popularity') AS REAL)>0 THEN CAST(json_extract(works.summary, '$.popularity') AS REAL) ELSE NULL END ASC NULLS LAST, works.score DESC, works.work_id",
            default => ($searching ? 'bm25(search), ' : '').'works.score DESC, works.work_id',
        };
    }
}
