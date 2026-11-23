<?php

use App\Http\Controllers\AgeVerificationController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CatalogGraphController;
use App\Http\Controllers\CatalogLibraryController;
use App\Http\Controllers\CatalogPreviewController;
use App\Http\Controllers\CatalogSearchController;
use App\Http\Controllers\LobbyController;
use App\Http\Controllers\ServiceSessionController;
use App\Http\Controllers\TelemetryDeviceController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', [LobbyController::class, 'index'])->name('lobby');

Route::get('/api/catalog/feed', [CatalogSearchController::class, 'feed'])->middleware('throttle:300,1');
Route::get('/api/account/library', CatalogLibraryController::class)->middleware('throttle:300,1');
Route::get('/api/catalog/search', CatalogSearchController::class)->middleware('throttle:300,1');
Route::get('/api/catalog/work/{reference}', [CatalogSearchController::class, 'work'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/work/{id}', [CatalogGraphController::class, 'work'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/episode/{id}', [CatalogGraphController::class, 'episode'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/arc/{id}', [CatalogGraphController::class, 'arc'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/universe/{id}', [CatalogGraphController::class, 'universe'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/creator/{id}', [CatalogGraphController::class, 'creator'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/studio/{id}', [CatalogGraphController::class, 'studio'])->middleware('throttle:300,1');
Route::get('/api/catalog/graph/track/{id}', [CatalogGraphController::class, 'track'])->middleware('throttle:300,1');
Route::get('/api/system/strings/{locale?}', [CatalogGraphController::class, 'strings'])->middleware('throttle:300,1');
Route::get('/api/system/theme/{name?}', [CatalogGraphController::class, 'theme'])->middleware('throttle:300,1');
Route::get('/api/catalog/context/{kind}/{id}', [CatalogGraphController::class, 'context'])->whereIn('kind', ['universe', 'work', 'season', 'episode', 'arc', 'creator', 'track', 'studio'])->middleware('throttle:300,1');
Route::prefix('/api/catalog/candidate')->controller(CatalogPreviewController::class)->group(function () {
    Route::get('/feed', 'feed');
    Route::get('/search', 'search');
    Route::get('/work/{reference}', 'work');
    Route::get('/manifest', 'manifest');
    Route::get('/files/{generation}/{filename}', 'file')->whereUuid('generation');
    Route::get('/episodes/{id}/{filename}', 'episode');
});

// Qualquer acesso direto a /view/:type/:id redireciona imediatamente para / mantendo a barra de endereÃ§o limpa e oculta
Route::get('/view/{type}/{id}', function (Request $request, string $type, string $id) {
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

// Verificação de Idade (+18) & Filtro Adulto Seguro
Route::get('/auth/google/verify-age', [AgeVerificationController::class, 'redirectToGoogle'])->name('age_verification.google.redirect');
Route::get('/api/account/age-verification/status', [AgeVerificationController::class, 'status'])->middleware('throttle:60,1')->name('age_verification.status');
Route::post('/api/account/age-verification/google', [AgeVerificationController::class, 'verifyWithGoogle'])->middleware('throttle:10,1')->name('age_verification.google.verify');
Route::post('/api/account/age-verification/request', [AgeVerificationController::class, 'submitRequest'])->middleware('throttle:5,10')->name('age_verification.request');
Route::get('/api/admin/age-verifications', [AgeVerificationController::class, 'adminIndex'])->middleware('throttle:60,1')->name('admin.age_verification.index');
Route::post('/api/admin/age-verifications/{ageVerificationRequest}/approve', [AgeVerificationController::class, 'adminApprove'])->middleware('throttle:30,1')->name('admin.age_verification.approve');
Route::post('/api/admin/age-verifications/{ageVerificationRequest}/reject', [AgeVerificationController::class, 'adminReject'])->middleware('throttle:30,1')->name('admin.age_verification.reject');
Route::post('/api/admin/age-verifications/users/{user}/revoke', [AgeVerificationController::class, 'adminRevoke'])->middleware('throttle:30,1')->name('admin.age_verification.revoke');
Route::get('/api/catalog/adult-shard/{kind}', [CatalogGraphController::class, 'adultShard'])->whereIn('kind', ['work', 'manga'])->middleware('throttle:120,1')->name('catalog.adult_shard');

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
