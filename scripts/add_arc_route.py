with open('routes/web.php', 'r', encoding='utf-8') as f:
    text = f.read()

target = "Route::get('/api/catalog/graph/work/{id}', [\\App\\Http\\Controllers\\CatalogGraphController::class, 'work'])->whereUuid('id')->middleware('throttle:60,1');"
replacement = target + "\nRoute::get('/api/catalog/graph/arc/{id}', [\\App\\Http\\Controllers\\CatalogGraphController::class, 'arc'])->whereUuid('id')->middleware('throttle:60,1');"

if target in text:
    text = text.replace(target, replacement)
    with open('routes/web.php', 'w', encoding='utf-8') as f:
        f.write(text)
    print("ROUTE_ADDED_SUCCESS")
else:
    print("TARGET_NOT_FOUND")
