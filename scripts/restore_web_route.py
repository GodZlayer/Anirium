import sys

with open('routes/web.php', 'r', encoding='utf-8') as f:
    text = f.read()

target = "Route::get('/', [\\App\\Http\\Controllers\\LobbyController::class, 'index'])->name('lobby');"

replacement = """Route::get('/', function (\\Illuminate\\Http\\Request $request) {
    return Inertia::render('Lobby', [
        'initialContext' => $request->session()->pull('initial_context'),
    ]);
});"""

if target in text:
    text = text.replace(target, replacement)
    with open('routes/web.php', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Inertia route restored in web.php!")
else:
    print("Target not found in web.php!")
