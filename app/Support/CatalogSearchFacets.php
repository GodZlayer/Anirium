<?php

namespace App\Support;

use PDO;

class CatalogSearchFacets
{
    public static function read(PDO $db, array $where, array $parameters): array
    {
        $scope = implode(' AND ', $where);
        $query = $db->prepare("SELECT json_extract(works.summary, '$.format') AS format, json_extract(works.summary, '$.genres_json') AS genres FROM works WHERE ".$scope);
        $query->execute($parameters);
        $formats = $counts = [];
        while ($row = $query->fetch(PDO::FETCH_ASSOC)) {
            if (is_string($row['format']) && $row['format'] !== '') {
                $formats[$row['format']] = true;
            }
            $genres = json_decode($row['genres'] ?? '[]', true);
            foreach (is_array($genres) && array_is_list($genres) ? $genres : [] as $genre) {
                if (is_string($genre) && $genre !== '') {
                    $counts[$genre] = ($counts[$genre] ?? 0) + 1;
                }
            }
        }
        $formatValues = array_map('strval', array_keys($formats));
        sort($formatValues, SORT_STRING);
        $values = array_map('strval', array_keys($counts));
        usort($values, fn ($a, $b) => $counts[$b] <=> $counts[$a] ?: strcasecmp($a, $b));

        return ['formats' => array_slice($formatValues, 0, 128), 'genres' => array_slice($values, 0, 128), 'moreGenres' => count($values) > 128];
    }
}
