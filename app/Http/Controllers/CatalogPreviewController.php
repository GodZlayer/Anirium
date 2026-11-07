<?php

namespace App\Http\Controllers;

use App\Support\CatalogSearch;
use Illuminate\Http\Request;

class CatalogPreviewController extends Controller
{
    private function root(): string
    {
        abort_unless(app()->environment('local'), 404);

        $candidate = request()->query->has('candidate') ? request()->query('candidate') : 'unified-candidate';
        abort_unless(is_string($candidate) && preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $candidate), 404);
        $base = storage_path('app/catalog');
        $root = $base.'/'.$candidate;
        $resolved = realpath($root);
        abort_unless($resolved && ! is_link($root) && dirname($resolved) === realpath($base) && is_file($resolved.'/data/catalog.manifest.json'), 404);

        return $resolved;
    }

    private function catalog(): CatalogSearch
    {
        $root = $this->root();

        return new CatalogSearch($root.'/data/catalog.manifest.json', $root.'/indexes');
    }

    public function feed(Request $request)
    {
        return app(CatalogSearchController::class)->feed($request, $this->catalog());
    }

    public function search(Request $request)
    {
        return app(CatalogSearchController::class)($request, $this->catalog());
    }

    public function work(Request $request, string $reference)
    {
        return app(CatalogSearchController::class)->work($request, $reference, $this->catalog());
    }

    public function manifest()
    {
        return response()->file($this->root().'/data/catalog.manifest.json');
    }

    public function file(string $generation, string $filename)
    {
        abort_unless(preg_match('/^(?:(?:anime|manga|novel)-\d{5}\.parquet|lookup\.json)$/D', $filename), 404);

        return response()->file($this->root().'/data/catalog/v2/'.$generation.'/'.$filename);
    }

    public function episode(string $id, string $filename)
    {
        abort_unless(preg_match('/^[1-9]\d*$/D', $id) && preg_match('/^[a-f0-9]{64}\.json$/D', $filename), 404);

        return response()->file($this->root().'/data/episodes/anime/'.$id.'/'.$filename);
    }
}
