<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('Lobby');
});

// Autenticação Google OAuth
Route::get('/auth/google', [AuthController::class, 'redirectToGoogle'])->name('auth.google');
Route::get('/auth/google/callback', [AuthController::class, 'handleGoogleCallback'])->name('auth.google.callback');
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
