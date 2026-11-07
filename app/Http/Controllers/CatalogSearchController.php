<?php

namespace App\Http\Controllers;

use App\Support\CatalogSearch;
use App\Support\CatalogUnavailable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogSearchController extends Controller
{
    public function feed(Request $request, CatalogSearch $catalog): JsonResponse
    {
        $input = $request->validate(['view' => ['required', 'in:home,calendar'], 'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'], 'adult' => ['sometimes', 'boolean']]);
        try {
            return response()->json($catalog->feed($input['view'], (int) ($input['page'] ?? 1),
                (bool) $request->user()?->adult_content_enabled && $request->boolean('adult')));
        } catch (CatalogUnavailable $exception) {
            return response()->json(['error' => 'catalog_feed_unavailable'], 503);
        }
    }

    public function work(Request $request, string $reference, CatalogSearch $catalog): JsonResponse
    {
        try {
            $work = $catalog->resolve($reference, (bool) $request->user()?->adult_content_enabled);

            return $work ? response()->json($work) : response()->json(['error' => 'work_not_found'], 404);
        } catch (CatalogUnavailable $exception) {
            return response()->json(['error' => 'catalog_search_unavailable'], 503);
        }
    }

    public function __invoke(Request $request, CatalogSearch $catalog): JsonResponse
    {
        $input = $request->validate([
            'q' => ['nullable', 'string', 'max:160'],
            'media' => ['sometimes', 'in:all,anime,manga,novel'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
            'adult' => ['sometimes', 'boolean'],
            'universe' => ['sometimes', 'uuid'],
            'status' => ['sometimes', 'in:all,releasing,upcoming,finished'],
            'format' => ['sometimes', 'nullable', 'string', 'max:40'],
            'genre' => ['sometimes', 'nullable', 'string', 'max:120'],
            'sort' => ['sometimes', 'in:popularity,score,year,title'],
            'facets' => ['sometimes', 'boolean'],
        ]);
        try {
            return response()->json($catalog->search($input['q'] ?? '', $input['media'] ?? 'anime', (int) ($input['page'] ?? 1),
                (bool) $request->user()?->adult_content_enabled && $request->boolean('adult'), $input['universe'] ?? null, $input));
        } catch (CatalogUnavailable $exception) {
            return response()->json(['error' => 'catalog_search_unavailable'], 503);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'catalog_search_failed'], 500);
        }
    }
}
