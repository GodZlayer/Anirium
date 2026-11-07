<header {{ $attributes->merge(['class' => 'h-16 w-full flex items-center justify-between px-8 bg-theme-header border-b border-theme-default z-40 select-none']) }}>
    <!-- Logotipo Geométrico -->
    <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-theme-accent flex items-center justify-center shadow-lg">
            <span class="text-white font-black text-base">A</span>
        </div>
        <span class="font-extrabold text-lg tracking-wider text-theme-primary" data-i18n="app.name">ANIRIUM</span>
    </div>

    <!-- Barra de Busca Minimalista com Atalho -->
    <div class="flex items-center gap-2 px-4 py-2 rounded-xl bg-theme-raised border border-theme-default text-theme-muted w-80 text-xs focus-within:border-theme-highlight focus-within:text-theme-primary transition-colors">
        <svg class="w-4 h-4 text-theme-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input type="text" placeholder="Buscar animes, mangás, autores..." data-i18n-placeholder="search.placeholder" class="bg-transparent border-none outline-none w-full text-xs text-theme-primary placeholder-theme-muted">
        <kbd class="px-1.5 py-0.5 rounded bg-theme-pill text-[10px] text-theme-muted font-mono">/</kbd>
    </div>

    <!-- Ações e Perfil -->
    <div class="flex items-center gap-4">
        <!-- Badge de Idioma -->
        <button class="px-2.5 py-1 rounded-md bg-theme-pill hover:bg-theme-raised text-theme-primary text-xs font-semibold border border-theme-default transition-colors">
            PT-BR
        </button>

        <!-- Indicador de Gamificação (Nível 0 a 3) -->
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-pill border border-theme-highlight text-theme-accent text-xs font-semibold">
            <span class="w-2 h-2 rounded-full bg-[var(--color-state-canon,#10B981)] animate-pulse"></span>
            <span data-i18n="gamification.level_1">Nível 1</span>
        </div>
    </div>
</header>
