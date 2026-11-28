<?php

namespace App\Http\Controllers;

use App\Support\CatalogLibrary;
use App\Support\CatalogUnavailable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CatalogLibraryController extends Controller
{
    public function __invoke(Request $request, CatalogLibrary $library): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }
        if (! $user->hasActiveAniriumPlus()) {
            return response()->json([
                'error' => 'plus_required',
                'message' => 'Histórico, favoritos e avaliações são exclusivos para contas Anirium+.',
            ], 403);
        }
        $input = $request->validate(['view' => ['required', 'in:bookmarks,history,ratings'], 'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'], 'adult' => ['sometimes', 'boolean']]);
        $preferences = DB::table('user_entity_preferences')->where('user_id', $user->id)->where('target_type', 'work')->get()->all();
        try {
            return response()->json($library->read($preferences, $input['view'], (int) ($input['page'] ?? 1), $user->canAccessAdultContent() && $request->boolean('adult')))
                ->header('Cache-Control', 'private, no-store');
        } catch (CatalogUnavailable $exception) {
            return response()->json(['error' => 'catalog_library_unavailable'], 503);
        }
    }
}
