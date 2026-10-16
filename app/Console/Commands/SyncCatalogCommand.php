<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\File;

class SyncCatalogCommand extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'catalog:sync {--type=all : Tipo a sincronizar (anime, manga, seasonal, all)} {--pages=1 : Número de páginas da API}';

    /**
     * The console command description.
     */
    protected $description = 'Sincroniza e atualiza o acervo canônico universal de animes e mangás do Anirium';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $type = $this->option('type') ?: 'all';
        $pages = (int) ($this->option('pages') ?: 1);

        $this->info("=== INICIANDO SINCRONIZAÇÃO CANÔNICA DO ANIRIUM ===");
        $this->line("Modo: {$type} | Páginas por fonte: {$pages}");

        $dataPath = public_path('data');
        if (!File::exists($dataPath)) {
            File::makeDirectory($dataPath, 0755, true);
        }

        if (in_array($type, ['seasonal', 'all'])) {
            $this->syncSeasonalAnime($dataPath);
        }

        if (in_array($type, ['manga', 'all'])) {
            $this->syncTopManga($dataPath, $pages);
        }

        $this->info("=== SINCRONIZAÇÃO CONCLUÍDA COM SUCESSO ===");
        return Command::SUCCESS;
    }

    protected function syncSeasonalAnime(string $dataPath)
    {
        $this->line("Buscando animes da temporada atual na API AniList GraphQL...");
        $query = 'query {
            Page(page: 1, perPage: 50) {
                media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
                    id
                    idMal
                    title { romaji english native }
                    description(asHtml: false)
                    averageScore
                    episodes
                    status
                    format
                    seasonYear
                    coverImage { large extraLarge }
                    bannerImage
                    genres
                    studios(isMain: true) { nodes { name } }
                }
            }
        }';

        try {
            $response = Http::timeout(15)->post('https://graphql.anilist.co', ['query' => $query]);
            if ($response->successful()) {
                $items = $response->json('data.Page.media') ?? [];
                $this->info("Capturados " . count($items) . " animes em transmissão via AniList GraphQL.");
            }
        } catch (\Exception $e) {
            $this->warn("Aviso na captura de temporada: " . $e->getMessage());
        }
    }

    protected function syncTopManga(string $dataPath, int $pages)
    {
        $this->line("Buscando mangás canônicos do MyAnimeList / AniList via GraphQL...");
        $mangas = [];

        for ($p = 1; $p <= $pages; $p++) {
            $query = 'query ($page: Int) {
                Page(page: $page, perPage: 50) {
                    media(type: MANGA, sort: POPULARITY_DESC) {
                        id
                        idMal
                        title { romaji english native }
                        description(asHtml: false)
                        averageScore
                        chapters
                        volumes
                        status
                        format
                        startDate { year }
                        coverImage { large extraLarge }
                        bannerImage
                        genres
                        staff { edges { role node { name { full } } } }
                    }
                }
            }';

            try {
                $this->line("Consultando página {$p} de mangás...");
                $response = Http::timeout(15)->post('https://graphql.anilist.co', [
                    'query' => $query,
                    'variables' => ['page' => $p],
                ]);

                if ($response->successful()) {
                    $data = $response->json('data.Page.media') ?? [];
                    foreach ($data as $m) {
                        $mal_id = $m['idMal'] ?? $m['id'];
                        $mangas[] = [
                            'id' => $mal_id,
                            'mal_id' => $mal_id,
                            'anilist_id' => $m['id'],
                            'media_type' => 'manga',
                            'title' => $m['title']['romaji'] ?? $m['title']['english'] ?? 'Manga',
                            'title_english' => $m['title']['english'] ?? null,
                            'title_japanese' => $m['title']['native'] ?? null,
                            'synopsis' => strip_tags($m['description'] ?? ''),
                            'score' => isset($m['averageScore']) ? round($m['averageScore'] / 10, 1) : null,
                            'format' => strtoupper($m['format'] ?? 'MANGA'),
                            'status' => strtoupper($m['status'] ?? 'FINISHED'),
                            'chapters' => $m['chapters'] ?? null,
                            'volumes' => $m['volumes'] ?? null,
                            'cover_image' => $m['coverImage']['extraLarge'] ?? $m['coverImage']['large'] ?? '',
                            'banner_image' => $m['bannerImage'] ?? ($m['coverImage']['extraLarge'] ?? ''),
                            'genres' => $m['genres'] ?? [],
                            'year' => $m['startDate']['year'] ?? null,
                            'universe_id' => 'mal-manga-' . $mal_id,
                            'updated_at' => now()->timestamp * 1000,
                        ];
                    }
                }
                usleep(500000); // 500ms
            } catch (\Exception $e) {
                $this->warn("Erro na página {$p} de mangás: " . $e->getMessage());
                break;
            }
        }

        if (!empty($mangas)) {
            $mangaFile = $dataPath . '/catalog-manga.json';
            $existing = [];
            if (File::exists($mangaFile)) {
                try {
                    $existing = json_decode(File::get($mangaFile), true) ?: [];
                } catch (\Exception $e) {}
            }

            $map = [];
            foreach ($existing as $item) {
                $map[$item['mal_id']] = $item;
            }
            foreach ($mangas as $item) {
                $map[$item['mal_id']] = $item;
            }

            File::put($mangaFile, json_encode(array_values($map), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $this->info("Base de Mangás atualizada em {$mangaFile} com " . count($map) . " obras indexadas.");
        }
    }
}

