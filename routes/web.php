<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\TelemetryDeviceController;
use App\Http\Controllers\ServiceSessionController;
use Inertia\Inertia;

Route::get('/', [\App\Http\Controllers\LobbyController::class, 'index'])->name('lobby');

Route::get('/api/catalog/feed', [\App\Http\Controllers\CatalogSearchController::class, 'feed'])->middleware('throttle:300,1');
Route::get('/api/account/library', \App\Http\Controllers\CatalogLibraryController::class)->middleware('throttle:300,1');
Route::get('/api/catalog/search', \App\Http\Controllers\CatalogSearchController::class)->middleware('throttle:300,1');
Route::get('/api/catalog/work/{reference}', [\App\Http\Controllers\CatalogSearchController::class, 'work'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/work/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'work'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/episode/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'episode'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/arc/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'arc'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/universe/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'universe'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/creator/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'creator'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/studio/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'studio'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/track/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'track'])->middleware('throttle:300,1');
Route::get('/api/system/strings/{locale?}', [\App\Http\Controllers\CatalogGraphController::class, 'strings'])->middleware('throttle:300,1');
Route::get('/api/system/theme/{name?}', [\App\Http\Controllers\CatalogGraphController::class, 'theme'])->middleware('throttle:300,1');
Route::get('/api/catalog/context/{kind}/{id}', [\App\Http\Controllers\CatalogGraphController::class, 'context'])->whereIn('kind', ['universe', 'work', 'season', 'episode', 'arc', 'creator', 'track', 'studio'])->middleware('throttle:300,1');
Route::prefix('/api/catalog/candidate')->controller(\App\Http\Controllers\CatalogPreviewController::class)->group(function () {
    Route::get('/feed', 'feed');
    Route::get('/search', 'search');
    Route::get('/work/{reference}', 'work');
    Route::get('/manifest', 'manifest');
    Route::get('/files/{generation}/{filename}', 'file')->whereUuid('generation');
    Route::get('/episodes/{id}/{filename}', 'episode');
});

// Qualquer acesso direto a /view/:type/:id redireciona imediatamente para / mantendo a barra de endereÃ§o limpa e oculta
Route::get('/view/{type}/{id}', function (\Illuminate\Http\Request $request, string $type, string $id) {
    $request->session()->put('initial_context', [
        'type' => $type,
        'id' => $id,
    ]);
    return redirect('/');
})->name('context.view');

// Telemetria Fina, Registro de MÃ¡quina e Trava Concorrente
Route::post('/api/session/register-device', [TelemetryDeviceController::class, 'registerDevice'])->name('session.register_device');
Route::post('/api/telemetry/events', [TelemetryDeviceController::class, 'recordEvents'])->name('telemetry.events');
Route::post('/api/dev/simulate-login', [TelemetryDeviceController::class, 'simulateLogin'])->name('dev.simulate_login');

// PreferÃªncias Relacionais e DiscussÃµes ComunitÃ¡rias por ID de Entidade
Route::post('/api/entity/preference', [TelemetryDeviceController::class, 'setEntityPreference'])->name('entity.set_preference');
Route::get('/api/entity/preferences', [TelemetryDeviceController::class, 'getEntityPreferences'])->name('entity.get_preferences');
Route::post('/api/entity/comments', [TelemetryDeviceController::class, 'addDiscussionComment'])->name('entity.add_comment');
Route::get('/api/entity/comments/{type}/{id}', [TelemetryDeviceController::class, 'getEntityDiscussions'])->name('entity.get_comments');
Route::post('/api/account/settings', [TelemetryDeviceController::class, 'updateAccountSettings'])->name('account.settings');

// Gerenciamento de Addons (Anirium+ & Comunidade / Stremio)
Route::get('/api/addons', [TelemetryDeviceController::class, 'listUserAddons'])->name('addons.list');
Route::post('/api/addons/toggle', [TelemetryDeviceController::class, 'toggleUserAddon'])->name('addons.toggle');
Route::post('/api/addons/install', [TelemetryDeviceController::class, 'installUserAddon'])->name('addons.install');
Route::post('/api/addons/uninstall', [TelemetryDeviceController::class, 'uninstallUserAddon'])->name('addons.uninstall');

// SessÃ£o e ValidaÃ§Ã£o do Anirium+ Service (Daemon Local na porta 4004)
Route::get('/api/service/session', [ServiceSessionController::class, 'getSession'])->name('service.session');
Route::get('/api/service/session/validate', [ServiceSessionController::class, 'validateSession'])
    ->withoutMiddleware('web')
    ->name('service.session.validate');
Route::post('/api/service/playback/context', [ServiceSessionController::class, 'playbackContext'])->withoutMiddleware('web')->name('service.playback.context');
Route::delete('/api/service/session', [ServiceSessionController::class, 'releaseSession'])->name('service.session.release');
Route::get('/download/service', function () {
    $path = public_path('downloads/anirium-service.exe');
    if (file_exists($path)) {
        return response()->download($path, 'anirium-service.exe');
    }
    return response()->json(['error' => 'not_found'], 404);
})->name('service.download');

// AutenticaÃ§Ã£o Google OAuth Oficial (anirium.com.br)
Route::match(['get', 'post'], '/auth/google', [AuthController::class, 'redirectToGoogle'])->name('auth.google');
Route::post('/api/auth/google', [AuthController::class, 'verifyGoogleToken'])->name('auth.google.verify');
Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback'])->name('auth.google.callback');
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
