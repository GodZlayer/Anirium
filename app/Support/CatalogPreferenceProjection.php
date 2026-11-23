<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CatalogPreferenceProjection
{
    public function apply(Collection $preferences): Collection
    {
        $resolveUuid = static function (object $row): string {
            $raw = (string) ($row->entity_id ?: ($row->target_id ?? ''));
            $prefix = ($row->target_type ?? '').':';
            if ($prefix !== ':' && str_starts_with($raw, $prefix)) {
                return substr($raw, strlen($prefix));
            }

            return $raw;
        };

        $episodeIds = $preferences
            ->where('target_type', 'episode')
            ->map($resolveUuid)
            ->filter()
            ->unique();

        $episodes = collect();
        foreach ($episodeIds->chunk(250) as $ids) {
            $episodes = $episodes->union(
                DB::table('catalog_episodes')->whereIn('id', $ids)->get(['id', 'work_id', 'number'])->keyBy('id')
            );
        }

        $workIds = $preferences
            ->where('target_type', 'work')
            ->map($resolveUuid)
            ->merge($episodes->pluck('work_id'))
            ->filter()
            ->unique();

        $works = collect();
        $workAssets = collect();
        foreach ($workIds->chunk(250) as $ids) {
            $works = $works->union(
                DB::table('catalog_works')->whereIn('id', $ids)->get(['id', 'title', 'format', 'media'])->keyBy('id')
            );
            $workAssets = $workAssets->union(
                DB::table('catalog_work_assets')->whereIn('work_id', $ids)->whereNotNull('image_url')->pluck('image_url', 'work_id')
            );
        }

        $arcIds = $preferences->where('target_type', 'arc')->map($resolveUuid)->filter()->unique();
        $arcs = collect();
        foreach ($arcIds->chunk(250) as $ids) {
            $arcs = $arcs->union(DB::table('catalog_arcs')->whereIn('id', $ids)->get(['id', 'title'])->keyBy('id'));
        }

        $universeIds = $preferences->where('target_type', 'universe')->map($resolveUuid)->filter()->unique();
        $universes = collect();
        foreach ($universeIds->chunk(250) as $ids) {
            $universes = $universes->union(DB::table('catalog_universes')->whereIn('id', $ids)->get(['id', 'name'])->keyBy('id'));
        }

        return $preferences->map(function (object $preference) use ($resolveUuid, $episodes, $works, $workAssets, $arcs, $universes): object {
            $row = clone $preference;
            $resolvedId = $resolveUuid($row);
            $type = (string) ($row->target_type ?? '');

            if ($type === 'episode') {
                $episode = $episodes->get($resolvedId);
                if ($episode) {
                    $row->work_id = $episode->work_id;
                    $row->episode_number = $episode->number;
                    $work = $works->get($episode->work_id);
                    if ($work) {
                        $row->work_title = $work->title;
                        $row->title = "{$work->title} — Episódio {$episode->number}";
                        $row->image = $workAssets->get($work->id);
                        $row->format = $work->format;
                    }
                }
            } elseif ($type === 'work') {
                $work = $works->get($resolvedId);
                if ($work) {
                    $row->work_id = $work->id;
                    $row->work_title = $work->title;
                    $row->title = $work->title;
                    $row->image = $workAssets->get($work->id);
                    $row->format = $work->format;
                }
            } elseif ($type === 'arc') {
                $arc = $arcs->get($resolvedId);
                if ($arc) {
                    $row->title = $arc->title;
                }
            } elseif ($type === 'universe') {
                $universe = $universes->get($resolvedId);
                if ($universe) {
                    $row->universe_id = $universe->id;
                    $row->universe_name = $universe->name;
                    $row->title = $universe->name;
                }
            }

            return $row;
        });
    }
}
