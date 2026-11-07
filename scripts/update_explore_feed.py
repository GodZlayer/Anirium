import sys

filepath = r'c:\Users\santo\Documents\Anirium-App\app\Services\Cache\InMemoryCatalogService.php'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

old_method = """    public function getExploreFeed(string $media = 'all', string $format = 'all', int $page = 1, int $perPage = 24): array
    {
        $cacheKey = "catalog:explore:{$media}:{$format}:{$page}";

        return Cache::remember($cacheKey, self::TTL_SECONDS, function () use ($media, $format, $page, $perPage) {
            $query = DB::table('catalog_works as w')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
                ->whereNotNull('a.image_url');

            if ($media !== 'all') {
                $query->where('w.media', $media);
            }
            if ($format !== 'all') {
                $query->where('w.format', strtoupper($format));
            }

            $total = $query->count();
            $rows = $query->orderBy('w.title', 'ASC')
                ->offset(($page - 1) * $perPage)
                ->limit($perPage)
                ->get(['w.id', 'w.title', 'w.media', 'w.format', 'w.episode_count', 'a.image_url']);

            $items = [];
            foreach ($rows as $r) {
                $items[] = [
                    'id' => $r->id,
                    'title' => $this->resolveWorkTitle($r->id, $r->title),
                    'media' => $r->media,
                    'format' => $r->format ?? 'TV',
                    'image' => $r->image_url,
                    'episode_count' => $r->episode_count,
                ];
            }

            return [
                'total' => $total,
                'page' => $page,
                'last_page' => (int) ceil($total / $perPage),
                'items' => $items,
            ];
        });
    }"""

new_method = """    public function getExploreFeed(string $media = 'all', string $format = 'all', int $page = 1, int $perPage = 24, string $status = 'all', string $sort = 'title'): array
    {
        $cacheKey = "catalog:explore:{$media}:{$format}:{$status}:{$sort}:{$page}";

        return Cache::remember($cacheKey, self::TTL_SECONDS, function () use ($media, $format, $page, $perPage, $status, $sort) {
            $query = DB::table('catalog_works as w')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
                ->whereNotNull('a.image_url');

            if ($media !== 'all') {
                $query->where('w.media', $media);
            }
            if ($format !== 'all') {
                $query->where('w.format', strtoupper($format));
            }
            if ($status !== 'all') {
                $statusUpper = match(strtolower($status)) {
                    'releasing' => 'RELEASING',
                    'finished', 'completed' => 'COMPLETED',
                    'upcoming' => 'UPCOMING',
                    default => strtoupper($status),
                };
                $query->where('w.status', $statusUpper);
            }

            $total = $query->count();

            // Ordenacao
            if ($sort === 'score') {
                $query->orderBy('w.episode_count', 'DESC');
            } else {
                $query->orderBy('w.title', 'ASC');
            }

            $rows = $query->offset(($page - 1) * $perPage)
                ->limit($perPage)
                ->get(['w.id', 'w.title', 'w.media', 'w.format', 'w.status', 'w.episode_count', 'a.image_url']);

            $items = [];
            foreach ($rows as $r) {
                $items[] = [
                    'id' => $r->id,
                    'title' => $this->resolveWorkTitle($r->id, $r->title),
                    'media' => $r->media,
                    'format' => $r->format ?? 'TV',
                    'status' => $r->status ?? 'RELEASING',
                    'image' => $r->image_url,
                    'episode_count' => $r->episode_count,
                ];
            }

            return [
                'total' => $total,
                'page' => $page,
                'last_page' => (int) ceil($total / $perPage),
                'items' => $items,
            ];
        });
    }"""

if old_method in text:
    text = text.replace(old_method, new_method, 1)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)
    print("SUCCESS: Updated InMemoryCatalogService.php")
else:
    print("ERROR: old_method not found!")
