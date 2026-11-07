@props([
    'activeView' => 'content', // content, calendar, catalog, profile
])

<aside {{ $attributes->merge(['class' => 'fixed right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 p-2.5 rounded-full border border-theme-default bg-theme-pill backdrop-blur-2xl shadow-2xl z-40 select-none']) }}>
    <!-- 1. Explorar / Vitrine -->
    <button class="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 bg-theme-accent text-theme-inverse shadow-lg cursor-pointer"
            data-i18n-title="nav.explore"
            title="Explorar Catálogo em Alta Velocidade"
            onclick="window.switchTab('explore')">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
    </button>

    <!-- 2. Calendário Semanal -->
    <button class="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 bg-theme-raised text-theme-muted hover:text-theme-primary hover:bg-white/10 cursor-pointer border border-theme-default"
            data-i18n-title="nav.calendar"
            title="Calendário de Lançamentos Diários"
            onclick="window.switchTab('calendar')">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
    </button>

    <!-- Divisor Fino -->
    <div class="w-5 h-px bg-theme-default my-0.5 opacity-30"></div>

    <!-- 3. Favoritos / Biblioteca -->
    <button class="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 bg-theme-raised text-theme-muted hover:text-theme-accent cursor-pointer border border-theme-default"
            data-i18n-title="nav.library"
            title="Minha Biblioteca & Favoritos">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
    </button>

    <!-- 4. Curtir / Coração -->
    <button class="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 bg-theme-raised text-theme-muted hover:text-[var(--color-state-filler,#F43F5E)] cursor-pointer border border-theme-default"
            data-i18n-title="nav.likes"
            title="Curtidas">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
    </button>
</aside>
