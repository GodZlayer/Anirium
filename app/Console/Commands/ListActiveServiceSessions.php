<?php

namespace App\Console\Commands;

use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ListActiveServiceSessions extends Command
{
    protected $signature = 'anirium:sessions
        {--all : Mostrar todas as sessões registradas, incluindo expiradas}
        {--ttl=90 : Janela em segundos para considerar uma sessão ativa}
        {--json : Saída em formato JSON}';

    protected $description = 'Lista usuários conectados no anirium-service, episódios em reprodução e diagnósticos';

    public function handle(): int
    {
        $includeAll = (bool) $this->option('all');
        $ttl = max(10, (int) $this->option('ttl'));

        $query = DB::table('active_service_sessions as s')
            ->leftJoin('users as u', 'u.id', '=', 's.user_id')
            ->select(['s.*', 'u.name as user_name', 'u.email as user_email'])
            ->orderByDesc('s.last_seen_at');

        if (! $includeAll) {
            $query->where('s.last_seen_at', '>=', now()->subSeconds($ttl));
        }

        $rows = $query->limit(200)->get();

        $workIds = $rows->pluck('work_id')->filter()->unique()->values()->all();
        $titlesByWorkId = [];
        if (! empty($workIds)) {
            $titleRows = DB::table('catalog_entity_titles')
                ->whereIn('entity_id', $workIds)
                ->get(['entity_id', 'locale', 'title']);

            foreach ($titleRows as $titleRow) {
                $eid = (string) $titleRow->entity_id;
                if (! isset($titlesByWorkId[$eid]) || $titleRow->locale === 'en') {
                    $titlesByWorkId[$eid] = $titleRow->title;
                }
            }
        }

        if ($this->option('json')) {
            $payload = $rows->map(function ($row) use ($titlesByWorkId) {
                return [
                    'user' => $row->user_name,
                    'email' => $row->user_email,
                    'device_id' => $row->device_id,
                    'status' => $row->status,
                    'work_id' => $row->work_id,
                    'work_title' => $row->work_id ? ($titlesByWorkId[$row->work_id] ?? null) : null,
                    'episode_number' => $row->episode_number,
                    'position_seconds' => (int) $row->position_seconds,
                    'diagnostics' => is_string($row->diagnostics) ? json_decode($row->diagnostics, true) : $row->diagnostics,
                    'last_seen_at' => $row->last_seen_at,
                ];
            })->values();

            $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

            return self::SUCCESS;
        }

        if ($rows->isEmpty()) {
            $this->info('Nenhuma sessão ativa encontrada.');

            return self::SUCCESS;
        }

        $tableRows = [];
        foreach ($rows as $row) {
            $diag = is_string($row->diagnostics) ? json_decode($row->diagnostics, true) : [];
            $qualities = is_array($diag['available_qualities'] ?? null)
                ? implode(',', $diag['available_qualities'])
                : '-';
            $subStatus = (string) ($diag['subtitle_translation_status'] ?? $diag['selected_subtitle_track'] ?? '-');
            $workLabel = $row->work_id ? ($titlesByWorkId[$row->work_id] ?? substr((string) $row->work_id, 0, 8)) : '-';
            $epLabel = $row->episode_number !== null ? "Ep {$row->episode_number}" : '-';
            $ago = $row->last_seen_at ? Carbon::parse($row->last_seen_at)->diffForHumans() : '-';

            $tableRows[] = [
                ($row->user_name ?? 'Desconhecido').' ('.($row->user_email ?? '-').')',
                $row->status,
                "{$workLabel} / {$epLabel}",
                $qualities,
                $subStatus,
                $ago,
            ];
        }

        $this->table(
            ['Usuário', 'Status', 'Obra / Ep', 'Qualidades', 'Legenda', 'Último Ping'],
            $tableRows
        );

        return self::SUCCESS;
    }
}
