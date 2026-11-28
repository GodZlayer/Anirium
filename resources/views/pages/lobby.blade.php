<x-app-layout>
    <!-- 0. TELA DE LOADING INICIAL (Sync da Fonte Única de Verdade -> IndexedDB) -->
    <div id="anirium-catalog-boot-overlay"
         class="fixed inset-0 z-[9999] hidden flex-col items-center justify-center bg-[#070709]/95 backdrop-blur-xl text-white select-none transition-opacity duration-300">
        <div class="flex flex-col items-center gap-4 px-6 text-center max-w-sm">
            <img src="/assets/logos/Anirium-favicon.png?v=2" width="56" height="56" alt="Anirium"
                 class="w-14 h-14 object-contain animate-pulse drop-shadow-[0_4px_20px_rgba(255,199,102,0.45)]">
            <div class="text-sm font-semibold tracking-wide text-white" id="anirium-boot-status">
                Verificando atualizações do catálogo...
            </div>
            <div class="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div id="anirium-boot-bar" class="h-full w-1/3 bg-theme-accent rounded-full transition-all duration-300"></div>
            </div>
            <div class="text-[11px] font-mono text-white/50" id="anirium-boot-meta">
                Fonte Única de Verdade · Cache Local
            </div>
        </div>
    </div>

    <!-- 1. TOPBAR FLUTUANTE (Idêntica à versão TSX de Lobby.tsx) -->
    <header class="w-full h-14 flex-none px-3 lg:px-6 z-40 border-b border-theme-default bg-theme-header backdrop-blur-xl flex items-center justify-between gap-1 lg:gap-4 select-none">
        <!-- Lado Esquerdo: Mascote + Logo Textual + DOCK CÁPSULA ACRÍLICA DE NAVEGAÇÃO -->
        <div class="flex items-center gap-2 lg:gap-5 shrink-0">
            <!-- Botão Logotipo Canônico Anirium -->
            <button type="button"
                    onclick="window.switchTab('home')"
                    class="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl cursor-pointer group transition-all duration-300 hover:scale-[1.02] bg-theme-pill border border-theme-highlight shadow-md">
                <img src="/assets/logos/Anirium-favicon.png?v=2" width="28" height="28"
                     alt="Anirium Mascot"
                     class="w-7 h-7 object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.4)] group-hover:rotate-6 transition-transform">
                <img src="/assets/logos/Anirium-Textlogo.png?v=2" width="72" height="24"
                     alt="Anirium"
                     class="hidden lg:block h-6 w-auto object-contain filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
            </button>

            <!-- DOCK CÁPSULA ACRÍLICA NA TOPBAR (Home, Explorar, Calendário) -->
            <nav class="flex items-center backdrop-blur-md p-1 rounded-full border border-theme-default bg-theme-pill text-xs shadow-inner">
                @php $initialTab = request()->query('tab', 'home'); @endphp
                <!-- 1. Home -->
                <button type="button"
                        id="top-nav-home"
                        onclick="window.switchTab('home')"
                        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer {{ $initialTab === 'home' ? 'bg-theme-accent text-theme-inverse shadow-md' : 'text-theme-muted hover:text-white' }}">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    <span class="hidden sm:inline" data-i18n="nav.home">Início</span>
                </button>

                <!-- 2. Explorar -->
                <button type="button"
                        id="top-nav-explore"
                        onclick="window.switchTab('explore')"
                        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer {{ $initialTab === 'explore' ? 'bg-theme-accent text-theme-inverse shadow-md' : 'text-theme-muted hover:text-white' }}">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                    <span class="hidden sm:inline" data-i18n="nav.explore">Explorar</span>
                </button>

                <!-- 3. Calendário -->
                <button type="button"
                        id="top-nav-calendar"
                        onclick="window.switchTab('calendar')"
                        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer text-theme-muted hover:text-white">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span class="hidden sm:inline" data-i18n="nav.calendar">Calendário</span>
                </button>

                @if($user && ((int) ($user->tier ?? 1) >= 2 || strtolower((string) $user->email) === 'santoss.cog@gmail.com'))
                <!-- 4. Histórico (Exclusivo Anirium+) -->
                <button type="button"
                        id="top-nav-history"
                        onclick="window.switchTab('history')"
                        title="Histórico"
                        class="flex items-center justify-center p-2 rounded-full transition-all duration-300 font-semibold cursor-pointer text-theme-muted hover:text-white">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span class="hidden">Histórico</span>
                </button>

                <!-- 5. Lançamentos (Exclusivo Anirium+) -->
                <button type="button"
                        id="top-nav-launches"
                        onclick="window.switchTab('launches')"
                        title="Lançamentos"
                        class="flex items-center justify-center p-2 rounded-full transition-all duration-300 font-semibold cursor-pointer text-theme-muted hover:text-white">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    <span class="hidden">Lançamentos</span>
                </button>
                @endif
            </nav>

            <!-- Campo de Busca e Pílulas Ontológicas Integradas na Navbar (Universo, Obra, Entidade) -->
            <div class="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-theme-default bg-theme-pill text-xs focus-within:border-theme-highlight transition-all">
                <svg class="w-3.5 h-3.5 text-theme-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input type="text"
                       id="topbar-search-input" data-i18n-placeholder="search.placeholder"
                       placeholder="Buscar universo, obra, arco, autor, diretor, produtora, música..."
                       class="bg-transparent border-none outline-none w-36 lg:w-56 text-xs text-white placeholder-slate-500 font-medium"
                       onfocus="window.showExploreFilters(); if (window.currentTab !== 'explore') window.switchTab('explore');"
                       onclick="window.showExploreFilters();"
                       oninput="window.syncSearch(this.value)">

                <!-- Pílulas Ontológicas Canônicas do Explorador de Entidades (Compactas: só expande a selecionada) -->
                <div id="topbar-pills-container" class="{{ $initialTab === 'explore' ? 'flex' : 'hidden' }} items-center gap-1 pl-2 border-l border-white/10 text-[11px] font-mono overflow-x-auto no-scrollbar">
    <button type="button" onclick="window.setExploreKind('universe')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="universe" title="Universo" data-i18n-title="entity.universe">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.universe">Universo</span>
    </button>
    <button type="button" onclick="window.setExploreKind('work')" class="explore-kind-btn flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm whitespace-nowrap shrink-0" data-kind="work" title="Obra" data-i18n-title="entity.work">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="7" width="20" height="15" rx="2" stroke-width="2"/><polyline stroke-width="2" points="17 2 12 7 7 2"/></svg>
        <span class="explore-kind-label inline" data-i18n="entity.work">Obra</span>
    </button>
    <button type="button" onclick="window.setExploreKind('manga')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="manga" title="Mangá" data-i18n-title="entity.manga">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.manga">Mangá</span>
    </button>
    <button type="button" onclick="window.setExploreKind('arc')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="arc" title="Arco" data-i18n-title="entity.arc">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><polygon stroke-width="2" points="12 2 2 7 12 12 22 7 12 2"/><polyline stroke-width="2" points="2 17 12 22 22 17"/><polyline stroke-width="2" points="2 12 12 17 22 12"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.arc">Arco</span>
    </button>
    <button type="button" onclick="window.setExploreKind('author')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="author" title="Autor" data-i18n-title="entity.author">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l7-7 3 3-7 7-3-3z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="11" cy="11" r="2" stroke-width="2"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.author">Autor</span>
    </button>
    <button type="button" onclick="window.setExploreKind('director')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="director" title="Diretor" data-i18n-title="entity.director">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l3 5m4-5l3 5m4-5l3 5M2 9h20"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.director">Diretor</span>
    </button>
    <button type="button" onclick="window.setExploreKind('studio')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="studio" title="Produtora" data-i18n-title="entity.studio">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18M2 22h20M9 6h1m4 0h1M9 10h1m4 0h1M9 14h1m4 0h1M9 18h1m4 0h1"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.studio">Produtora</span>
    </button>
    <button type="button" onclick="window.setExploreKind('music')" class="explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="music" title="Música" data-i18n-title="entity.music">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
        <span class="explore-kind-label hidden" data-i18n="entity.music">Música</span>
    </button>
</div>
</div>
        </div>

        <!-- Lado Direito: Seletor de Idioma & LolProfileBadge (Login com Google quando deslogado) -->
        <div class="flex items-center gap-2 lg:gap-3 shrink-0">
            <!-- DOIS BOTÕES / DROPDOWNS SEPARADOS: TEMA & IDIOMA (Padrão TGCode) -->
            <!-- 1. SELETOR DE TEMAS (Dark & Light) -->
            <div class="relative">
                <button type="button"
                        id="btn-theme-trigger"
                        onclick="window.toggleThemeMenu(event)"
                        title="Trocar Tema Visual" data-i18n-title="tooltip.theme"
                        class="w-8 h-8 rounded-full border border-theme-default bg-theme-surface hover:border-theme-highlight flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md cursor-pointer shrink-0">
                    <span id="current-theme-indicator" class="w-3.5 h-3.5 rounded-full bg-theme-accent shadow-sm ring-1 ring-white/10"></span>
                </button>

                <!-- Dropdown de Temas (100% Opaco, Alto Contraste, Guiado por Tokens) -->
                <div id="theme-dropdown" class="hidden absolute right-0 top-11 z-50 w-56 rounded-2xl p-3 shadow-2xl theme-dropdown-panel border border-theme-default">
                    <p class="text-[10px] font-mono px-2 py-1 uppercase tracking-wider font-bold theme-dropdown-section-title" data-i18n="theme.dark_section">Dark Themes</p>
                    <div class="space-y-1">
                        <button type="button" onclick="window.applyTheme('black'); window.closeThemeMenu();" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
                            <span class="flex items-center gap-2.5">
                                <span class="w-3 h-3 rounded-full bg-[#FFC766] ring-1 ring-white/20"></span>
                                <span data-i18n="theme.black">Dark Clássico</span>
                            </span>
                        </button>
                        <button type="button" onclick="window.applyTheme('amoled'); window.closeThemeMenu();" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
                            <span class="flex items-center gap-2.5">
                                <span class="w-3 h-3 rounded-full bg-[#38BDF8] ring-1 ring-white/20"></span>
                                <span data-i18n="theme.amoled">AMOLED Puro</span>
                            </span>
                        </button>
                        <button type="button" onclick="window.applyTheme('cyberpunk'); window.closeThemeMenu();" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
                            <span class="flex items-center gap-2.5">
                                <span class="w-3 h-3 rounded-full bg-[#00FFCC] ring-1 ring-white/20"></span>
                                <span data-i18n="theme.cyberpunk">Cyberpunk Neon</span>
                            </span>
                        </button>
                        <button type="button" onclick="window.applyTheme('sakura'); window.closeThemeMenu();" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
                            <span class="flex items-center gap-2.5">
                                <span class="w-3 h-3 rounded-full bg-[#FFB7C5] ring-1 ring-white/20"></span>
                                <span data-i18n="theme.sakura">Sakura Night</span>
                            </span>
                        </button>
                    </div>

                    <div class="h-px border-t border-theme-default my-2"></div>

                    <p class="text-[10px] font-mono px-2 py-1 uppercase tracking-wider font-bold theme-dropdown-section-title" data-i18n="theme.light_section">Light Themes</p>
                    <div class="space-y-1">
                        <button type="button" onclick="window.applyTheme('nordic-light'); window.closeThemeMenu();" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
                            <span class="flex items-center gap-2.5">
                                <span class="w-3 h-3 rounded-full bg-[#2563EB] ring-1 ring-black/10"></span>
                                <span data-i18n="theme.nordic">Nordic Light</span>
                            </span>
                        </button>
                        <button type="button" onclick="window.applyTheme('solar-light'); window.closeThemeMenu();" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
                            <span class="flex items-center gap-2.5">
                                <span class="w-3 h-3 rounded-full bg-[#EA580C] ring-1 ring-black/10"></span>
                                <span data-i18n="theme.solar">Solar Warm Light</span>
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 2. SELETOR DE IDIOMAS (10 Línguas Mundiais) -->
            <div class="relative">
                <button type="button"
                        id="btn-lang-trigger"
                        onclick="window.toggleLangMenu(event)"
                        title="Trocar Idioma do Sistema" data-i18n-title="tooltip.lang"
                        class="w-8 h-8 rounded-full border border-theme-default bg-theme-surface hover:border-theme-highlight flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md cursor-pointer shrink-0">
                    <img id="current-lang-flag" src="/assets/flags/pt-BR.svg" alt="Language" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" />
                </button>

                <!-- Dropdown de Idiomas (100% Opaco, Alto Contraste, Guiado por Tokens) -->
                <div id="lang-dropdown" class="hidden absolute right-0 top-11 z-50 w-60 rounded-2xl p-3 shadow-2xl theme-dropdown-panel border border-theme-default">
                    <p class="text-[10px] font-mono px-2 py-1 uppercase tracking-wider font-bold theme-dropdown-section-title" data-i18n="lang.label">🌐 Idioma do Sistema</p>
                    <div class="space-y-1 max-h-64 overflow-y-auto pr-1">
                        <button type="button" onclick="window.applyLanguage('pt-BR'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/pt-BR.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="pt-BR" />
    <span data-i18n="lang.pt">Português</span>
</button>
                        <button type="button" onclick="window.applyLanguage('en-US'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/en-US.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="en-US" />
    <span data-i18n="lang.en">English</span>
</button>
                        <button type="button" onclick="window.applyLanguage('es-ES'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/es-ES.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="es-ES" />
    <span data-i18n="lang.es">Español</span>
</button>
                        <button type="button" onclick="window.applyLanguage('ja-JP'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/ja-JP.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="ja-JP" />
    <span data-i18n="lang.ja">日本語 (Japonês)</span>
</button>
                        <button type="button" onclick="window.applyLanguage('zh-CN'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/zh-CN.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="zh-CN" />
    <span data-i18n="lang.zh">中文 (Chinês)</span>
</button>
                        <button type="button" onclick="window.applyLanguage('ru-RU'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/ru-RU.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="ru-RU" />
    <span data-i18n="lang.ru">Русский (Russo)</span>
</button>
                        <button type="button" onclick="window.applyLanguage('it-IT'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/it-IT.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="it-IT" />
    <span data-i18n="lang.it">Italiano</span>
</button>
                        <button type="button" onclick="window.applyLanguage('fr-FR'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/fr-FR.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="fr-FR" />
    <span data-i18n="lang.fr">Français</span>
</button>
                        <button type="button" onclick="window.applyLanguage('de-DE'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/de-DE.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="de-DE" />
    <span data-i18n="lang.de">Deutsch (Alemão)</span>
</button>
                        <button type="button" onclick="window.applyLanguage('hi-IN'); window.closeLangMenu();" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs theme-dropdown-item transition-all cursor-pointer font-medium">
    <img src="/assets/flags/hi-IN.svg" class="w-5 h-3.5 rounded-xs object-cover border border-white/10 shrink-0" alt="hi-IN" />
    <span data-i18n="lang.hi">हिन्दी (Hindi / Indiano)</span>
</button>
                    </div>
                </div>
            </div>

            <div id="header-auth-slot" class="shrink-0">
                @if(!$user)
                    <!-- DESLOGADO: BOTÃO OFICIAL LIMPO "ENTRAR COM GOOGLE" (Apenas o Ícone Oficial SVG) -->
                    <a href="/auth/google"
                       title="Entrar com o Google" data-i18n-title="auth.google"
                       class="w-8 h-8 rounded-full border border-theme-default bg-theme-surface hover:border-theme-highlight flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-md cursor-pointer shrink-0">
                        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                    </a>
                @else
                    <!-- LOGADO: MOLDURA LOLPROFILEBADGE COM ANEL DE XP E NÍVEL -->
                    <div class="relative flex items-center gap-3 px-3 py-1 rounded-full border border-white/10 bg-[#0E1118]/80 cursor-pointer hover:border-theme-accent/50 transition-all"
                         onclick="window.openProfileModal()">
                        <div class="relative w-9 h-9 flex items-center justify-center">
                            <img src="{{ $user->avatar ?? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80' }}"
                                 alt="{{ $user->name }}"
                                 class="w-8 h-8 rounded-full object-cover">
                            <span class="absolute -bottom-1 -right-1 px-1.5 py-0.2 text-[9px] font-black rounded-full bg-theme-accent text-theme-inverse font-mono shadow-md">
                                {{ $user->tier ?? 1 }}
                            </span>
                        </div>
                        <div class="flex flex-col text-left">
                            <span class="text-xs font-bold text-white leading-tight max-w-[120px] truncate">{{ $user->name }}</span>
                            <span class="text-[9px] font-mono text-theme-accent leading-none mt-0.5">🔥 {{ $user->current_streak ?? 1 }}d • {{ $user->streak_xp ?? 0 }} XP</span>
                        </div>
                    </div>
                @endif
            </div>
        </div>
    </header>

    <!-- PALCO 1: VIEW DA HOME (100% EXCLUSIVA AOS 3 LANÇAMENTOS - SEM CARDS EMBOLADOS) -->
    <section id="view-home" class="view-stage {{ $initialTab === 'home' ? '' : 'hidden' }} flex-1 flex flex-col overflow-hidden relative">
        <!-- Arena dos 3 Lançamentos Reais em 100vh Sem Rolagem Cega (Idêntica ao TSX) -->
        <x-shell.arena :work="$hero" :roll="$featuredRoll" />
    </section>

    <!-- PALCO 2: VIEW EXPLORAR (Limpo em Linha Única na Navbar no Desktop + Barra Responsiva Completa no Mobile) -->
    <section id="view-explore" class="view-stage {{ $initialTab === 'explore' ? '' : 'hidden' }} flex-1 min-h-0 flex flex-col gap-2.5 sm:gap-3 p-3 sm:p-4 overflow-hidden">
        <!-- BARRA MOBILE DE BUSCA E PÍLULAS ONTOLÓGICAS (Visível em celulares < 768px onde a navbar compacta as oculta) -->
        <div class="flex md:hidden flex-col gap-2 flex-none">
            <div class="flex items-center gap-2 px-3 py-2 rounded-2xl border border-theme-default bg-theme-pill text-xs focus-within:border-theme-highlight transition-all">
                <svg class="w-4 h-4 text-theme-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input type="text"
                       id="mobile-search-input" data-i18n-placeholder="search.placeholder"
                       placeholder="Buscar universo, obra, mangá, arco, autor, música..."
                       class="bg-transparent border-none outline-none flex-1 text-xs text-white placeholder-slate-500 font-medium"
                       oninput="window.syncSearch(this.value)">
            </div>
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px] font-mono">
                <button type="button" onclick="window.setExploreKind('universe')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="universe">
                    <span>🌌</span> <span data-i18n="entity.universe">Universo</span>
                </button>
                <button type="button" onclick="window.setExploreKind('work')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm whitespace-nowrap shrink-0" data-kind="work">
                    <span>🎬</span> <span data-i18n="entity.work">Obra</span>
                </button>
                <button type="button" onclick="window.setExploreKind('manga')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="manga">
                    <span>📖</span> <span data-i18n="entity.manga">Mangá</span>
                </button>
                <button type="button" onclick="window.setExploreKind('arc')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="arc">
                    <span>📜</span> <span data-i18n="entity.arc">Arco</span>
                </button>
                <button type="button" onclick="window.setExploreKind('author')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="author">
                    <span>✍️</span> <span data-i18n="entity.author">Autor</span>
                </button>
                <button type="button" onclick="window.setExploreKind('director')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="director">
                    <span>🎥</span> <span data-i18n="entity.director">Diretor</span>
                </button>
                <button type="button" onclick="window.setExploreKind('studio')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="studio">
                    <span>🏢</span> <span data-i18n="entity.studio">Produtora</span>
                </button>
                <button type="button" onclick="window.setExploreKind('music')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0" data-kind="music">
                    <span>🎵</span> <span data-i18n="entity.music">Música</span>
                </button>
            </div>
        </div>

        <!-- Barra de Cabeçalho do Explorar (Contador e Indicador de Filtro Ativo) -->
        <div class="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl border border-theme-default bg-theme-card backdrop-blur-xl flex items-center justify-between flex-none">
            <div class="flex items-center gap-2 text-[11px] sm:text-xs font-mono text-theme-muted truncate">
                <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-state-canon,#10B981)] shrink-0"></span>
                <span id="client-explore-count" class="text-white font-bold">{{ number_format($explore['total'] ?? 39328, 0, ',', '.') }}</span>
                <span data-i18n="explore.results_count" class="truncate">resultados ordenados alfabeticamente</span>
            </div>
            <div class="hidden sm:block text-[11px] font-mono text-theme-muted shrink-0">
                <span data-i18n="explore.order_label">Ordem: </span><span class="text-theme-accent font-bold uppercase">Alfabética (A-Z)</span>
            </div>
        </div>

        <!-- Grade ModularHubTrack Paginada (Sem Rolagem Cega de Janela) -->
        <div class="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
            <div id="explore-cards-container" class="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 auto-rows-fr gap-3 overflow-y-auto no-scrollbar pb-2">
                <div class='col-span-full py-20 flex flex-col items-center justify-center gap-4 text-theme-muted'><div class='w-10 h-10 border-2 border-theme-accent border-t-transparent rounded-full animate-spin'></div><span class='text-xs font-mono font-bold uppercase tracking-wider text-theme-accent animate-pulse'>Carregando CatÃ¡logo Unificado...</span></div>
            </div>

            <!-- Navegação de Páginas do Explorar -->
            <nav class="flex justify-center items-center gap-4 shrink-0 py-2 border-t border-white/5">
                <button type="button"
                        id="explore-btn-prev"
                        onclick="window.stepExplorePage(-1)"
                        class="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span id="explore-page-label" class="text-xs font-mono opacity-80 text-white">
                    1 / 1
                </span>
                <input type="number"
                       id="explore-page-input"
                       min="1"
                       placeholder="Pág."
                       title="Ir para página"
                       onkeydown="if (event.key === 'Enter') { window.jumpExplorePage(this.value); this.value = ''; }"
                       class="w-16 px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-xs font-mono text-center text-white focus:outline-none focus:border-theme-accent" />
                <button type="button"
                        id="explore-btn-next"
                        onclick="window.stepExplorePage(1)"
                        class="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </nav>
        </div>
    </section>

    @include('partials.history-and-launches-tabs')

    <!-- PALCO 3: VIEW CALENDÁRIO (CalendarHeader + CalendarWorkCard Paginado) -->
    <section id="view-calendar" class="view-stage hidden h-full flex flex-col justify-between gap-3 p-4 overflow-hidden">
        <!-- Header Oficial do Calendário (CalendarHeader.tsx) -->
        <div class="p-4 rounded-3xl border border-theme-default bg-theme-card backdrop-blur-xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 flex-none">
            <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-2xl border border-theme-accent/30 bg-[#0E1118] text-theme-accent backdrop-blur-md">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <div class="flex items-center gap-1 p-1 rounded-2xl bg-[#0E1118]/80 border border-theme-default text-xs font-mono">
                    <button type="button" data-cal-media="anime" onclick="window.setCalendarMediaFilter('anime')" class="cal-media-btn px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer bg-theme-accent text-theme-inverse shadow-sm">Animes</button>
                    <span class="w-px h-4 bg-white/15 mx-0.5"></span>
                    <button type="button" data-cal-media="literature" onclick="window.setCalendarMediaFilter('literature')" class="cal-media-btn px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-theme-muted hover:text-white opacity-70 hover:opacity-100">Literatura</button>
                </div>
                @php
                    $allDays = [
                        ['id' => 'sundays', 'label' => 'DOM', 'full' => 'Domingo'],
                        ['id' => 'mondays', 'label' => 'SEG', 'full' => 'Segunda-feira'],
                        ['id' => 'tuesdays', 'label' => 'TER', 'full' => 'Terça-feira'],
                        ['id' => 'wednesdays', 'label' => 'QUA', 'full' => 'Quarta-feira'],
                        ['id' => 'thursdays', 'label' => 'QUI', 'full' => 'Quinta-feira'],
                        ['id' => 'fridays', 'label' => 'SEX', 'full' => 'Sexta-feira'],
                        ['id' => 'saturdays', 'label' => 'SÁB', 'full' => 'Sábado'],
                    ];
                    $todayNum = (int) date('w'); // 0 = Domingo ... 6 = Sábado
                    $todayItem = $allDays[$todayNum];
                    $rollingDays = [];
                    for ($i = 0; $i < 7; $i++) {
                        $idx = ($todayNum + $i) % 7;
                        $item = $allDays[$idx];
                        $item['isToday'] = ($i === 0);
                        $rollingDays[] = $item;
                    }
                @endphp
                <div>
                    <h2 id="calendar-header-title" class="text-sm font-black uppercase tracking-wider text-white">
                        Grade Semanal • {{ $todayItem['full'] }}
                    </h2>
                    <p id="calendar-header-count" class="text-[11px] font-mono text-theme-muted">
                        {{ count($calendar[$todayItem['id']] ?? []) }} lançamentos programados
                    </p>
                </div>
            </div>

            <!-- Seletor de Dias em Pílula Acrílica Alinhado à Direita -->
            <div id="calendar-days-container" class="flex items-center p-1 rounded-2xl border border-white/10 bg-[#0E1118] shadow-inner gap-1 overflow-x-auto no-scrollbar">
                @foreach($rollingDays as $d)
                    <button type="button"
                            onclick="window.selectCalendarDay('{{ $d['id'] }}', '{{ $d['full'] }}')"
                            class="cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 {{ $loop->first ? 'bg-theme-accent text-theme-inverse shadow-md scale-105' : 'text-theme-muted hover:text-white opacity-60 hover:opacity-100' }}"
                            data-day="{{ $d['id'] }}">
                        <span>{{ $d['isToday'] ? 'HOJE' : $d['label'] }}</span>
                    </button>
                @endforeach
            </div>
        </div>

        <!-- Grade Paginada de Cards do Calendário (CalendarWorkCard.tsx) -->
        <div class="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
            <div id="calendar-cards-container" class="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 auto-rows-fr gap-3 overflow-y-auto no-scrollbar pb-2">
                <div class='col-span-full py-16 text-center text-xs font-mono text-theme-muted animate-pulse'>Carregando grade semanal...</div>
            </div>

            <!-- Navegação de Páginas do Calendário -->
            <nav class="flex justify-center items-center gap-4 shrink-0 py-2 border-t border-white/5">
                <button type="button"
                        id="cal-btn-prev"
                        onclick="window.stepCalendarPage(-1)"
                        class="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span id="cal-page-label" class="text-xs font-mono opacity-80 text-white">
                    1 / 1
                </span>
                <button type="button"
                        id="cal-btn-next"
                        onclick="window.stepCalendarPage(1)"
                        class="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </nav>
        </div>
    </section>

    <!-- PALCO 4: PALCO DE SOBREPOSIÇÃO BLADE (Context Stage Server-Driven) -->
    <div id="layer-context" class="fixed inset-0 z-50 bg-[#06070a]/95 backdrop-blur-3xl flex flex-col opacity-0 pointer-events-none transition-all duration-300 overflow-hidden">
        <!-- Container onde o PHP injeta a parcial Blade 'partials.context-card' -->
        <div id="context-blade-container" class="w-full h-full flex flex-col">
            <div class="w-full h-full flex items-center justify-center font-mono text-xs text-theme-accent">
                <span class="w-6 h-6 border-2 border-theme-accent border-t-transparent rounded-full animate-spin"></span>
            </div>
        </div>
    </div>

    <!-- 5. MODAL DE PERFIL CANÔNICO DE 5 ABAS -->
    <x-modals.user-profile-modal :user="$user" :userPreferences="$userPreferences ?? []" />

    <!-- 6. MODAL EXTERNO DE TRAILER OFICIAL (100% LEGAL / YOUTUBE) -->
    <div id="modal-official-trailer" class="fixed inset-0 z-[70] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 opacity-0 pointer-events-none transition-all duration-200">
        <div class="w-full max-w-3xl rounded-3xl bg-theme-surface border border-theme-default shadow-2xl overflow-hidden flex flex-col">
            <div class="px-5 py-3.5 border-b border-theme-default flex items-center justify-between bg-theme-header">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-red-400">🎬</span>
                    <h4 id="official-trailer-title" class="text-xs font-mono font-bold uppercase tracking-wider text-white truncate">Trailer Oficial</h4>
                </div>
                <div class="flex items-center gap-2">
                    <a id="official-trailer-yt-link" href="#" target="_blank" rel="noopener noreferrer"
                       class="px-3 py-1 rounded-xl bg-red-500/20 hover:bg-red-500 border border-red-500/40 text-red-200 hover:text-white text-[10px] font-mono font-bold transition-all">
                        Abrir no YouTube ↗
                    </a>
                    <button type="button" onclick="window.closeOfficialTrailerModal()" class="p-1.5 rounded-xl bg-theme-pill text-theme-muted hover:text-white cursor-pointer">✕</button>
                </div>
            </div>
            <div id="official-trailer-body" class="w-full aspect-video bg-black flex items-center justify-center">
            </div>
        </div>
    </div>

    <!-- 7. MODAL EXTERNO DE EXECUÇÃO DE ADD-ON (VÍDEO PLAYER PRO / MANGA READER PRO / COMUNIDADE) -->
    <div id="modal-external-addon" class="fixed inset-0 z-[75] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-0 sm:p-0.5 opacity-0 pointer-events-none transition-all duration-200" style="box-sizing: border-box;">
        <div style="width: 100vw; height: 100vh; max-height: 100vh; max-width: 100vw; display: flex; flex-direction: column; overflow: hidden; position: relative;" class="bg-theme-surface sm:rounded-2xl border border-theme-default shadow-2xl">
            <div class="px-3 sm:px-4 py-1.5 border-b border-theme-default flex items-center justify-between bg-theme-header shrink-0" style="height: 42px; min-height: 42px; box-sizing: border-box;">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span id="external-addon-icon" class="text-theme-accent text-sm">⚡</span>
                    <div class="min-w-0">
                        <h4 id="external-addon-title" class="text-xs font-mono font-bold uppercase tracking-wider text-white truncate">Execução via Add-on Externo</h4>
                        <p id="external-addon-subtitle" class="text-[10px] font-mono text-theme-muted truncate">Anirium+ Service / Community Addon</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button type="button" onclick="window.closeExternalAddonModal(); window.openProfileModal(); window.switchProfileTab('addons');"
                            class="px-2.5 py-1 rounded-xl bg-theme-pill border border-theme-default text-[10px] font-mono font-bold text-theme-accent hover:text-white cursor-pointer">
                        ⚙️ Add-ons
                    </button>
                    <button type="button" onclick="window.closeExternalAddonModal()" class="px-2.5 py-1 rounded-xl bg-theme-pill text-theme-muted hover:text-white hover:bg-rose-500/20 text-xs font-bold cursor-pointer transition-colors" title="Fechar / Sair do Modo Player">✕ Sair</button>
                </div>
            </div>
            <div id="external-addon-viewport" style="flex: 1 1 0%; width: 100%; height: calc(100vh - 42px); min-height: 0; background: #000; position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 0; margin: 0;">
            </div>
        </div>
    </div>

    @push('scripts')
    <script>
        // PROCESSAMENTO DE AUTENTICACAO GOOGLE OAUTH (#id_token=...) E VERIFICACAO DE IDADE (+18)
        (function handleGoogleOAuthHash() {
            if (typeof window === 'undefined') return;

            function decodeJwtPayload(token) {
                try {
                    const parts = String(token || '').split('.');
                    if (parts.length < 2) return null;
                    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                    while (base64.length % 4 !== 0) {
                        base64 += '=';
                    }
                    const binary = window.atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i += 1) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    const json = typeof TextDecoder !== 'undefined'
                        ? new TextDecoder('utf-8').decode(bytes)
                        : decodeURIComponent(escape(binary));
                    const parsed = JSON.parse(json);
                    return parsed && typeof parsed === 'object' ? parsed : null;
                } catch (e) {
                    return null;
                }
            }

            function escapeHtml(value) {
                return String(value ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            function safeAvatarUrl(rawUrl, fallbackName) {
                const candidate = String(rawUrl || '').trim();
                if (/^https?:\/\//i.test(candidate)) {
                    return candidate;
                }
                return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(fallbackName || 'User') + '&background=ef4444&color=fff&bold=true';
            }

            const hash = window.location.hash;
            if (hash && (hash.includes('id_token=') || hash.includes('access_token=') || hash.includes('state=age_verify'))) {
                const params = new URLSearchParams(hash.substring(1));
                const state = params.get('state') || '';
                const idToken = params.get('id_token');
                const accessToken = params.get('access_token');
                const oauthError = params.get('error');
                window.history.replaceState(null, '', window.location.pathname + window.location.search);

                if (state.startsWith('age_verify:')) {
                    window.__pendingGoogleAgeVerify = {
                        state: state,
                        idToken: idToken || '',
                        accessToken: accessToken || '',
                        error: oauthError || ''
                    };
                    return;
                }

                if (idToken) {
                    const authSlot = document.getElementById('header-auth-slot');
                    const previousSlotHtml = authSlot ? authSlot.innerHTML : null;
                    const jwtClaims = decodeJwtPayload(idToken);
                    if (authSlot) {
                        const fallbackEmail = String(jwtClaims?.email || '').trim();
                        const optimisticName = String(jwtClaims?.name || (fallbackEmail ? fallbackEmail.split('@')[0] : 'Conectando...')).trim() || 'Conectando...';
                        const optimisticAvatar = safeAvatarUrl(jwtClaims?.picture, optimisticName);
                        authSlot.innerHTML = `
                            <div class="relative flex items-center gap-3 px-3 py-1 rounded-full border border-white/10 bg-[#0E1118]/80 animate-pulse">
                                <div class="relative w-9 h-9 flex items-center justify-center">
                                    <img src="${escapeHtml(optimisticAvatar)}"
                                         alt="${escapeHtml(optimisticName)}"
                                         class="w-8 h-8 rounded-full object-cover">
                                </div>
                                <div class="flex flex-col text-left">
                                    <span class="text-xs font-bold text-white leading-tight max-w-[120px] truncate">${escapeHtml(optimisticName)}</span>
                                    <span class="text-[9px] font-mono text-theme-accent leading-none mt-0.5">Conectando...</span>
                                </div>
                            </div>
                        `;
                    }

                    const restoreSlot = () => {
                        if (authSlot && previousSlotHtml !== null) {
                            authSlot.innerHTML = previousSlotHtml;
                        }
                    };

                    fetch('/api/auth/google', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-CSRF-TOKEN': '{{ csrf_token() }}'
                        },
                        body: JSON.stringify({ credential: idToken })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.success) {
                            window.location.reload();
                        } else {
                            restoreSlot();
                            console.error('[Anirium Auth] Falha na validacao do token Google:', data);
                        }
                    })
                    .catch(err => {
                        restoreSlot();
                        console.error('[Anirium Auth] Erro de rede ao autenticar com o Google:', err);
                    });
                }
            }
        })();
    </script>
    <script>
        // ESTADO GLOBAL REATIVO DO ANIRIUM
        window.heroRoll = @json($featuredRoll);
        window.heroIndex = 0;
        window.currentUser = @json($frontendUser);
        window.userPreferences = @json($userPreferences ?? []);
        
        // Catálogo e Calendário na máquina do cliente
        // Carrega inicialmente os itens rápidos e em background sincroniza o acervo completo de 33.390 obras
        window.clientCatalog = @json($explore['items']);
        window.calendarData = @json($calendar);
        window.adultTitlesSet = new Set();
        window.scheduleIdle = window.requestIdleCallback || function(cb) { return setTimeout(cb, 300); };
        window.scheduleIdle(() => {
            fetch('/data/adult_titles.json').then(r => r.json()).then(titles => {
                if (Array.isArray(titles)) {
                    titles.forEach(t => window.adultTitlesSet.add(t.toLowerCase().trim()));
                    if (window.currentTab === 'explore') window.runClientSideCatalogFilter();
                    if (window.currentTab === 'calendar') window.renderCalendarPage();
                }
            }).catch(() => {});
        });
        // Detecta dinamicamente o dia da semana atual no fuso do usuário (0: Domingo, 1: Segunda... 6: Sábado)
        const dayNames = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
        const dayFullNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const dayLabels = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
        const todayIdx = new Date().getDay();
        window.currentCalDay = dayNames[todayIdx];
        window.currentCalDayFull = dayFullNames[todayIdx];
        window.calPage = 1;
        window.explorePage = 1;
        const PAGE_SIZE = 12;

        // Renderiza deterministicamente a barra de dias para o fuso local do navegador do usuário
        window.initRollingDaysBar = function() {
            const bar = document.getElementById('calendar-days-container') || document.getElementById('calendar-days-bar');
            if (!bar) return;
            const clientToday = new Date().getDay();
            let html = '';
            for (let i = 0; i < 7; i++) {
                const idx = (clientToday + i) % 7;
                const dId = dayNames[idx];
                const dFull = dayFullNames[idx];
                const isSelected = (dId === window.currentCalDay);
                const label = (i === 0) ? 'HOJE' : dayLabels[idx];
                html += `
                    <button type="button"
                            onclick="window.selectCalendarDay('${dId}', '${dFull}')"
                            class="cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${isSelected ? 'bg-theme-accent text-theme-inverse shadow-md scale-105' : 'text-theme-muted hover:text-white opacity-60 hover:opacity-100'}"
                            data-day="${dId}">
                        <span>${label}</span>
                    </button>
                `;
            }
            bar.innerHTML = html;
        };

        window.clientStatusFilter = 'all';

        // Local-First Catalog Engine via IndexedDB (Zero bloqueio de thread, Zero JSON de 34MB)
        const DB_NAME = 'anirium_local_catalog';
        const DB_VERSION = 7;
        const STORE_NAME = 'works';

        function openCatalogDB() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (db.objectStoreNames.contains(STORE_NAME)) {
                        db.deleteObjectStore(STORE_NAME);
                    }
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('format', 'format', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        }

        window.fullCatalogSynced = false;
        window.fullCatalogSyncPromise = null;

        window.ensureFullCatalogSynced = function() {
            if (window.fullCatalogSynced) return Promise.resolve();
            if (window.fullCatalogSyncPromise) return window.fullCatalogSyncPromise;

            window.fullCatalogSyncPromise = (async () => {
                try {
                    if (window.AniriumCatalogSSOT) {
                        await window.AniriumCatalogSSOT.boot();
                        const ssotWorks = window.AniriumCatalogSSOT.getWorks();
                        if (Array.isArray(ssotWorks) && ssotWorks.length > 0) {
                            window.clientCatalog = ssotWorks;
                            window.kindShardsCache['work'] = ssotWorks;
                            window.fullCatalogSynced = true;
                            if (window.currentTab === 'explore') {
                                window.runClientSideCatalogFilter();
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[Anirium Engine] Falha durante sincronização do catálogo:', err);
                }
            })();

            return window.fullCatalogSyncPromise;
        };

        // Libera o palco imediatamente (Hero e 24 itens do Explore já estão no SSR)
        if (window.hideGlobalSiteLoader) {
            window.hideGlobalSiteLoader();
        }

        // 1. GERENCIADOR DE ABAS DA TOPBAR (Home, Explorar, Calendário)
        window.stopActivePlayerProIframe = function() {
            document.querySelectorAll('#anirium-player-pro-iframe').forEach(iframe => {
                try { iframe.src = 'about:blank'; } catch (e) {}
                try { iframe.remove(); } catch (e) {}
            });
            document.querySelectorAll('#anirium-player-pro-video').forEach(v => {
                try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
            });
        };

        window.switchTab = function(tab) {
    if (tab !== 'context' && typeof window.stopActivePlayerProIframe === 'function') {
        window.stopActivePlayerProIframe();
    }
    window.currentTab = tab;
    document.querySelectorAll('.view-stage').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${tab}`);
    if (target) target.classList.remove('hidden');

    const isExplore = (tab === 'explore');

    ['home', 'explore', 'calendar', 'history', 'launches'].forEach(k => {
        const btn = document.getElementById(`top-nav-${k}`);
        if (btn) {
            const spanText = btn.querySelector('span');
            if (k === tab) {
                if (spanText) {
                    spanText.className = "inline";
                    spanText.style.display = "";
                }
                btn.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer bg-theme-accent text-theme-inverse shadow-md";
            } else {
                if (spanText) {
                    spanText.className = "hidden";
                    spanText.style.display = "none";
                }
                btn.className = "flex items-center justify-center p-2 rounded-full transition-all duration-300 font-semibold cursor-pointer text-theme-muted hover:text-white";
            }
        }
    });

    if (tab === 'explore') {
        window.showExploreFilters();
        window.runClientSideCatalogFilter();
        if (typeof window.ensureFullCatalogSynced === 'function') window.ensureFullCatalogSynced();
    } else {
        window.hideExploreFilters();
    }
    if (tab === 'calendar') window.renderCalendarPage();
    if (tab === 'history') window.renderHistoryTab?.();
    if (tab === 'launches') window.renderLaunchesTab?.();
};

        // 2. DERIVAÇÃO DETERMINÍSTICA DO HERO ROLL PELO CALENDÁRIO E HORÁRIO ATUAL (Playhead Contínuo)
        // FILTRO GLOBAL DETERMINÍSTICO DE PORNOGRAFIA / ADULTO (+18 Verificado por Padrão)
        window.isAdultContentAllowed = function() {
            return Boolean(
                window.currentUser
                && window.currentUser.age_verified === true
                && window.currentUser.adult_content_enabled === true
            );
        };

        window.adultShardsCache = window.adultShardsCache || {};
        window.adultShardsPromises = window.adultShardsPromises || {};
        window.syncAdultShardsIfAllowed = async function() {
            window.adultShardsCache = {};
            if (window.AniriumCatalogSSOT) {
                await window.AniriumCatalogSSOT.boot();
            }
            if (window.currentTab === 'explore') {
                window.runClientSideCatalogFilter();
            }
        };

        window.isAdultEntity = function(item) {
            if (!item) return false;
            if (item.is_adult === true || item.is_adult === 1 || item.is_adult === '1') return true;
            const fmt = (item.format || '').toUpperCase();
            if (fmt === 'HENTAI' || fmt === 'DOUJINSHI' || fmt === 'EROTICA') return true;
            const title = (item.title || item.name || '').toLowerCase().trim();
            if (window.adultTitlesSet && window.adultTitlesSet.has(title)) return true;
            const rels = item.rel_works || [];
            if (window.adultTitlesSet && Array.isArray(rels)) {
                for (let i = 0; i < rels.length; i++) {
                    const rw = (rels[i] || '').toLowerCase().trim();
                    if (rw && window.adultTitlesSet.has(rw)) return true;
                }
            }
            const relsStr = rels.join(' ').toLowerCase();
            const adultKeywords = /\b(hentai|erotica|ecchi|doujinshi|ero-anime|18\+|nsfw|r18|r-18|smut|yaoi|yuri|sukumizu|oppai|futanari|milf|chikan|netorare|ntr|ahegao|rape|incest|creampie|blowjob|anal|bondage|bdsm|uncensored|x-rated|bakunyuu|kyonyuu|kairaku|chijoku|inma|inran|taimanin|succubus|ejaculation|orgasm|dildo|masturbation|hardcore|pako|off-pako|seiyoku|sex|sexual|porno|eromanga|furete\s*mo\s*ii\s*yo)\b/i;
            if (adultKeywords.test(title)) return true;
            if (adultKeywords.test(relsStr)) return true;
            return false;
        };

        window.deriveHeroRollFromCalendar = function() {
            if (!window.calendarData) return;
            const now = new Date();
            const currentDayIdx = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
            const nowHour = String(now.getHours()).padStart(2, '0');
            const nowMin = String(now.getMinutes()).padStart(2, '0');
            const nowTimeStr = `${nowHour}:${nowMin}`;

            const daysOrder = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
            const roll = [];

            // 1. Obras de hoje que já atingiram o horário de exibição (ordenadas da mais recente para a mais antiga)
            const todayKey = daysOrder[currentDayIdx];
            const allowAdult = window.isAdultContentAllowed();
            const todayItems = (window.calendarData[todayKey] || []).filter(item => {
                if (window.isLiteratureItem && window.isLiteratureItem(item)) return false;
                if (!allowAdult && window.isAdultEntity(item)) return false;
                return item.time && item.time !== 'TBA' && item.time <= nowTimeStr;
            });
            todayItems.sort((a, b) => b.time.localeCompare(a.time));
            roll.push(...todayItems);

            // 2. Se não completou 3, retrocede pelos dias anteriores na linha do tempo contínua da semana
            for (let offset = 1; offset < 7 && roll.length < 3; offset++) {
                const prevIdx = (currentDayIdx - offset + 7) % 7;
                const prevKey = daysOrder[prevIdx];
                const prevItems = (window.calendarData[prevKey] || []).filter(item => {
                    if (window.isLiteratureItem && window.isLiteratureItem(item)) return false;
                    if (!allowAdult && window.isAdultEntity(item)) return false;
                    return item.time && item.time !== 'TBA';
                });
                prevItems.sort((a, b) => b.time.localeCompare(a.time));
                roll.push(...prevItems);
            }

            if (roll.length > 0) {
                const nextRoll = roll.slice(0, 3);
                const firstSame = window.heroRoll && window.heroRoll[0] && String(window.heroRoll[0].id) === String(nextRoll[0].id);
                if (firstSame && window.heroRoll[0].synopsis && !nextRoll[0].synopsis) {
                    nextRoll[0].synopsis = window.heroRoll[0].synopsis;
                }
                window.heroRoll = nextRoll;
                if (!firstSame) window.setHeroIndex(0);
            }
        };

        // SWITCHER DE HERO ROLL NA HOME
        window.setHeroIndex = function(idx) {
            if (!window.heroRoll || !window.heroRoll[idx]) return;
            window.heroIndex = idx;
            const item = window.heroRoll[idx];

            document.getElementById('hero-title').innerText = item.title;
            const rawSyn = (item.synopsis || '').replace(/<[^>]*>?/gm, ''); document.getElementById('hero-synopsis').innerText = rawSyn;
            const epNum = item.latest_episode || item.episode || item.episode_count || 1;
            document.getElementById('hero-ep-number').innerText = epNum;
            document.getElementById('hero-btn-ep').innerText = epNum;
            document.getElementById('hero-badge-format').innerText = `${item.format || 'TV'} • ${item.year || '2026'}`;
            const btnPlay = document.getElementById('hero-btn-play');
            btnPlay.setAttribute('data-nav-type', 'work');
            btnPlay.setAttribute('data-nav-id', item.id);
            btnPlay.setAttribute('data-nav-label', encodeURIComponent(item.title || ''));
            btnPlay.onclick = function() { window.handleCardNavClick(this); };

            const btnDetails = document.getElementById('hero-btn-details');
            if (btnDetails) {
                btnDetails.setAttribute('data-nav-type', 'work');
                btnDetails.setAttribute('data-nav-id', item.id);
                btnDetails.setAttribute('data-nav-label', encodeURIComponent(item.title || ''));
                btnDetails.onclick = function() { window.handleCardNavClick(this); };
            }
            
            const aura = document.getElementById('hero-aura-bloom');
            if (aura && item.image) aura.style.backgroundImage = `url('${item.image}')`;
            const poster = document.getElementById('hero-poster-img');
            if (poster && item.image) poster.src = item.image;
            const pTitle = document.getElementById('hero-poster-title');
            if (pTitle) pTitle.innerText = item.title;

            const counter = document.getElementById('hero-roll-counter');
            if (counter) counter.innerText = `${idx + 1} / ${window.heroRoll.length}`;

            const container = document.getElementById('hero-pills-container');
            if (container && window.heroRoll.length > 0) {
                container.innerHTML = window.heroRoll.map((rItem, i) => `
                    <button type="button"
                            id="hero-roll-pill-${i}"
                            onclick="window.setHeroIndex(${i})"
                            class="hero-roll-pill h-2 rounded-full transition-all duration-300 cursor-pointer ${i === idx ? 'w-8 bg-theme-accent' : 'w-2.5 bg-theme-muted/40 hover:bg-theme-muted'}"
                            title="${(rItem.title || '').replace(/"/g, '&quot;')}">
                    </button>
                `).join('');
            } else {
                document.querySelectorAll('.hero-roll-pill').forEach((pill, i) => {
                    pill.className = i === idx
                        ? "hero-roll-pill h-2 rounded-full transition-all duration-300 cursor-pointer w-8 bg-theme-accent"
                        : "hero-roll-pill h-2 rounded-full transition-all duration-300 cursor-pointer w-2.5 bg-theme-muted/40 hover:bg-theme-muted";
                });
            }
        };

        window.isLiteratureItem = function(item) {
            if (!item) return false;
            if (item.media === 'literature' || item.media === 'manga' || item.media === 'novel') return true;
            const fmt = String(item.format || '').toUpperCase();
            return ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'].includes(fmt);
        };

        window.stepHeroRoll = function(step) {
            if (!window.heroRoll || window.heroRoll.length === 0) return;
            let next = (window.heroIndex + step) % window.heroRoll.length;
            if (next < 0) next = window.heroRoll.length - 1;
            window.setHeroIndex(next);
        };

        if (!window._heroAutoRotateTimer) {
            window._heroAutoRotateTimer = setInterval(() => {
                if (document.hidden) return;
                if (window.currentTab !== 'home') return;
                if (Array.isArray(window.navStack) && window.navStack.length > 0) return;
                if (window.heroRoll && window.heroRoll.length > 1) {
                    window.stepHeroRoll(1);
                }
            }, 8000);
        }

        window.scheduleNextHomeRelease = function() {
            if (window._nextHomeReleaseTimeout) {
                clearTimeout(window._nextHomeReleaseTimeout);
                window._nextHomeReleaseTimeout = null;
            }
            if (!window.calendarData) return;
            const daysOrder = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
            const now = new Date();
            const todayKey = daysOrder[now.getDay()];
            const allowAdult = window.isAdultContentAllowed();
            const nowMs = now.getTime();
            let nextReleaseMs = null;

            for (const item of (window.calendarData[todayKey] || [])) {
                if (window.isLiteratureItem && window.isLiteratureItem(item)) continue;
                if (!allowAdult && window.isAdultEntity(item)) continue;
                if (!item.time || item.time === 'TBA' || !/^\d{2}:\d{2}$/.test(item.time)) continue;
                const [hh, mm] = item.time.split(':').map(Number);
                const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0).getTime();
                if (candidate > nowMs && (nextReleaseMs === null || candidate < nextReleaseMs)) {
                    nextReleaseMs = candidate;
                }
            }

            // Se não há mais lançamentos hoje, agenda para a virada da meia-noite (00:00:01)
            if (nextReleaseMs === null) {
                nextReleaseMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0).getTime();
            }

            const delayMs = Math.max(1000, nextReleaseMs - nowMs);
            window._nextHomeReleaseTimeout = setTimeout(() => {
                if (typeof window.deriveHeroRollFromCalendar === 'function') {
                    window.deriveHeroRollFromCalendar();
                }
                if (window.currentTab === 'calendar' && typeof window.renderCalendarPage === 'function') {
                    window.renderCalendarPage();
                }
                window.scheduleNextHomeRelease();
            }, delayMs);
        };
        window.scheduleNextHomeRelease();

        // CONTROLE DE VISIBILIDADE DAS PÍLULAS DA NAVBAR (Aparecem só ao focar na busca ou abrir o Explorar)
        window.showExploreFilters = function() {
            const container = document.getElementById('topbar-pills-container');
            if (container) {
                container.classList.remove('hidden');
                container.classList.add('flex');
            }
        };

        window.hideExploreFilters = function() {
            if (window.currentTab === 'explore') return; // Mantém visível se estiver na tela de Explorar
            const container = document.getElementById('topbar-pills-container');
            if (container) {
                container.classList.add('hidden');
                container.classList.remove('flex');
            }
        };

        // 3. EXPLORAR: FILTRAGEM DETERMINÍSTICA LOCAL POR KIND (Universo, Obra, Entidade)
        window.exploreKindFilter = 'work';

        window.kindShardsCache = window.kindShardsCache || {};
        window.setExploreKind = async function(kind) {
            window.exploreKindFilter = kind;
            document.querySelectorAll('.explore-kind-btn').forEach(btn => {
                const isTopbar = Boolean(btn.closest('#topbar-pills-container'));
                const label = btn.querySelector('.explore-kind-label') || btn.querySelector('span');
                if (btn.getAttribute('data-kind') === kind) {
                    btn.className = "explore-kind-btn flex items-center justify-center gap-1.5 px-2.5 py-1.5 md:py-1 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm whitespace-nowrap shrink-0";
                    if (label) {
                        label.classList.remove('hidden');
                        label.classList.add('inline');
                    }
                } else {
                    btn.className = isTopbar
                        ? "explore-kind-btn flex items-center justify-center gap-1.5 p-1.5 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0"
                        : "explore-kind-btn flex items-center gap-1.5 px-2.5 py-1.5 md:py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap shrink-0";
                    if (isTopbar && label) {
                        label.classList.add('hidden');
                        label.classList.remove('inline');
                    }
                }
            });
            window.explorePage = 1;

            // Fonte Única de Verdade (SSOT): todas as abas consultam diretamente a API do banco SQLite
            const container = document.getElementById('explore-cards-container');
            if (container) {
                container.innerHTML = '<div class="col-span-full py-16 flex flex-col items-center justify-center gap-3 text-theme-muted"><div class="w-8 h-8 border-2 border-theme-accent border-t-transparent rounded-full animate-spin"></div><span class="text-xs font-mono uppercase tracking-wider text-theme-accent">Carregando...</span></div>';
            }
            window.runClientSideCatalogFilter();
        };

        window.stepExplorePage = function(step) {
            window.explorePage = Math.max(1, (window.explorePage || 1) + step);
            window.runClientSideCatalogFilter();
        };

        window.jumpExplorePage = function(rawPage) {
            const p = parseInt(rawPage, 10);
            if (!Number.isFinite(p) || p < 1) return;
            window.explorePage = p;
            window.runClientSideCatalogFilter();
        };

        window.syncSearch = function(val) {
            const topInput = document.getElementById('topbar-search-input');
            const mobInput = document.getElementById('mobile-search-input');
            if (topInput && topInput.value !== val) topInput.value = val;
            if (mobInput && mobInput.value !== val) mobInput.value = val;
            window.explorePage = 1;
            window.runClientSideCatalogFilter();
        };

        window._serverCatalogAbort = null;
        window._serverCatalogTimer = null;
        window.runServerCatalogSearch = function(kind, query, page, allowAdult) {
            if (window._serverCatalogTimer) clearTimeout(window._serverCatalogTimer);
            const delay = query ? 180 : 0;
            window._serverCatalogTimer = setTimeout(async () => {
                if (window._serverCatalogAbort) window._serverCatalogAbort.abort();
                const controller = new AbortController();
                window._serverCatalogAbort = controller;
                const isWorkOrManga = (kind === 'work' || kind === 'manga');
                const params = new URLSearchParams({
                    page: String(page || 1),
                    adult: allowAdult ? '1' : '0',
                });
                let endpoint = '/api/catalog/entities';
                if (isWorkOrManga) {
                    endpoint = '/api/catalog/explore';
                    params.set('kind', kind);
                    if (query) {
                        params.set('q', query);
                    }
                } else {
                    params.set('kind', kind);
                    if (query) params.set('q', query);
                }
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                try {
                    const res = await fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                        window._renderExploreCards([], 0, 1);
                        return;
                    }
                    const data = await res.json();
                    if (controller.signal.aborted || window.exploreKindFilter !== kind) return;
                    const total = Number(data.total || 0);
                    const totalPages = Math.max(1, Number(data.pages || 1));
                    window.explorePage = Math.min(Math.max(1, Number(data.page || page || 1)), totalPages);
                    const mapped = (Array.isArray(data.items) ? data.items : []).map(w => {
                        const fmt = String(w.format || (kind === 'manga' ? 'MANGA' : 'TV')).toUpperCase();
                        const eps = w.episodes || w.episode_count || null;
                        let img = w.image || w.cover_image || w.poster || '';
                        if (!img && w.images_json) {
                            try {
                                const parsedImg = typeof w.images_json === 'string' ? JSON.parse(w.images_json) : w.images_json;
                                img = parsedImg?.jpg?.large_image_url || parsedImg?.jpg?.image_url || parsedImg?.webp?.large_image_url || parsedImg?.webp?.image_url || '';
                            } catch (e) {}
                        }
                        return {
                            id: w.work_id || w.id,
                            title: w.title || w.title_english || 'Sem título',
                            format: fmt,
                            status: w.status || 'COMPLETED',
                            image: img || '/assets/icons/actions/search.png',
                            episode_count: eps,
                            is_adult: Boolean(w.adult || w.is_adult),
                            kind,
                            subMeta: eps ? `${fmt} • ${eps} ${eps === 1 ? 'ep' : 'eps'}` : fmt,
                        };
                    });
                    window._renderExploreCards(mapped, total, totalPages);
                } catch (e) {
                    clearTimeout(timeoutId);
                    if (!controller.signal.aborted) {
                        console.warn('[Anirium Catalog SSOT] Erro na busca:', e);
                        window._renderExploreCards([], 0, 1);
                    }
                }
            }, delay);
        };

        window.runClientSideCatalogFilter = function() {
            const query = (document.getElementById('topbar-search-input')?.value || document.getElementById('mobile-search-input')?.value || '').toLowerCase().trim();
            // Trava +18 Anos é estritamente baseada na verificação + preferência da conta logada
            const allowAdult = window.isAdultContentAllowed();

            const kind = window.exploreKindFilter || 'work';
            if ((kind === 'work' || kind === 'manga') && window.AniriumCatalogSSOT && window.AniriumCatalogSSOT.isReady()) {
                const res = window.AniriumCatalogSSOT.queryExploreSql(kind, query, window.explorePage || 1, allowAdult);
                window.explorePage = res.page;
                window._renderExploreCards(res.items, res.total, res.pages);
                return;
            }
            if (['work', 'manga', 'universe', 'arc', 'author', 'director', 'studio', 'music'].includes(kind)) {
                window.runServerCatalogSearch(kind, query, window.explorePage, allowAdult);
                return;
            }

            let catalogSource = window.clientCatalog || [];
            if (allowAdult && (window.exploreKindFilter === 'work' || window.exploreKindFilter === 'manga')) {
                const extraAdult = window.adultShardsCache?.[window.exploreKindFilter];
                if (Array.isArray(extraAdult) && extraAdult.length > 0) {
                    const seenIds = new Set(catalogSource.map(entry => String(entry.id)));
                    const merged = [...catalogSource];
                    for (let i = 0; i < extraAdult.length; i++) {
                        const adultItem = extraAdult[i];
                        if (!seenIds.has(String(adultItem.id))) {
                            seenIds.add(String(adultItem.id));
                            merged.push(adultItem);
                        }
                    }
                    catalogSource = merged;
                } else {
                    window.syncAdultShardsIfAllowed(window.exploreKindFilter);
                }
            }

            let filtered = catalogSource.filter(item => {
                // FILTRO GLOBAL DE PORNOGRAFIA (Forçado por padrão em todo o sistema)
                if (!allowAdult && window.isAdultEntity(item)) return false;

                // Filtro Ontológico por Tipo Canônico de Entidade
                if (window.exploreKindFilter !== 'all') {
                    const itemKind = (item.kind || (item.universe_id ? 'universe' : (item.format === 'STUDIO' || item.format === 'PRODUCER' ? 'studio' : (item.format === 'DIRECTOR' ? 'director' : (item.format === 'AUTHOR' ? 'author' : (item.format === 'MUSIC' || item.format === 'TRACK' ? 'music' : (item.format === 'CHARACTER' ? 'character' : (item.format === 'ARC' ? 'arc' : 'work')))))))).toLowerCase();
                    const itemRole = (item.role || '').toLowerCase();

                    if (window.exploreKindFilter === 'universe') {
                        if (itemKind !== 'universe' && !item.universe_id && item.format !== 'FRANCHISE') return false;
                        // Regra Canônica: Não exibe universos puramente de mangá sem obras animadas no filtro de Universos
                        if (item.works_count !== undefined && item.works_count <= 0) return false;
                    } else if (window.exploreKindFilter === 'work') {
                        // Regra Canônica: Obras são estritamente animes/animações (TV, MOVIE, OVA, ONA, SPECIAL).
                        // Músicas (MUSIC), Mangás e outras mídias não pertencem a Obras.
                        const fmt = (item.format || '').toUpperCase();
                        if (fmt === 'MUSIC' || fmt === 'OST' || item.kind === 'track' || itemKind === 'music') return false;
                        if (itemKind !== 'work' && item.kind !== 'work') return false;
                        const isManga = item.kind === 'manga' || ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'].includes(fmt);
                        if (isManga) return false;
                    } else if (window.exploreKindFilter === 'manga') {
                        // Filtro Exclusivo de Mangá
                        const isManga = item.kind === 'manga' || itemKind === 'manga' || ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'].includes(item.format);
                        if (!isManga) return false;
                    } else if (window.exploreKindFilter === 'arc') {
                        if (itemKind !== 'arc' && item.format !== 'ARC') return false;
                    } else if (window.exploreKindFilter === 'author') {
                        if (itemKind !== 'author' && !itemRole.includes('author') && !itemRole.includes('writer')) return false;
                    } else if (window.exploreKindFilter === 'director') {
                        if (itemKind !== 'director' && !itemRole.includes('director')) return false;
                    } else if (window.exploreKindFilter === 'studio') {
                        if (itemKind !== 'studio' && item.kind !== 'studio' && item.kind !== 'company' && item.format !== 'STUDIO') return false;
                    } else if (window.exploreKindFilter === 'music') {
                        const fmt = (item.format || '').toUpperCase();
                        if (fmt === 'MUSIC' || fmt === 'OST' || item.kind === 'track' || itemKind === 'music') return true;
                        return false;
                    } else if (window.exploreKindFilter === 'character') {
                        if (itemKind !== 'character') return false;
                    }
                }

                // Busca Unificada no Campo da Navbar (Atua no título, títulos alternativos/sinônimos, formato e CORRELAÇÕES)
                if (query) {
                    const normText = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['"`´’]/g, '');
                    const normQ = normText(query);
                    const qTokens = normQ.split(/\s+/).filter(Boolean);
                    const cleanTitle = normText(item.title || item.name || '');
                    const cleanAlt = normText(item.alt || '');
                    const combinedText = cleanAlt ? `${cleanTitle} ${cleanAlt}` : cleanTitle;
                    
                    const titleMatch = combinedText.includes(normQ) || (qTokens.length > 0 && qTokens.every(t => combinedText.includes(t)));
                    const formatMatch = item.format && item.format.toLowerCase().includes(query);
                    
                    // Checa correlação direta de obras vinculadas (ex: Bleach -> Tite Kubo, Pierrot, Noriyuki Abe)
                    let correlationMatch = false;
                    if (item.rel_works && Array.isArray(item.rel_works)) {
                        correlationMatch = item.rel_works.some(rw => rw && normText(rw).includes(normQ));
                    }
                    if (!correlationMatch && item.best_work) {
                        correlationMatch = normText(item.best_work).includes(normQ);
                    }

                    if (!titleMatch && !formatMatch && !correlationMatch) return false;
                }

                return true;
            });

            // Ordenação: Se houver busca ativa, prioriza relevância do título (e títulos alternativos); caso contrário, Alfabética (A-Z)
            const normalizeSortKey = (t) => (t || '').toLowerCase().replace(/^[\s"'«»"''""_\-\.\[\]()!?~*#@]+/g, '');
            const normSearch = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['"`´’]/g, '');
            const normQuerySort = query ? normSearch(query) : '';
            filtered.sort((a, b) => {
                const titleA = (a.title || a.name || '').toLowerCase();
                const titleB = (b.title || b.name || '').toLowerCase();
                if (normQuerySort) {
                    const cleanA = normSearch(titleA);
                    const cleanB = normSearch(titleB);
                    const altA = normSearch(a.alt || '');
                    const altB = normSearch(b.alt || '');
                    const exactA = cleanA === normQuerySort ? 1 : 0;
                    const exactB = cleanB === normQuerySort ? 1 : 0;
                    if (exactA !== exactB) return exactB - exactA;
                    const startA = cleanA.startsWith(normQuerySort) ? 1 : 0;
                    const startB = cleanB.startsWith(normQuerySort) ? 1 : 0;
                    if (startA !== startB) return startB - startA;
                    const phraseA = (cleanA.includes(normQuerySort) || altA.includes(normQuerySort)) ? 1 : 0;
                    const phraseB = (cleanB.includes(normQuerySort) || altB.includes(normQuerySort)) ? 1 : 0;
                    if (phraseA !== phraseB) return phraseB - phraseA;
                }
                const keyA = normalizeSortKey(titleA);
                const keyB = normalizeSortKey(titleB);
                return keyA.localeCompare(keyB);
            });

            const total = filtered.length;
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            window.explorePage = Math.min(Math.max(1, window.explorePage), totalPages);

            const start = (window.explorePage - 1) * PAGE_SIZE;
            const paged = filtered.slice(start, start + PAGE_SIZE);
            if (!window.clientCatalog || window.clientCatalog.length === 0) {
                const container = document.getElementById('explore-cards-container');
                if (container) container.innerHTML = '<div class=\'col-span-full py-20 flex flex-col items-center justify-center gap-4 text-theme-muted\'><div class=\'w-10 h-10 border-2 border-theme-accent border-t-transparent rounded-full animate-spin\'></div><span class=\'text-xs font-mono font-bold uppercase tracking-wider text-theme-accent animate-pulse\'>Carregando Catálogo Unificado...</span></div>';
                return;
            }
            window._renderExploreCards(paged, total, totalPages);
        };

        window._renderExploreCards = function(paged, total, totalPages) {
            const container = document.getElementById('explore-cards-container');
            if (!container) return;
            const countLabel = document.getElementById('client-explore-count');
            if (countLabel) countLabel.innerText = total.toLocaleString('pt-BR');

            const pageLabel = document.getElementById('explore-page-label');
            if (pageLabel) pageLabel.innerText = `${window.explorePage} / ${totalPages}`;

            const prevBtn = document.getElementById('explore-btn-prev');
            const nextBtn = document.getElementById('explore-btn-next');
            if (prevBtn) prevBtn.disabled = window.explorePage <= 1;
            if (nextBtn) nextBtn.disabled = window.explorePage >= totalPages;

            if (paged.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full py-16 text-center flex flex-col items-center justify-center gap-2">
                        <span class="text-3xl">🔍</span>
                        <p class="text-sm font-mono text-theme-muted"><span data-i18n="state.no_works_filtered">Nenhuma obra corresponde aos filtros ativos no navegador.</span></p>
                    </div>
                `;
                return;
            }

            // Renderiza Cards Oficiais de Entidades Ontológicas (Determinístico e Específico por Entidade)
            container.innerHTML = paged.map(item => {
                const navType = item.kind || (item.universe_id ? 'universe' : (item.format === 'ARC' ? 'arc' : 'work'));
                const rawFormat = (item.format || (item.kind !== 'work' ? item.kind : '') || 'OBRA').toUpperCase();
                const badgeLabel = rawFormat === 'WORK' ? 'OBRA' : rawFormat;
                const subMeta = item.subMeta !== undefined ? item.subMeta : (item.role || (item.episode_count ? item.episode_count + ' eps' : (item.format || '')));
                const isArc = (item.kind === 'arc' || item.format === 'ARC');
                let statusMeta = '';
                let statusColorClass = 'text-theme-accent/80 font-bold';

                if (isArc) {
                    if (item.status === 'FILLER' || item.classification === 'filler') {
                        statusMeta = 'FILLER';
                        statusColorClass = 'text-[var(--color-state-filler,#F43F5E)] font-black';
                    } else if (item.status === 'MISTO' || item.classification === 'mixed') {
                        statusMeta = 'MISTO';
                        statusColorClass = 'text-[var(--color-state-mixed,#A855F7)] font-black';
                    } else {
                        statusMeta = 'CÂNON';
                        statusColorClass = 'text-[var(--color-state-canon,#10B981)] font-black';
                    }
                } else if (item.status === 'RELEASING') {
                    statusMeta = 'Em exibição';
                } else if (item.status === 'COMPLETED' || item.status === 'FINISHED') {
                    statusMeta = 'Completo';
                } else if (item.status === 'NOT_YET_RELEASED' || item.status === 'NOT_YET_AIRED') {
                    statusMeta = 'Em breve';
                    statusColorClass = 'text-amber-400 font-bold';
                } else if (item.track_type) {
                    statusMeta = item.track_type.toUpperCase();
                } else {
                    const fallbackStatus = (item.kind || item.format || '').toUpperCase();
                    statusMeta = fallbackStatus === 'WORK' ? 'OBRA' : fallbackStatus;
                }

                const safeTitle = encodeURIComponent(item.title || item.name || '');

                return `
                <div class="group relative flex flex-col rounded-2xl overflow-hidden border border-theme-default bg-theme-card transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:border-theme-highlight"
                     data-nav-type="${navType}"
                     data-nav-id="${item.id}"
                     data-nav-label="${safeTitle}"
                     onclick="window.handleCardNavClick(this)">
                    <div class="relative w-full aspect-[3/4] overflow-hidden bg-black/40">
                        <img src="${item.image || '/assets/icons/actions/search.png'}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onerror="this.src='/assets/icons/actions/search.png'" loading="lazy">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                        <span class="absolute top-2 left-2 text-[10px] font-black font-mono px-2 py-0.5 rounded-full bg-black/75 text-theme-accent border border-white/10 uppercase">
                            ${badgeLabel}
                        </span>
                        ${item.is_adult ? `
                        <span class="absolute bottom-2 left-2 text-[9px] font-black font-mono px-2 py-0.5 rounded-md bg-red-600/90 text-white border border-red-400/50 uppercase shadow-sm">
                            +18
                        </span>
                        ` : ''}
                        ${isArc ? `
                        <span class="absolute bottom-2 right-2 text-[9px] font-black font-mono px-2 py-0.5 rounded-md uppercase backdrop-blur-md border ${item.status === 'FILLER' || item.classification === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/25 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40' : (item.status === 'MISTO' || item.classification === 'mixed' ? 'bg-[var(--color-state-mixed,#A855F7)]/25 text-[var(--color-state-mixed,#A855F7)] border-[var(--color-state-mixed,#A855F7)]/40' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40')} shadow-sm">
                            ${statusMeta}
                        </span>
                        ` : ''}
                        <button type="button"
                                data-fav-id="${item.id}"
                                data-fav-type="${navType}"
                                data-fav-label="${safeTitle}"
                                onclick="window.handleCardFavClick(event, this)"
                                class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-white/10 flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${window.userPreferences && window.userPreferences[item.id] && window.userPreferences[item.id].bookmarked ? 'text-theme-accent border-theme-accent/40 shadow-sm' : 'text-theme-muted hover:text-theme-accent'}"
                                title="${window.currentUser ? 'Favoritar' : 'Faça login para favoritar'}">
                            ★
                        </button>
                    </div>
                    <div class="p-2.5 flex flex-col justify-between flex-1 gap-1">
                        <h4 class="text-xs font-bold text-theme-primary truncate group-hover:text-theme-accent transition-colors">
                            ${item.title || item.name || 'Entidade Sem Título'}
                        </h4>
                        <div class="flex items-center justify-between pt-1 border-t border-theme-default text-[10px] font-mono text-theme-muted">
                            <span class="truncate max-w-[120px]">${subMeta}</span>
                            <span class="${statusColorClass} uppercase shrink-0">${statusMeta}</span>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        };

        // 4. CALENDÁRIO: PAGINAÇÃO E CARDS OFICIAIS (CalendarHeader.tsx + CalendarWorkCard.tsx)
        window.selectCalendarDay = function(dayKey, dayFull) {
            window.currentCalDay = dayKey;
            window.currentCalDayFull = dayFull;
            window.calPage = 1;

            document.querySelectorAll('.cal-day-btn').forEach(btn => {
                if (btn.getAttribute('data-day') === dayKey) {
                    btn.className = "cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 bg-theme-accent text-theme-inverse shadow-md scale-105";
                } else {
                    btn.className = "cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 text-theme-muted hover:text-white opacity-60 hover:opacity-100";
                }
            });

            const title = document.getElementById('calendar-header-title');
            if (title) title.innerText = `Grade Semanal • ${dayFull}`;

            window.renderCalendarPage();
        };

        window.stepCalendarPage = function(step) {
            window.calPage += step;
            window.renderCalendarPage();
        };

        window.currentCalMedia = 'anime';
        window.setCalendarMediaFilter = function(media) {
            window.currentCalMedia = media === 'literature' ? 'literature' : 'anime';
            window.calPage = 1;
            document.querySelectorAll('.cal-media-btn').forEach(btn => {
                if (btn.getAttribute('data-cal-media') === window.currentCalMedia) {
                    btn.className = 'cal-media-btn px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer bg-theme-accent text-theme-inverse shadow-sm';
                } else {
                    btn.className = 'cal-media-btn px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-theme-muted hover:text-white opacity-70 hover:opacity-100';
                }
            });
            window.renderCalendarPage();
        };

        window.renderCalendarPage = function() {
            if (window.currentCalDayFull) {
                const headerTitle = document.getElementById('calendar-header-title');
                const mediaLabel = window.currentCalMedia === 'literature' ? 'Literatura' : 'Animes';
                if (headerTitle) headerTitle.innerText = `Grade Semanal • ${mediaLabel} • ${window.currentCalDayFull}`;
                
                document.querySelectorAll('.cal-day-btn').forEach(btn => {
                    if (btn.getAttribute('data-day') === window.currentCalDay) {
                        btn.className = "cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 bg-theme-accent text-theme-inverse shadow-md scale-105";
                    } else {
                        btn.className = "cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 text-theme-muted hover:text-white opacity-60 hover:opacity-100";
                    }
                });
            }

            const allowAdultCal = window.isAdultContentAllowed();
            const rawAll = (window.calendarData && window.calendarData[window.currentCalDay]) || [];
            const rawItems = rawAll.filter(item => {
                if (!allowAdultCal && window.isAdultEntity(item)) return false;
                const itemMedia = item.media === 'literature' ? 'literature' : 'anime';
                return itemMedia === (window.currentCalMedia || 'anime');
            });
            const countLabel = document.getElementById('calendar-header-count');
            if (countLabel) countLabel.innerText = `${rawItems.length} lançamentos programados`;

            const totalPages = Math.max(1, Math.ceil(rawItems.length / PAGE_SIZE));
            window.calPage = Math.min(Math.max(1, window.calPage), totalPages);

            const start = (window.calPage - 1) * PAGE_SIZE;
            const paged = rawItems.slice(start, start + PAGE_SIZE);

            const container = document.getElementById('calendar-cards-container');
            const pageLabel = document.getElementById('cal-page-label');
            if (pageLabel) pageLabel.innerText = `${window.calPage} / ${totalPages}`;

            const prevBtn = document.getElementById('cal-btn-prev');
            const nextBtn = document.getElementById('cal-btn-next');
            if (prevBtn) prevBtn.disabled = window.calPage <= 1;
            if (nextBtn) nextBtn.disabled = window.calPage >= totalPages;

            if (paged.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full py-16 text-center text-sm font-mono text-theme-muted">
                        <span data-i18n="state.no_anime_day">Nenhum anime neste dia da semana.</span>
                    </div>
                `;
                return;
            }

            // Playhead do Calendário Contínuo (Rolling Window):
            // O calendário é uma janela contínua dos próximos 7 dias (Hoje + 6 dias futuros).
            // Apenas o dia de HOJE divide entre já lançado e a ser lançado pelo relógio.
            // Todos os 6 dias seguintes são 100% futuros (Episódio futuro • Programado).
            const now = new Date();
            const currentDayIdx = now.getDay(); // 0 = Domingo, 1 = Segunda, 2 = Terça...
            const nowHour = String(now.getHours()).padStart(2, '0');
            const nowMin = String(now.getMinutes()).padStart(2, '0');
            const nowTimeStr = `${nowHour}:${nowMin}`;
            const daysOrder = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
            const selectedDayIdx = daysOrder.indexOf(window.currentCalDay);
            const isToday = (selectedDayIdx === currentDayIdx);

            // Renderiza Cards Fiéis a CalendarWorkCard.tsx com Estado do Episódio e Progresso do Usuário
            container.innerHTML = paged.map(item => {
                let isAired = false;
                let displayEpisode = item.episode || 1;

                if (isToday) {
                    // No dia de HOJE: o playhead verifica se já atingiu o horário
                    isAired = (item.time && item.time !== 'TBA' && item.time <= nowTimeStr);
                    displayEpisode = item.episode || 1;
                } else {
                    // Nos outros 6 dias seguintes: o dia é estritamente futuro!
                    // O episódio a ser exibido é o próximo episódio programado
                    isAired = false;
                    displayEpisode = (item.episode || 1) + 1;
                }

                // Checa se o usuário logado já assistiu ou está acompanhando
                const pref = window.userPreferences ? (window.userPreferences[item.id] || window.userPreferences[item.id.replace('work:', '')]) : null;
                const isWatched = pref && (pref.status === 'completed' || (pref.progress_seconds && pref.progress_seconds > 0));
                const isWatching = pref && pref.status === 'watching';

                const safeCalTitle = encodeURIComponent(item.title || '');

                return `
                <div class="group relative min-h-0 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0E1118]/80 text-left flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-theme-accent/40 cursor-pointer"
                     data-nav-type="work"
                     data-nav-id="${item.id}"
                     data-nav-label="${safeCalTitle}"
                     onclick="window.handleCardNavClick(this)">
                    <div class="relative w-full aspect-[4/3] overflow-hidden shrink-0 bg-black/20">
                        <img src="${item.image}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy">
                        
                        <!-- Horário de Exibição -->
                        <div class="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/75 backdrop-blur-md ${isAired ? 'text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' : 'text-theme-accent border border-theme-highlight'} shadow-sm">
                            <span>🕒 ${item.time || 'TBA'}</span>
                            ${isAired ? '<span class="text-[9px] bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] px-1 rounded uppercase tracking-wider font-extrabold"><span data-i18n="state.on_air">No Ar</span>' : ''}
                        </div>

                        <!-- Indicador de Status do Usuário Logado -->
                        ${isWatched ? `
                            <div class="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-theme-pill backdrop-blur-md text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30 shadow-sm" title="Você já assistiu este episódio" data-i18n-title="tooltip.watched">
                                <span>✓ Visto</span>
                            </div>
                        ` : (isWatching ? `
                            <div class="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-theme-pill backdrop-blur-md text-theme-accent border border-theme-accent/30 shadow-sm" title="Continuar de onde parou" data-i18n-title="tooltip.continue">
                                <span>▶ Em Progresso</span>
                            </div>
                        ` : '')}
                    </div>
                    <div class="p-2 min-w-0 flex flex-col justify-between flex-1 gap-1">
                        <div>
                            <strong class="text-xs line-clamp-1 block text-white group-hover:text-theme-accent transition-colors">
                                ${item.title}
                            </strong>
                            <div class="flex items-center justify-between mt-0.5">
                                <span class="text-[10px] font-mono font-medium ${isAired ? 'text-[var(--color-state-canon,#10B981)]' : 'text-theme-muted'} block">
                                    ${item.total_episode ? `Episódio ${displayEpisode} (${item.total_episode})` : `Episódio ${displayEpisode}`} ${isAired ? '• Lançado' : '• Programado'}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between text-[11px] font-mono opacity-60 text-theme-muted">
                            <span>${item.format || 'TV'}</span>
                            ${isWatched ? '<span class="text-[9px] text-[var(--color-state-canon,#10B981)] font-bold uppercase"><span data-i18n="state.watched">Assistido</span>' : (isAired ? '<span class="text-[9px] text-theme-accent font-bold uppercase"><span data-i18n="state.on_air">Disponível</span>' : '')}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        };

                // Helper para navegação segura contra aspas ou caracteres especiais
        window.handleCardNavClick = function(el) {
            const type = el.getAttribute('data-nav-type');
            const id = el.getAttribute('data-nav-id');
            const label = decodeURIComponent(el.getAttribute('data-nav-label') || '');
            window.pushNavigation(type, id, label);
        };

        window.handleCardFavClick = function(e, btn) {
            if (e) e.stopPropagation();
            const id = btn.getAttribute('data-fav-id');
            const type = btn.getAttribute('data-fav-type');
            const label = decodeURIComponent(btn.getAttribute('data-fav-label') || '');
            window.toggleCardFavorite(e, id, type, label);
        };

        // 5. PILHA DE NAVEGAÇÃO DETERMINÍSTICA DINÂMICA DO TGCODE (Histórico Vivo de Navegação pelas Entidades)
        window.navStack = [];

        window.pushNavigation = function(type, id, label) {
            // Se a mesma entidade já estiver no topo, não duplica
            const current = window.navStack[window.navStack.length - 1];
            if (current && current.id === id && current.type === type) return;
            if (typeof window.stopActivePlayerProIframe === 'function') {
                window.stopActivePlayerProIframe();
            }

            // Se o usuário clicar em um item anterior de sua própria jornada, retrocede até ele
            const existingIndex = window.navStack.findIndex(item => item.id === id && item.type === type);
            if (existingIndex !== -1) {
                window.navStack = window.navStack.slice(0, existingIndex + 1);
            } else {
                window.navStack.push({ type, id, label: label || type });
            }
            window.renderCurrentState();
        };

        window.navigateToHistoryIndex = function(index) {
            if (index < 0) {
                window.clearNavigation();
                return;
            }
            if (index < window.navStack.length) {
                window.navStack = window.navStack.slice(0, index + 1);
                window.renderCurrentState();
            }
        };

        window.popNavigation = function() {
            if (window.navStack.length > 0) {
                window.navStack.pop();
                window.renderCurrentState();
            }
        };

        window.clearNavigation = function() {
            window.navStack = [];
            window.renderCurrentState();
        };

        window.renderDynamicBreadcrumb = function() {
            const nav = document.getElementById('entity-dynamic-breadcrumb');
            if (!nav) return;

            let html = '<button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>';

            window.navStack.forEach((entry, idx) => {
                const isLast = (idx === window.navStack.length - 1);
                const displayLabel = entry.label || entry.type || 'Entidade';
                html += '<span class="opacity-40">❯</span>';
                if (isLast) {
                    html += `<span class="text-theme-accent font-bold truncate max-w-xs">${displayLabel}</span>`;
                } else {
                    html += `<button type="button" onclick="window.navigateToHistoryIndex(${idx})" class="hover:text-theme-accent transition-colors truncate max-w-xs cursor-pointer">${displayLabel}</button>`;
                }
            });

            nav.innerHTML = html;
        };

        const ENTITY_VIEW_SCHEMA_V = 'v13';
        window.entityHtmlCache = new Map();

        // ROLAGEM HORIZONTAL E ARRASTO (DRAG-TO-SCROLL) EM TODOS OS TRILHOS DE ENTIDADES E EPISÓDIOS
        window.scrollEntityRail = function(railId, direction) {
            const rail = document.getElementById(railId);
            if (!rail) return;
            const amount = Math.max(320, Math.round(rail.clientWidth * 0.72));
            rail.scrollBy({ left: direction * amount, behavior: 'smooth' });
        };

        window.initDraggableEntityRails = function(rootEl) {
            const scope = rootEl || document;
            scope.querySelectorAll('[data-draggable-rail="true"]').forEach(rail => {
                if (rail.dataset.dragBound === '1') return;
                rail.dataset.dragBound = '1';

                let isDown = false;
                let startX = 0;
                let scrollLeft = 0;
                let draggedDistance = 0;

                rail.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    if (e.target.closest('button, a, input, label')) return;
                    isDown = true;
                    draggedDistance = 0;
                    startX = e.pageX - rail.offsetLeft;
                    scrollLeft = rail.scrollLeft;
                    rail.style.scrollBehavior = 'auto';
                });

                rail.addEventListener('mouseleave', () => {
                    if (!isDown) return;
                    isDown = false;
                    rail.style.scrollBehavior = 'smooth';
                });

                rail.addEventListener('mouseup', () => {
                    if (!isDown) return;
                    isDown = false;
                    rail.style.scrollBehavior = 'smooth';
                });

                rail.addEventListener('mousemove', (e) => {
                    if (!isDown) return;
                    e.preventDefault();
                    const x = e.pageX - rail.offsetLeft;
                    const walk = (x - startX) * 1.4;
                    draggedDistance = Math.abs(walk);
                    rail.scrollLeft = scrollLeft - walk;
                });

                // Evita clique acidental em um episódio se o usuário estava arrastando o trilho
                rail.addEventListener('click', (e) => {
                    if (draggedDistance > 10) {
                        e.stopPropagation();
                        e.preventDefault();
                        draggedDistance = 0;
                    }
                }, true);

                // Converte roda vertical do mouse em rolagem horizontal suave quando sobre o trilho de episódios
                rail.addEventListener('wheel', (e) => {
                    if (rail.scrollWidth <= rail.clientWidth) return;
                    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                        e.preventDefault();
                        rail.scrollLeft += e.deltaY;
                    }
                }, { passive: false });
            });
        };

        window.renderCurrentState = async function() {
            if (typeof window.stopActivePlayerProIframe === 'function') {
                window.stopActivePlayerProIframe();
            }
            const contextLayer = document.getElementById('layer-context');
            if (window.navStack.length === 0) {
                contextLayer.classList.add('opacity-0', 'pointer-events-none');
                const contentEl = document.getElementById('context-dynamic-content');
                if (contentEl) contentEl.innerHTML = '';
                return;
            }

            const current = window.navStack[window.navStack.length - 1];
            contextLayer.classList.remove('opacity-0', 'pointer-events-none');
            window.AniriumSSE?.connect({ entityType: current.type, entityId: String(current.id) });
            
            const container = document.getElementById('context-blade-container');
            const isAdultAllowed = window.isAdultContentAllowed() ? '1' : '0';
            const cacheKey = `${ENTITY_VIEW_SCHEMA_V}:${current.type}:${current.id}:${isAdultAllowed}`;

            // LOCAL-FIRST: Renderização instantânea se já estiver no cache local da sessão
            if (window.entityHtmlCache.has(cacheKey)) {
                container.innerHTML = window.entityHtmlCache.get(cacheKey);
                container.querySelectorAll('script').forEach(s => {
                    try {
                        const newScript = document.createElement('script');
                        Array.from(s.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                        newScript.appendChild(document.createTextNode(s.innerHTML));
                        s.parentNode.replaceChild(newScript, s);
                    } catch (err) {}
                });
                window.renderDynamicBreadcrumb();
                window.syncAddonCapabilityButtons?.();
                window.initDraggableEntityRails?.(container);
                if (window.i18n) window.i18n.applyToDOM();
                return;
            }

            container.innerHTML = `
                <div class="w-full h-full flex items-center justify-center font-mono text-xs text-theme-accent">
                    <span class="w-6 h-6 border-2 border-theme-accent border-t-transparent rounded-full animate-spin"></span>
                </div>
            `;

            try {
                let endpoint = `/api/catalog/graph/work/${current.id}?render=blade&adult=${isAdultAllowed}&kind=${current.type || 'work'}&v=${ENTITY_VIEW_SCHEMA_V}`;
                if (current.type === 'manga' || current.type === 'work') {
                    endpoint = `/api/catalog/graph/work/${current.id}?render=blade&adult=${isAdultAllowed}&kind=${current.type}&v=${ENTITY_VIEW_SCHEMA_V}`;
                } else if (current.type === 'episode') {
                    endpoint = `/api/catalog/graph/episode/${current.id}?render=blade&adult=${isAdultAllowed}&v=${ENTITY_VIEW_SCHEMA_V}`;
                } else if (current.type === 'universe') {
                    endpoint = `/api/catalog/graph/universe/${current.id}?render=blade&adult=${isAdultAllowed}&v=${ENTITY_VIEW_SCHEMA_V}`;
                } else if (current.type === 'arc') {
                    endpoint = `/api/catalog/graph/arc/${current.id}?render=blade&adult=${isAdultAllowed}&v=${ENTITY_VIEW_SCHEMA_V}`;
                } else if (current.type === 'author' || current.type === 'director' || current.type === 'creator') {
                    endpoint = `/api/catalog/graph/creator/${current.id}?render=blade&adult=${isAdultAllowed}&v=${ENTITY_VIEW_SCHEMA_V}`;
                } else if (current.type === 'studio') {
                    endpoint = `/api/catalog/graph/studio/${current.id}?render=blade&adult=${isAdultAllowed}&v=${ENTITY_VIEW_SCHEMA_V}`;
                } else if (current.type === 'music' || current.type === 'track') {
                    endpoint = `/api/catalog/graph/track/${current.id}?render=blade&adult=${isAdultAllowed}&v=${ENTITY_VIEW_SCHEMA_V}`;
                }
                const res = await fetch(endpoint, {
                    cache: 'no-store',
                    headers: { 'HX-Request': 'true' }
                });
                if (res.ok) {
                    const html = await res.text();
                    window.entityHtmlCache.set(cacheKey, html);
                    container.innerHTML = html;
                    // Executa scripts contidos no HTML injetado
                    container.querySelectorAll('script').forEach(s => {
                        try {
                            const newScript = document.createElement('script');
                            Array.from(s.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                            newScript.appendChild(document.createTextNode(s.innerHTML));
                            s.parentNode.replaceChild(newScript, s);
                        } catch (err) {
                            console.warn('[Lobby Script Exec Error]', err);
                        }
                    });
                    window.renderDynamicBreadcrumb();
                    window.syncAddonCapabilityButtons?.();
                    window.initDraggableEntityRails?.(container);
                    if (window.i18n) window.i18n.applyToDOM();
                } else {
                    container.innerHTML = `<div class="p-8 text-center text-red-400 font-mono text-xs" data-i18n="state.error_partial">Erro ao compilar parcial Blade para esta obra.</div>`;
                }
            } catch (e) {
                container.innerHTML = `<div class="p-8 text-center text-red-400 font-mono text-xs" data-i18n="state.error_connection">Falha de conexão com o backend.</div>`;
            }
        };

        // 6. AÇÕES SOCIAIS DO PHP (Curtir, Favoritar, Nota persistidas no SQLite)
        window.toggleCardFavorite = async function(e, id, type, title) {
            if (e) e.stopPropagation();
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const isCurrentlyBookmarked = Boolean(window.userPreferences && window.userPreferences[id] && window.userPreferences[id].bookmarked);
            await window.submitPreference(id, type, { bookmarked: !isCurrentlyBookmarked });
        };

        window.submitPreference = async function(targetId, targetType, payload) {
            if (!window.currentUser) {
                window.openProfileModal();
                return null;
            }
            try {
                const res = await fetch('/api/entity/preference', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({
                        target_id: targetId,
                        target_type: targetType,
                        ...payload
                    })
                });
                if (res.status === 401) {
                    window.openProfileModal();
                    return null;
                }
                if (!res.ok) {
                    console.error("Erro ao salvar preferência:", res.status);
                    return null;
                }
                const data = await res.json();
                if (data.preference) {
                    if (!window.userPreferences || typeof window.userPreferences !== 'object') {
                        window.userPreferences = {};
                    }
                    window.userPreferences[targetId] = data.preference;
                    if (data.preference.entity_id) {
                        window.userPreferences[data.preference.entity_id] = data.preference;
                    }
                    if (window.entityHtmlCache instanceof Map) {
                        const current = window.navStack?.[window.navStack.length - 1];
                        for (const key of Array.from(window.entityHtmlCache.keys())) {
                            if (key.includes(`:${targetId}:`) || (current && key.includes(`:${current.id}:`))) {
                                window.entityHtmlCache.delete(key);
                            }
                        }
                    }
                    return data.preference;
                }
                return null;
            } catch (err) {
                console.error("Erro ao salvar preferência:", err);
                return null;
            }
        };

        window.submitUserRating = async function(targetId, targetType) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const score = prompt("Qual sua nota para esta obra (1 a 10)?", "10");
            if (score && !isNaN(score)) {
                await window.submitPreference(targetId, targetType, { user_score: parseInt(score, 10) });
            }
        };

        // 7. VERIFICAÇÃO DE IDADE (+18) & PREFERÊNCIA ADULTA PERSISTIDA NA CONTA
        window.escapeAgeHtml = function(val) {
            return String(val ?? '').replace(/[&<>"']/g, (ch) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[ch]));
        };

        window.setAgeVerifyFeedback = function(message, tone = 'info') {
            const box = document.getElementById('age-verify-feedback');
            if (!box) return;
            if (!message) {
                box.className = 'hidden p-2.5 rounded-xl text-[11px] font-mono border';
                box.innerText = '';
                return;
            }
            const toneClass = tone === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : (tone === 'error'
                    ? 'bg-red-500/15 border-red-500/30 text-red-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-200');
            box.className = `p-2.5 rounded-xl text-[11px] font-mono border ${toneClass}`;
            box.innerText = message;
        };

        window.toggleManualAgeBox = function(forceShow) {
            const box = document.getElementById('age-verify-manual-box');
            if (!box) return;
            const show = typeof forceShow === 'boolean' ? forceShow : box.classList.contains('hidden');
            if (show) {
                box.classList.remove('hidden');
                box.classList.add('flex');
            } else {
                box.classList.add('hidden');
                box.classList.remove('flex');
            }
        };

        window.applyAgeVerificationStatusUI = function(payload) {
            if (!payload || !window.currentUser) return;
            const status = payload.age_verification_status || window.currentUser.age_verification_status || 'unverified';
            const ageVerified = Boolean(payload.age_verified);
            const adultEnabled = Boolean(payload.adult_content_enabled) && ageVerified;

            window.currentUser.age_verification_status = status;
            window.currentUser.age_verified = ageVerified;
            window.currentUser.age_verification_method = payload.age_verification_method || window.currentUser.age_verification_method || null;
            window.currentUser.adult_content_enabled = adultEnabled;

            const badge = document.getElementById('age-verify-status-badge');
            const badgeMeta = {
                verified: { label: 'Verificado (+18)', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
                pending: { label: 'Aguardando Aprovação', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                rejected: { label: 'Recusado', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
                underage: { label: 'Bloqueado (-18)', cls: 'bg-red-500/20 text-red-300 border-red-500/40' },
                unverified: { label: 'Não Verificado', cls: 'bg-theme-pill text-theme-muted border-theme-default' }
            }[status] || { label: 'Não Verificado', cls: 'bg-theme-pill text-theme-muted border-theme-default' };

            if (badge) {
                badge.innerText = badgeMeta.label;
                badge.className = `px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${badgeMeta.cls}`;
            }

            const checkbox = document.getElementById('modal-toggle-adult');
            if (checkbox) {
                checkbox.disabled = !ageVerified;
                checkbox.checked = adultEnabled;
            }

            const controls = document.getElementById('age-verify-controls');
            if (controls) {
                controls.classList.toggle('hidden', ageVerified);
                controls.classList.toggle('flex', !ageVerified);
            }

            const underageMsg = document.getElementById('age-verify-underage-msg');
            const actionRow = document.getElementById('age-verify-action-row');
            const manualBox = document.getElementById('age-verify-manual-box');
            const pendingBanner = document.getElementById('age-verify-pending-banner');
            const manualFields = document.getElementById('age-verify-manual-fields');

            if (underageMsg) underageMsg.classList.toggle('hidden', status !== 'underage');
            if (actionRow) {
                actionRow.classList.toggle('hidden', status === 'underage');
                actionRow.classList.toggle('flex', status !== 'underage');
            }
            if (pendingBanner) pendingBanner.classList.toggle('hidden', status !== 'pending');
            if (manualFields) {
                const hideFields = (ageVerified || status === 'underage');
                manualFields.classList.toggle('hidden', hideFields);
                manualFields.classList.toggle('flex', !hideFields);
            }
            if (manualBox) {
                const hideBox = (ageVerified || status === 'underage');
                manualBox.classList.toggle('hidden', hideBox);
                manualBox.classList.toggle('flex', !hideBox);
            }

            if (status === 'rejected' && payload.last_rejection_note) {
                window.setAgeVerifyFeedback(`Solicitação recusada: ${payload.last_rejection_note}`, 'error');
            }
        };

        window.refreshAgeVerificationStatus = async function() {
            if (!window.currentUser) return;
            try {
                const res = await fetch('/api/account/age-verification/status', {
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                });
                if (!res.ok) return;
                const data = await res.json();
                window.applyAgeVerificationStatusUI(data);
            } catch (err) {
                console.warn('[Anirium Age] Falha ao atualizar status de idade:', err);
            }
        };

        window.submitManualAgeVerification = async function() {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const birthDate = (document.getElementById('age-verify-birth-date')?.value || '').trim();
            const declaration = Boolean(document.getElementById('age-verify-declaration')?.checked);

            if (!birthDate) {
                window.setAgeVerifyFeedback('Informe sua data de nascimento real.', 'error');
                return;
            }
            if (!declaration) {
                window.setAgeVerifyFeedback('Confirme a declaração de maioridade (+18) para continuar.', 'error');
                return;
            }

            try {
                const res = await fetch('/api/account/age-verification/request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({
                        birth_date: birthDate,
                        declaration_accepted: declaration
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    window.applyAgeVerificationStatusUI(data);
                    window.setAgeVerifyFeedback('Data de nascimento salva permanentemente! Maioridade (+18) verificada — você já pode ativar o filtro acima.', 'success');
                } else if (res.status === 409 || data.error === 'birth_date_locked') {
                    window.setAgeVerifyFeedback('Sua data de nascimento já foi registrada e não pode ser alterada.', 'error');
                } else if (data.status === 'underage' || data.error === 'underage_blocked' || data.error === 'minimum_age_not_met') {
                    window.applyAgeVerificationStatusUI({
                        age_verification_status: 'underage',
                        age_verified: false,
                        adult_content_enabled: false
                    });
                    window.setAgeVerifyFeedback('Idade inferior a 18 anos. Conteúdo adulto bloqueado nesta conta.', 'error');
                } else {
                    window.setAgeVerifyFeedback('Não foi possível salvar a data de nascimento. Verifique os dados informados.', 'error');
                }
            } catch (err) {
                console.error('Falha ao salvar verificação manual:', err);
                window.setAgeVerifyFeedback('Erro de conexão ao salvar verificação.', 'error');
            }
        };

        window.loadAdminAgeVerifications = async function() {
            const list = document.getElementById('admin-age-verifications-list');
            if (!list || !window.currentUser || !window.currentUser.is_admin) return;
            try {
                const res = await fetch('/api/admin/age-verifications', {
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' }
                });
                if (!res.ok) {
                    list.innerHTML = '<span class="text-red-400">Não autorizado a carregar a fila.</span>';
                    return;
                }
                const data = await res.json();
                const pending = Array.isArray(data.pending) ? data.pending : [];
                const recent = Array.isArray(data.recent) ? data.recent : [];
                let html = '';

                if (pending.length === 0) {
                    html += '<p class="text-[11px] text-theme-muted">Nenhuma solicitação pendente.</p>';
                } else {
                    html += pending.map((item) => {
                        const esc = window.escapeAgeHtml;
                        return `
                            <div class="p-3 rounded-xl bg-black/25 border border-theme-default flex flex-col gap-2">
                                <div class="flex items-center justify-between gap-2 flex-wrap">
                                    <div class="min-w-0">
                                        <p class="text-xs font-bold text-theme-primary truncate">${esc(item.user_name || 'Usuário')} <span class="text-theme-muted font-normal">(${esc(item.user_email || '')})</span></p>
                                        <p class="text-[10px] text-amber-300 mt-0.5">Nascimento: ${esc(item.declared_birth_date || '-')} • Idade calculada: ${esc(item.declared_age ?? '?')} anos</p>
                                    </div>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <button type="button" onclick="window.reviewAdminAgeVerification(${Number(item.id)}, 'approve')" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/30 cursor-pointer">
                                            Aprovar (+18)
                                        </button>
                                        <button type="button" onclick="window.reviewAdminAgeVerification(${Number(item.id)}, 'reject')" class="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-bold hover:bg-red-500/30 cursor-pointer">
                                            Rejeitar
                                        </button>
                                    </div>
                                </div>
                                ${item.evidence_note ? `<p class="text-[10px] text-theme-secondary">Observação: ${esc(item.evidence_note)}</p>` : ''}
                            </div>
                        `;
                    }).join('');
                }

                if (recent.length > 0) {
                    html += '<div class="pt-2 border-t border-theme-default flex flex-col gap-1.5">';
                    html += '<span class="text-[10px] uppercase text-theme-muted">Histórico Recente</span>';
                    html += recent.slice(0, 6).map((item) => {
                        const esc = window.escapeAgeHtml;
                        const canRevoke = item.status === 'approved' && item.user_age_status === 'verified';
                        return `
                            <div class="p-2 rounded-lg bg-black/15 border border-theme-default flex items-center justify-between gap-2 text-[10px]">
                                <span class="truncate">${esc(item.user_email || '')} • ${esc(item.status)}</span>
                                ${canRevoke ? `<button type="button" onclick="window.revokeAdminAgeVerification(${Number(item.user_id)})" class="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 cursor-pointer shrink-0">Revogar</button>` : ''}
                            </div>
                        `;
                    }).join('');
                    html += '</div>';
                }

                list.innerHTML = html;
            } catch (err) {
                console.warn('[Anirium Admin Age] Erro ao listar verificações:', err);
            }
        };

        window.reviewAdminAgeVerification = async function(requestId, decision) {
            const action = decision === 'approve' ? 'approve' : 'reject';
            let note = null;
            if (action === 'reject') {
                note = prompt('Motivo da recusa (opcional):', '') || null;
            }
            try {
                const res = await fetch(`/api/admin/age-verifications/${Number(requestId)}/${action}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ review_note: note })
                });
                if (res.ok) {
                    await window.loadAdminAgeVerifications();
                    await window.refreshAgeVerificationStatus();
                }
            } catch (err) {
                console.error('Erro ao revisar verificação:', err);
            }
        };

        window.revokeAdminAgeVerification = async function(userId) {
            if (!confirm('Revogar a verificação +18 e desativar conteúdo adulto desta conta?')) return;
            try {
                const res = await fetch(`/api/admin/age-verifications/users/${Number(userId)}/revoke`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({})
                });
                if (res.ok) {
                    await window.loadAdminAgeVerifications();
                    await window.refreshAgeVerificationStatus();
                }
            } catch (err) {
                console.error('Erro ao revogar verificação:', err);
            }
        };

        window.toggleAdultPreference = async function(enabled) {
            const checkbox = document.getElementById('modal-toggle-adult');
            try {
                const res = await fetch('/api/account/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ adult_content_enabled: enabled })
                });
                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                    if (checkbox) checkbox.checked = false;
                    if (window.currentUser) {
                        window.currentUser.adult_content_enabled = false;
                        window.currentUser.age_verified = Boolean(data.age_verified);
                        window.currentUser.age_verification_status = data.age_verification_status || window.currentUser.age_verification_status;
                    }
                    window.applyAgeVerificationStatusUI(data);
                    if (data.error === 'underage_blocked') {
                        window.setAgeVerifyFeedback('Esta conta foi bloqueada para conteúdo adulto (-18 anos).', 'error');
                    } else {
                        window.setAgeVerifyFeedback('Verifique sua maioridade (+18 anos) antes de ativar o filtro adulto.', 'error');
                    }
                    return;
                }

                const resolvedEnabled = Boolean(data.adult_content_enabled);
                if (window.currentUser) {
                    window.currentUser.adult_content_enabled = resolvedEnabled;
                    window.currentUser.age_verified = Boolean(data.age_verified ?? window.currentUser.age_verified);
                }
                if (checkbox) checkbox.checked = resolvedEnabled;
                window.entityHtmlCache?.clear?.();

                if (resolvedEnabled) {
                    await window.syncAdultShardsIfAllowed(window.exploreKindFilter === 'manga' ? 'manga' : 'work');
                } else {
                    window.adultShardsCache = {};
                }

                try {
                    const feedRes = await fetch('/?feed=init', {
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (feedRes.ok) {
                        const feedData = await feedRes.json();
                        if (Array.isArray(feedData.featuredRoll)) window.heroRoll = feedData.featuredRoll.filter(item => !(window.isLiteratureItem && window.isLiteratureItem(item)));
                        if (feedData.calendar) window.calendarData = feedData.calendar;
                    }
                } catch (feedErr) {
                    console.warn('[Anirium Feed] Falha ao atualizar Hero/Calendário:', feedErr);
                }

                window.deriveHeroRollFromCalendar();
                window.runClientSideCatalogFilter();
                window.renderCalendarPage();
            } catch (err) {
                if (checkbox) checkbox.checked = Boolean(window.currentUser?.adult_content_enabled);
                console.error("Falha ao salvar preferência +18:", err);
            }
        };

        // 8. DEV LOGIN SIMULADO
        window.quickLoginDev = async function() {
            try {
                const res = await fetch('/api/dev/simulate-login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ email: 'santoss.cog@gmail.com' })
                });
                if (res.ok) {
                    window.location.reload();
                }
            } catch (err) {
                console.error("Falha no login dev:", err);
            }
        };

        // 9. MODAL DE PERFIL / GOOGLE
                // 9. GERENCIAMENTO DAS 5 ABAS DO PERFIL CANÔNICO DO USUÁRIO
        window.currentProfileTab = 'overview';
        window.userLibraryList = [];
        window.userAddonsList = [];
        window.activeLibEntityFilter = 'all';

        window.openProfileModal = function() {
            const modal = document.getElementById('modal-profile');
            if (modal) modal.classList.remove('opacity-0', 'pointer-events-none');
            window.loadUserProfileData();
        };

        window.closeProfileModal = function() {
            const modal = document.getElementById('modal-profile');
            if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
        };

        window.switchProfileTab = function(tab) {
            window.currentProfileTab = tab;
            ['overview', 'library', 'history', 'addons', 'settings'].forEach(t => {
                const btn = document.getElementById(`profile-tab-btn-${t}`);
                const panel = document.getElementById(`profile-panel-${t}`);
                if (btn) {
                    if (t === tab) {
                        btn.className = "profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-theme-accent text-theme-accent transition-colors shrink-0 cursor-pointer";
                    } else {
                        btn.className = "profile-tab-btn px-4 py-3 text-xs font-bold font-mono border-b-2 border-transparent text-theme-muted hover:text-theme-primary transition-colors shrink-0 cursor-pointer";
                    }
                }
                if (panel) {
                    if (t === tab) panel.classList.remove('hidden');
                    else panel.classList.add('hidden');
                }
            });

            if (tab === 'library') window.renderProfileLibrary();
            if (tab === 'history') window.renderProfileHistory();
            if (tab === 'addons') window.loadAccountAddons();
            if (tab === 'settings') {
                window.refreshAgeVerificationStatus();
                if (window.currentUser && window.currentUser.is_admin) {
                    window.loadAdminAgeVerifications();
                }
            }
        };

        window.loadUserProfileData = async function() {
            if (!window.currentUser) return;
            try {
                const res = await fetch('/api/entity/preferences');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.preferences)) {
                        window.userLibraryList = data.preferences;
                        if (window.currentProfileTab === 'library') window.renderProfileLibrary();
                        if (window.currentProfileTab === 'history') window.renderProfileHistory();
                    }
                }
            } catch (err) {
                console.warn('[Anirium User] Falha ao sincronizar preferências:', err);
            }
        };

        window.filterLibraryEntity = function(type) {
            window.activeLibEntityFilter = type;
            ['all', 'work', 'arc', 'universe'].forEach(t => {
                const btn = document.getElementById(`lib-filter-${t}`);
                if (btn) {
                    if (t === type) {
                        btn.className = "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-accent text-theme-inverse border-theme-accent cursor-pointer";
                    } else {
                        btn.className = "px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default cursor-pointer";
                    }
                }
            });
            window.renderProfileLibrary();
        };

        window.formatProfileSeconds = function(sec) {
            const total = Math.max(0, Math.floor(Number(sec) || 0));
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            return `${m}:${String(s).padStart(2, '0')}`;
        };

        window.renderProfileLibrary = function() {
            const container = document.getElementById('profile-library-container');
            if (!container) return;

            const filtered = (window.userLibraryList || [])
                .filter(item => {
                    if (!item.bookmarked && !item.user_score) return false;
                    if (window.activeLibEntityFilter === 'all') return true;
                    return (item.target_type === window.activeLibEntityFilter);
                })
                .sort((a, b) => String(b.last_interacted_at || '').localeCompare(String(a.last_interacted_at || '')));

            if (filtered.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_library">${window.i18n ? window.i18n.t('profile.empty_library') : 'Nenhum item adicionado aos favoritos ainda.'}</div>`;
                return;
            }

            container.innerHTML = filtered.map(item => {
                const title = item.title || item.work_title || item.target_id || '';
                const navType = item.target_type || (item.work_id ? 'work' : 'work');
                const navId = item.entity_id || item.target_id;
                const safeTitle = encodeURIComponent(title);
                const thumbHtml = item.image
                    ? `<img src="${item.image}" alt="" class="w-10 h-14 rounded-lg object-cover shrink-0 border border-theme-default bg-black/30" loading="lazy">`
                    : `<div class="w-10 h-10 rounded-xl bg-theme-pill border border-theme-default flex items-center justify-center text-sm shrink-0">★</div>`;
                const subtitleText = item.target_type === 'episode' && item.episode_number
                    ? `Episódio ${item.episode_number}${item.format ? ` • ${item.format}` : ''}`
                    : (item.format || item.target_type || 'work');
                const favBadge = item.bookmarked ? `<span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">Favorito</span>` : '';
                const statusBadge = item.status ? `<span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-pill text-theme-muted border border-theme-default">${item.status}</span>` : '';
                const scoreBadge = item.user_score ? `<span class="text-xs font-mono font-bold text-theme-accent">★ ${item.user_score}/10</span>` : '';
                return `
                    <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between gap-3 hover:border-theme-highlight transition-all cursor-pointer group"
                         data-nav-type="${navType}"
                         data-nav-id="${navId}"
                         data-nav-label="${safeTitle}"
                         onclick="window.closeProfileModal(); window.handleCardNavClick(this)">
                        <div class="flex items-center gap-3 min-w-0">
                            ${thumbHtml}
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">${title}</h5>
                                <p class="text-[10px] font-mono text-theme-muted uppercase mt-0.5">${subtitleText}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            ${favBadge}
                            ${statusBadge}
                            ${scoreBadge}
                        </div>
                    </div>
                `;
            }).join('');
        };

        window.renderProfileHistory = function() {
            const container = document.getElementById('profile-history-container');
            if (!container) return;

            const sortedList = [...(window.userLibraryList || [])]
                .filter(item => item.last_interacted_at || item.progress_seconds || item.status)
                .sort((a, b) => String(b.last_interacted_at || '').localeCompare(String(a.last_interacted_at || '')));

            const workMap = new Map();
            sortedList.forEach(item => {
                const key = item.work_id || item.entity_id || item.target_id;
                if (!key) return;
                if (!workMap.has(key)) {
                    workMap.set(key, item);
                }
            });

            const condensedList = Array.from(workMap.values());

            if (condensedList.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_history">${window.i18n ? window.i18n.t('profile.empty_history') : 'Nenhum histórico registrado ainda.'}</div>`;
                return;
            }

            container.innerHTML = condensedList.map(item => {
                const navType = item.target_type === 'episode'
                    ? 'episode'
                    : (item.work_id ? 'work' : (item.target_type || 'work'));
                const navId = item.entity_id || item.target_id;
                const displayTitle = item.work_title || item.title || item.target_id || 'Obra';
                const safeTitle = encodeURIComponent(displayTitle);
                const epLabel = item.episode_number
                    ? `Episódio ${item.episode_number}`
                    : (item.title || 'Continuar');
                const progLabel = item.progress_seconds > 0
                    ? ` • ${window.formatProfileSeconds(item.progress_seconds)}`
                    : '';
                const thumbHtml = item.image
                    ? `<img src="${item.image}" alt="" class="w-10 h-14 rounded-lg object-cover shrink-0 border border-theme-default bg-black/30" loading="lazy">`
                    : `<div class="w-10 h-10 rounded-xl bg-theme-pill border border-theme-default flex items-center justify-center text-base shrink-0">🎬</div>`;
                return `
                    <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between gap-3 hover:border-theme-accent transition-all cursor-pointer group"
                         data-nav-type="${navType}"
                         data-nav-id="${navId}"
                         data-nav-label="${safeTitle}"
                         onclick="window.closeProfileModal(); window.handleCardNavClick(this)">
                        <div class="flex items-center gap-3 min-w-0">
                            ${thumbHtml}
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">${displayTitle}</h5>
                                <p class="text-[10px] font-mono text-theme-muted mt-0.5 truncate">
                                    <span data-i18n="profile.last_progress">Último Progresso:</span> ${epLabel}${progLabel}
                                </p>
                            </div>
                        </div>
                        <span class="text-xs font-mono font-bold text-theme-accent shrink-0 group-hover:translate-x-1 transition-transform">
                            Continuar ❯
                        </span>
                    </div>
                `;
            }).join('');
        };

        window.loadAccountAddons = async function() {
            const listContainer = document.getElementById('profile-addons-list');
            try {
                const res = await fetch('/api/addons');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.addons)) {
                        window.allUserAddons = data.addons;
                        const playerPro = data.addons.find(a => a.id === 'player-pro');
                        const toggleEl = document.getElementById('addon-toggle-player-pro');
                        if (toggleEl && playerPro) {
                            toggleEl.checked = Boolean(playerPro.enabled);
                        }
                        const mangaReaderPro = data.addons.find(a => a.id === 'manga-reader-pro');
                        const mangaToggleEl = document.getElementById('addon-toggle-manga-reader-pro');
                        if (mangaToggleEl && mangaReaderPro) {
                            mangaToggleEl.checked = Boolean(mangaReaderPro.enabled);
                        }
                        window.userAddonsList = data.addons.filter(a => !['player-pro', 'manga-reader-pro'].includes(a.id));
                        if (listContainer) window.renderAddonsList();
                        if (typeof window.inspectInstalledAccountAddons === 'function') {
                            window.inspectInstalledAccountAddons(window.userAddonsList);
                        }
                        window.syncAddonCapabilityButtons();
                    }
                }
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao carregar lista de addons:', err);
            }
            window.checkAniriumServiceHealth();
        };

        window.hasActiveAddonCapability = function(capabilityType) {
            const addons = window.allUserAddons || [];
            return addons.some(a => {
                if (!a.enabled) return false;
                const caps = Array.isArray(a.capabilities) ? a.capabilities : [];
                if (capabilityType === 'video') {
                    return a.id === 'player-pro' || caps.includes('video.stream') || caps.includes('ui.player.render') || caps.includes('playback.client');
                }
                if (capabilityType === 'manga') {
                    return a.id === 'manga-reader-pro' || caps.includes('manga.reader') || caps.includes('ui.reader.render') || caps.includes('document.pdf') || caps.includes('document.images');
                }
                return false;
            });
        };

        window.syncAddonCapabilityButtons = function() {
            const hasVideo = window.hasActiveAddonCapability('video');
            const hasManga = window.hasActiveAddonCapability('manga');

            document.querySelectorAll('[data-requires-addon-capability="video"]').forEach(el => {
                if (hasVideo) {
                    el.classList.remove('hidden');
                    el.classList.add('inline-flex');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('inline-flex');
                }
            });

            document.querySelectorAll('[data-requires-addon-capability="manga"]').forEach(el => {
                if (hasManga) {
                    el.classList.remove('hidden');
                    el.classList.add('inline-flex');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('inline-flex');
                }
            });
        };

        window.aniriumServiceOnline = false;
        window.aniriumServiceWs = null;

        window.initAniriumServiceWebSocket = function() {
            if (window.aniriumServiceWs && window.aniriumServiceWs.readyState === WebSocket.OPEN) return;
            try {
                const ws = new WebSocket('ws://127.0.0.1:4004/ws');
                window.aniriumServiceWs = ws;
                ws.onopen = () => {
                    window.updateServiceHealthStatus(true);
                };
                ws.onmessage = (evt) => {
                    try {
                        const data = JSON.parse(evt.data);
                        if (data.event === 'telemetry' || data.event === 'status') {
                            window.updateServiceHealthStatus(true);
                            if (window.onServiceTelemetry) window.onServiceTelemetry(data.payload || data);
                        }
                    } catch (e) {}
                };
                ws.onclose = () => {
                    window.updateServiceHealthStatus(false);
                    setTimeout(window.initAniriumServiceWebSocket, 5000);
                };
                ws.onerror = () => {
                    window.updateServiceHealthStatus(false);
                };
            } catch (e) {
                window.updateServiceHealthStatus(false);
            }
        };

        window.updateServiceHealthStatus = function(online) {
            window.aniriumServiceOnline = online;
            const pill = document.getElementById('profile-service-health-pill');
            const stageBadge = document.getElementById('addon-service-badge');
            if (pill) {
                if (online) {
                    pill.className = "px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
                    pill.innerText = "● Service 4004: Tempo Real (WS)";
                } else {
                    pill.className = "px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default";
                    pill.innerText = "○ Service 4004: Offline";
                }
            }
            if (stageBadge) {
                const commCount = (window.userAddonsList || []).filter(a => a.enabled).length;
                if (online) {
                    stageBadge.className = "px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
                    stageBadge.innerText = `● Anirium+ Service Ativo (WS) • ${commCount} Add-ons`;
                } else if (commCount > 0) {
                    stageBadge.className = "px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-theme-accent/20 text-theme-accent border-theme-accent/40";
                    stageBadge.innerText = `🧩 ${commCount} Add-on(s) da Comunidade Ativo(s)`;
                } else {
                    stageBadge.className = "px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border bg-theme-pill text-theme-muted border-theme-default";
                    stageBadge.innerText = "Modo Catálogo • Slot Modular Disponível";
                }
            }
        };

        window.checkAniriumServiceHealth = async function() {
            window.initAniriumServiceWebSocket();
            return window.aniriumServiceOnline;
        };

                function formatAddonDisplayName(a) {
            if (a.name && !a.name.startsWith('remote-')) return a.name;
            const url = (a.manifest_url || '').toLowerCase();
            if (url.includes('torrentio')) return 'Torrentio (P2P Streams)';
            if (url.includes('netflix')) return 'Netflix Catalog Stream';
            if (url.includes('thepiratebay')) return 'ThePirateBay+ (Torrents)';
            if (url.includes('brazuca')) return 'Brazuca Torrents (Dub/Sub)';
            if (url.includes('animesub')) return 'AnimeSub (Legendas PT-BR)';
            if (url.includes('opensubtitles')) return 'OpenSubtitles v3 Pro';
            if (url.includes('subdl')) return 'SubDL (Subtitle Engine)';
            if (url.includes('subsource')) return 'SubSource (Subtitles)';
            if (url.includes('stremio-br-anime')) return 'Stremio BR Anime';
            if (url.includes('aniscraper') || url.includes('nyaa')) return 'AniScraper (Nyaa P2P)';
            if (a.name) return a.name.replace(/^remote-([a-f0-9]{8})[a-f0-9]+$/, 'Addon Comunitário #$1');
            return 'Addon Comunitário #' + (a.id || '').substring(0, 8);
        }

        window.renderAddonsList = function() {
            if (window.AniriumAddonsManager && typeof window.AniriumAddonsManager.renderAddonsList === 'function') {
                return window.AniriumAddonsManager.renderAddonsList();
            }
            const container = document.getElementById('profile-addons-list');
            if (!container) return;

            if (window.userAddonsList.length === 0) {
                container.innerHTML = `<div class="p-4 text-center text-xs font-mono text-theme-muted" data-i18n="profile.no_addons">${window.i18n ? window.i18n.t('profile.no_addons') : 'Nenhum add-on comunitário instalado.'}</div>`;
                return;
            }

            container.innerHTML = window.userAddonsList.map(a => `
                <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-base">🧩</span>
                        <div class="min-w-0">
                            <h5 class="text-xs font-bold text-theme-primary truncate">${formatAddonDisplayName(a)}</h5>
                            <p class="text-[10px] font-mono text-theme-muted truncate">${a.manifest_url ? (a.manifest_url.replace(/https?:\/\//, '').split('/')[0]) : (a.description || 'Stremio Community Addon')}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="window.toggleAddon('${a.id}', this.checked)" class="sr-only peer">
                            <div class="w-8 h-4 bg-theme-pill border border-theme-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-theme-accent"></div>
                        </label>
                        <button type="button" onclick="window.uninstallAddon('${a.id}')" class="text-theme-muted hover:text-red-400 p-1 transition-colors cursor-pointer" title="Desinstalar">
                            ✕
                        </button>
                    </div>
                </div>
            `).join('');
        };

        window.toggleInstallAddonForm = function() {
            if (window.AniriumAddonsManager && typeof window.AniriumAddonsManager.openExploreAddonModal === 'function') {
                return window.AniriumAddonsManager.openExploreAddonModal();
            }
            const form = document.getElementById('addon-install-form');
            if (form) form.classList.toggle('hidden');
        };

        window.submitInstallAddon = async function() {
            const input = document.getElementById('addon-manifest-url');
            if (!input || !input.value.trim()) return;
            const val = input.value.trim();

            try {
                let payload = {};
                if (/^(https?|stremio):\/\//i.test(val)) {
                    payload = { manifest_url: val };
                } else {
                    payload = { manifest: JSON.parse(val) };
                }

                const res = await fetch('/api/addons/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    input.value = '';
                    window.toggleInstallAddonForm();
                    window.loadAccountAddons();
                } else {
                    alert('URL de manifesto Stremio inválida.');
                }
            } catch (err) {
                alert('Erro ao instalar manifesto do add-on.');
            }
        };

        window.toggleAddon = async function(addonId, enabled) {
            try {
                await fetch('/api/addons/toggle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ addon_id: addonId, enabled: enabled })
                });
                if (Array.isArray(window.allUserAddons)) {
                    const target = window.allUserAddons.find(a => a.id === addonId);
                    if (target) target.enabled = Boolean(enabled);
                }
                window.syncAddonCapabilityButtons();
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao alternar addon:', err);
            }
        };

        window.uninstallAddon = async function(addonId) {
            if (!confirm(`Deseja desinstalar o addon ${addonId}?`)) return;
            try {
                const res = await fetch('/api/addons/uninstall', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ addon_id: addonId })
                });
                if (res.ok) window.loadAccountAddons();
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao desinstalar:', err);
            }
        };

        // INTERAÇÕES DA BARRA DE ENTIDADE (EntityActions)
                // 10. GESTÃO DE ABAS DE INTERAÇÃO DA ENTIDADE & DISCUSSÃO DELTA
        window.entityDiscussionCursors = new Map();
        window.entityDiscussionCache = new Map();

        window.switchEntityTab = function(tabName) {
            const allTabs = ['structure', 'episodes', 'player', 'tracks', 'relations', 'discussion'];
            allTabs.forEach(t => {
                const btn = document.getElementById(`tab-btn-${t}`);
                const panel = document.getElementById(`entity-tab-panel-${t}`);

                if (btn) {
                    if (t === tabName) {
                        btn.className = "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer shrink-0";
                    } else {
                        btn.className = "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer shrink-0";
                    }
                }

                if (panel) {
                    if (t === tabName) {
                        panel.classList.remove('hidden');
                        panel.classList.add('flex');
                    } else {
                        panel.classList.add('hidden');
                        panel.classList.remove('flex');
                    }
                }
            });

            if (tabName === 'discussion') {
                const container = document.getElementById('entity-discussions-container');
                if (container) {
                    const type = container.getAttribute('data-target-type');
                    const id = container.getAttribute('data-target-id');
                    if (type && id) window.refreshEntityComments(type, id);
                }
            } else if (tabName === 'player') {
                window.mountAddonStage?.();
            }
        };

        // 11. TRAILER OFICIAL (LEGAL / SEMPRE VISÍVEL) & ADD-ONS EXTERNOS CONDICIONAIS POR CAPACIDADE (VÍDEO vs MANGÁ)
        window.openOfficialTrailerModal = function(queryTitle) {
            const modal = document.getElementById('modal-official-trailer');
            const titleEl = document.getElementById('official-trailer-title');
            const ytLink = document.getElementById('official-trailer-yt-link');
            const body = document.getElementById('official-trailer-body');
            if (!modal || !body) return;

            const q = encodeURIComponent((queryTitle || '') + ' official trailer');
            if (titleEl) titleEl.innerText = `Trailer Oficial • ${queryTitle}`;
            if (ytLink) ytLink.href = `https://www.youtube.com/results?search_query=${q}`;

            body.innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <div class="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-2xl text-red-400">🎬</div>
                    <h4 class="text-base font-bold font-serif text-white">${queryTitle} — Trailer Oficial</h4>
                    <p class="text-xs font-mono text-theme-muted max-w-md">
                        Acesso oficial aos trailers promocionais (PV) publicados pelos canais oficiais dos estúdios e distribuidoras no YouTube.
                    </p>
                    <div class="flex items-center gap-3 pt-1">
                        <a href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer"
                           class="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold shadow-lg transition-all">
                            ▶ Assistir Trailer Oficial no YouTube ↗
                        </a>
                        <button type="button" onclick="window.closeOfficialTrailerModal()"
                                class="px-4 py-2.5 rounded-xl bg-theme-pill border border-theme-default text-xs font-mono text-theme-muted hover:text-white cursor-pointer">
                            Fechar
                        </button>
                    </div>
                </div>
            `;
            modal.classList.remove('opacity-0', 'pointer-events-none');
        };

        window.closeOfficialTrailerModal = function() {
            const modal = document.getElementById('modal-official-trailer');
            const body = document.getElementById('official-trailer-body');
            if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
            if (body) body.innerHTML = '';
        };

        window.stopPlayerProEngine = function(releaseLease = false) {
            const state = window.aniriumPlayerProState;
            if (state) {
                if (state.manifestTimer) clearInterval(state.manifestTimer);
                if (state.renewTimer) clearInterval(state.renewTimer);
                if (state.windowController) {
                    try { state.windowController.abort(); } catch (e) {}
                }
                if (state.hlsInstance) {
                    try { state.hlsInstance.destroy(); } catch (e) {}
                }
                if (releaseLease && state.deviceId && state.playerSessionId) {
                    fetch('/api/service/session', {
                        method: 'DELETE',
                        keepalive: true,
                        headers: {
                            'x-anirium-device': state.deviceId,
                            'x-anirium-player-session': state.playerSessionId
                        }
                    }).catch(() => {});
                }
            }
            window.aniriumPlayerProState = null;
        };

        window.closeExternalAddonModal = function() {
            window.stopPlayerProEngine(true);
            const modal = document.getElementById('modal-external-addon');
            const viewport = document.getElementById('external-addon-viewport');
            if (modal) modal.classList.add('opacity-0', 'pointer-events-none');
            if (viewport) viewport.innerHTML = '';
        };

        window.getValidPlayerSessionId = function() {
            let sid = sessionStorage.getItem('anirium_player_session_id') || '';
            if (!/^[a-zA-Z0-9-]{16,128}$/.test(sid)) {
                const randPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : (Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 12) + '-' + Math.random().toString(36).substring(2, 12));
                sid = 'anirium-ps-' + randPart;
                sessionStorage.setItem('anirium_player_session_id', sid);
            }
            return sid;
        };

        window.getValidDeviceId = function() {
            let devId = localStorage.getItem('anirium_device_id') || '';
            if (devId.length < 12) {
                const randPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID().substring(0, 18)
                    : (Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 12));
                devId = 'anirium-dev-' + randPart;
                localStorage.setItem('anirium_device_id', devId);
            }
            return devId;
        };

        window.playStreamInAddonModal = function(streamUrl, sourceLabel) {
            const video = document.getElementById('anirium-player-pro-video');
            const overlay = document.getElementById('anirium-player-pro-overlay');
            const badge = document.getElementById('anirium-player-pro-source-badge');
            if (!video) return;

            const state = window.aniriumPlayerProState;
            if (state && state.currentStreamUrl === streamUrl) {
                return;
            }
            if (state) {
                state.currentStreamUrl = streamUrl;
                if (state.hlsInstance) {
                    try { state.hlsInstance.destroy(); } catch (e) {}
                    state.hlsInstance = null;
                }
            }

            if (overlay) overlay.classList.add('hidden');
            video.classList.remove('hidden');

            if (!video.hasAttribute('data-timeupdate-bound')) {
                video.setAttribute('data-timeupdate-bound', '1');
                video.addEventListener('timeupdate', () => {
                    const st = window.aniriumPlayerProState;
                    const subBox = document.getElementById('anirium-player-pro-sub-overlay');
                    const subText = document.getElementById('anirium-player-pro-sub-text');
                    if (!st || !st.selectedSubtitleTrackId || st.selectedSubtitleTrackId === 'off' || !Array.isArray(st.parsedSubtitleCues) || st.parsedSubtitleCues.length === 0) {
                        if (subBox) subBox.classList.add('hidden');
                        return;
                    }
                    const ct = video.currentTime;
                    const active = st.parsedSubtitleCues.filter(c => ct >= c.start && ct <= c.end);
                    if (active.length > 0 && subBox && subText) {
                        subText.innerText = active.map(c => c.text).join('\n');
                        subBox.classList.remove('hidden');
                    } else if (subBox) {
                        subBox.classList.add('hidden');
                    }
                });
            }

            const isPlaylist = /\.m3u8(?:[?#]|$)/i.test(streamUrl);
            if (isPlaylist && typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
                const hls = new window.Hls({
                    maxBufferLength: 60,
                    maxMaxBufferLength: 120,
                    backBufferLength: 48
                });
                if (state) state.hlsInstance = hls;

                hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, () => {
                    const desiredAudio = state?.selectedAudio || '';
                    if (desiredAudio && Array.isArray(hls.audioTracks)) {
                        const idx = hls.audioTracks.findIndex(t => t.lang === desiredAudio);
                        if (idx >= 0) hls.audioTrack = idx;
                    }
                });

                hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    video.play().catch(() => {});
                });

                hls.loadSource(streamUrl);
                hls.attachMedia(video);
            } else {
                video.src = streamUrl;
                video.play().catch(() => {});
            }

            if (badge && sourceLabel) {
                badge.innerText = `● ${sourceLabel}`;
                badge.className = 'px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
            }

            if (state?.selectedSubtitleTrackId && state?.playbackTicket) {
                window.applyPlayerProSubtitleTrack(state.selectedSubtitleTrackId);
            }
        };

        window.parseSubtitleVtt = function(text) {
            const cues = [];
            const parseTimestamp = (t) => {
                const parts = t.trim().split(':');
                if (parts.length === 3) {
                    const h = parseFloat(parts[0]);
                    const m = parseFloat(parts[1]);
                    const s = parseFloat(parts[2].replace(',', '.'));
                    return h * 3600 + m * 60 + s;
                } else if (parts.length === 2) {
                    const m = parseFloat(parts[0]);
                    const s = parseFloat(parts[1].replace(',', '.'));
                    return m * 60 + s;
                }
                return 0;
            };

            const blocks = text.replace(/\r\n|\r/g, '\n').split(/\n\s*\n/);
            for (const block of blocks) {
                const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('-->')) {
                        const timeParts = lines[i].split('-->');
                        const start = parseTimestamp(timeParts[0]);
                        const end = parseTimestamp(timeParts[1]);
                        const cueLines = lines.slice(i + 1).filter(l => !l.startsWith('NOTE') && !l.startsWith('STYLE'));
                        const cleanText = cueLines
                            .join('\n')
                            .replace(/<[^>]+>/g, '')
                            .replace(/\{[^}]+\}/g, '')
                            .trim();
                        if (cleanText && end > start) {
                            cues.push({ start, end, text: cleanText });
                        }
                        break;
                    }
                }
            }
            return cues;
        };

        window.applyPlayerProSubtitleTrack = async function(trackId) {
            const state = window.aniriumPlayerProState;
            const subBox = document.getElementById('anirium-player-pro-sub-overlay');
            const subText = document.getElementById('anirium-player-pro-sub-text');
            if (!state) return;

            state.selectedSubtitleTrackId = trackId || '';
            state.parsedSubtitleCues = [];
            if (subBox) subBox.classList.add('hidden');
            if (subText) subText.innerText = '';

            const subSelect = document.getElementById('player-pro-sub-select');
            if (subSelect && subSelect.value !== state.selectedSubtitleTrackId) {
                subSelect.value = state.selectedSubtitleTrackId;
            }

            if (!trackId || trackId === 'off' || !state.playbackTicket) {
                return;
            }

            try {
                const subUrl = `http://127.0.0.1:4004/subtitles?trackId=${encodeURIComponent(trackId)}&playbackTicket=${encodeURIComponent(state.playbackTicket)}`;
                const res = await fetch(subUrl);
                if (!res.ok) return;
                const text = await res.text();
                if (state.selectedSubtitleTrackId === trackId) {
                    state.parsedSubtitleCues = window.parseSubtitleVtt(text);
                }
            } catch (err) {
                console.warn('[Player Pro] Falha ao carregar legenda VTT:', err);
            }
        };

        window.selectPlayerProQuality = async function(quality) {
            const state = window.aniriumPlayerProState;
            if (!state || !quality || state.selectedQuality === quality) return;
            state.selectedQuality = quality;
            state.requestedQuality = '';
            state.currentStreamUrl = '';
            window.renderPlayerProUnifiedBar();
            await window.syncPlayerProStreamSelection(true);
        };

        window.selectPlayerProAudio = async function(audioLang) {
            const state = window.aniriumPlayerProState;
            if (!state || !audioLang) return;
            state.selectedAudio = audioLang;
            if (state.hlsInstance && Array.isArray(state.hlsInstance.audioTracks)) {
                const idx = state.hlsInstance.audioTracks.findIndex(t => t.lang === audioLang);
                if (idx >= 0) state.hlsInstance.audioTrack = idx;
            }
            const audioSelect = document.getElementById('player-pro-audio-select');
            if (audioSelect && audioSelect.value !== state.selectedAudio) {
                audioSelect.value = state.selectedAudio;
            }
            if (state.manifest?.windowOnDemand) {
                state.requestedQuality = '';
                await window.syncPlayerProStreamSelection(true);
            }
        };

        window.renderPlayerProUnifiedBar = function() {
            const state = window.aniriumPlayerProState;
            const bar = document.getElementById('anirium-player-pro-unified-bar');
            if (!bar || !state) return;

            const m = state.manifest || {};
            const qualities = Array.isArray(m.qualities) ? m.qualities : [];
            const audios = Array.isArray(m.audioChoices) && m.audioChoices.length > 0
                ? m.audioChoices
                : (Array.isArray(m.audios) ? m.audios : []);
            const subTracks = Array.isArray(m.subtitleTracks) ? m.subtitleTracks : [];

            const activeLinks = Number(m.activeLinks ?? state.sourcesCount ?? 0);
            const peers = Number(m.peers ?? 0);
            const rate = m.downloadRate || '0 KB/s';
            const bufferPct = Number(m.bufferPercent ?? 0).toFixed(0);

            // Atualiza telemetria contínua sem recriar o DOM (evita fechar dropdowns e recarregamento visual)
            const elLinks = document.getElementById('player-pro-telemetry-links');
            const elPeers = document.getElementById('player-pro-telemetry-peers');
            const elRate = document.getElementById('player-pro-telemetry-rate');
            const elBuffer = document.getElementById('player-pro-telemetry-buffer');

            if (elLinks) elLinks.innerText = `⚡ SWARM UNIFICADO: ${activeLinks} Magnet(s)`;
            if (elPeers) elPeers.innerText = `👥 ${peers} Peers`;
            if (elRate) elRate.innerText = `⬇ ${rate}`;
            if (elBuffer) {
                if (bufferPct > 0) {
                    elBuffer.innerText = `Buffer ${bufferPct}%`;
                    elBuffer.classList.remove('hidden');
                } else {
                    elBuffer.classList.add('hidden');
                }
            }

            // Sincroniza botões de qualidade se já existirem
            const qualityContainer = document.getElementById('player-pro-quality-container');
            if (qualityContainer && qualities.length > 0) {
                qualityContainer.querySelectorAll('button[data-quality]').forEach(btn => {
                    const q = btn.getAttribute('data-quality');
                    if (q === state.selectedQuality) {
                        btn.className = 'px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer bg-theme-accent text-theme-inverse shadow-sm';
                    } else {
                        btn.className = 'px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer text-theme-muted hover:text-white';
                    }
                });
            }

            // Se o markup base da barra ainda não foi construído ou a contagem de opções mudou, monta o layout uma única vez
            const currentSubCount = Number(bar.getAttribute('data-sub-count') || -1);
            const currentAudioCount = Number(bar.getAttribute('data-audio-count') || -1);
            const currentQualitiesCount = Number(bar.getAttribute('data-qualities-count') || -1);

            if (currentSubCount === subTracks.length && currentAudioCount === audios.length && currentQualitiesCount === qualities.length) {
                return;
            }

            bar.setAttribute('data-sub-count', subTracks.length);
            bar.setAttribute('data-audio-count', audios.length);
            bar.setAttribute('data-qualities-count', qualities.length);

            const langLabel = (code) => {
                const map = { jpn: 'Japonês (Original)', por: 'Português (BR)', 'pt-br': 'Português (BR)', eng: 'Inglês', spa: 'Espanhol', und: 'Original' };
                return map[String(code || '').toLowerCase()] || String(code || '').toUpperCase();
            };

            bar.innerHTML = `
                <div class="p-3 rounded-2xl bg-theme-raised border border-theme-default flex flex-wrap items-center justify-between gap-3">
                    <!-- Telemetria do Swarm Multi-Magnet Unificado -->
                    <div class="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                        <span id="player-pro-telemetry-links" class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                            ⚡ SWARM UNIFICADO: ${activeLinks} Magnet(s)
                        </span>
                        <span id="player-pro-telemetry-peers" class="px-2 py-1 rounded-lg bg-theme-pill border border-theme-default text-theme-secondary">
                            👥 ${peers} Peers
                        </span>
                        <span id="player-pro-telemetry-rate" class="px-2 py-1 rounded-lg bg-theme-pill border border-theme-default text-theme-accent font-bold">
                            ⬇ ${rate}
                        </span>
                        <span id="player-pro-telemetry-buffer" class="${bufferPct > 0 ? '' : 'hidden'} px-2 py-1 rounded-lg bg-theme-pill border border-theme-default text-emerald-300">
                            Buffer ${bufferPct}%
                        </span>
                    </div>

                    <!-- Seletores Unificados: Qualidade • Áudio • Legenda -->
                    <div class="flex flex-wrap items-center gap-2">
                        ${qualities.length > 0 ? `
                            <div id="player-pro-quality-container" class="flex items-center gap-1 bg-theme-pill px-2 py-1 rounded-xl border border-theme-default">
                                <span class="text-[9px] font-mono text-theme-muted uppercase font-bold">Qualidade:</span>
                                ${qualities.map(q => `
                                    <button type="button"
                                            data-quality="${q}"
                                            onclick="window.selectPlayerProQuality('${q}')"
                                            class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${state.selectedQuality === q ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-white'}">
                                        ${q}
                                    </button>
                                `).join('')}
                            </div>
                        ` : `
                            <span class="text-[10px] font-mono text-theme-muted px-2 py-1 rounded-xl bg-theme-pill border border-theme-default">
                                Sincronizando qualidades do Swarm...
                            </span>
                        `}

                        ${audios.length > 0 ? `
                            <label class="flex items-center gap-1.5 bg-theme-pill px-2.5 py-1 rounded-xl border border-theme-default text-[10px] font-mono">
                                <span class="text-theme-muted uppercase font-bold text-[9px]">Áudio:</span>
                                <select id="player-pro-audio-select" onchange="window.selectPlayerProAudio(this.value)" class="bg-theme-surface text-theme-primary font-bold focus:outline-none cursor-pointer rounded-lg px-1.5 py-0.5 border border-theme-default">
                                    ${audios.map(a => `<option value="${a}" class="bg-theme-surface text-theme-primary" ${state.selectedAudio === a ? 'selected' : ''}>${langLabel(a)}</option>`).join('')}
                                </select>
                            </label>
                        ` : ''}

                        <label class="flex items-center gap-1.5 bg-theme-pill px-2.5 py-1 rounded-xl border border-theme-default text-[10px] font-mono">
                            <span class="text-theme-muted uppercase font-bold text-[9px]">Legenda:</span>
                            <select id="player-pro-sub-select" onchange="window.applyPlayerProSubtitleTrack(this.value)" class="bg-theme-surface text-theme-primary font-bold focus:outline-none cursor-pointer rounded-lg px-1.5 py-0.5 border border-theme-default">
                                <option value="off" class="bg-theme-surface text-theme-primary" ${!state.selectedSubtitleTrackId || state.selectedSubtitleTrackId === 'off' ? 'selected' : ''}>Desativada</option>
                                ${subTracks.map((st, idx) => `<option value="${st.id}" class="bg-theme-surface text-theme-primary" ${state.selectedSubtitleTrackId === st.id ? 'selected' : ''}>${st.title || langLabel(st.language)} #${idx + 1}</option>`).join('')}
                            </select>
                        </label>
                    </div>
                </div>
            `;
        };

        window.syncPlayerProStreamSelection = async function(forceRequest = false) {
            const state = window.aniriumPlayerProState;
            if (!state || !state.manifest || !state.playbackTicket) return;

            const m = state.manifest;
            const qualities = Array.isArray(m.qualities) ? m.qualities : [];
            if (qualities.length > 0 && (!state.selectedQuality || !qualities.includes(state.selectedQuality))) {
                state.selectedQuality = qualities[0];
            }

            const audios = Array.isArray(m.audioChoices) && m.audioChoices.length > 0
                ? m.audioChoices
                : (Array.isArray(m.audios) ? m.audios : []);
            if (audios.length > 0 && (!state.selectedAudio || !audios.includes(state.selectedAudio))) {
                state.selectedAudio = audios.includes('jpn') ? 'jpn' : audios[0];
            }

            state.subtitleTracks = Array.isArray(m.subtitleTracks) ? m.subtitleTracks : [];
            if (!state.selectedSubtitleTrackId && state.subtitleTracks.length > 0) {
                const ptTrack = state.subtitleTracks.find(t => /por|pt/i.test(t.language || ''));
                state.selectedSubtitleTrackId = (ptTrack || state.subtitleTracks[0]).id;
            }

            window.renderPlayerProUnifiedBar();

            if (!state.selectedQuality) return;

            // Verifica se já há uma variante pronta no manifesto para a qualidade selecionada
            const readyVariant = (Array.isArray(m.variants) ? m.variants : []).find(
                v => v.quality === state.selectedQuality && v.status === 'ready' && v.playlistUrl
            );

            if (readyVariant && readyVariant.playlistUrl) {
                const streamUrl = `http://127.0.0.1:4004${readyVariant.playlistUrl}?playbackTicket=${encodeURIComponent(state.playbackTicket)}`;
                window.playStreamInAddonModal(streamUrl, `Anirium+ Unificado (${state.selectedQuality})`);
                return;
            }

            // Solicita preparação da janela/variante sob demanda quando necessário
            const requestSignature = `${state.selectedQuality}:${state.selectedAudio || ''}`;
            if (!forceRequest && state.requestedQuality === requestSignature) {
                return;
            }
            state.requestedQuality = requestSignature;

            const statusText = document.getElementById('anirium-player-pro-status-text');
            if (statusText) {
                statusText.innerText = `Unificando ${m.activeLinks || state.sourcesCount || 1} fonte(s) P2P em ${state.selectedQuality} (${m.peers || 0} peers conectados)...`;
            }

            try {
                if (m.windowOnDemand) {
                    if (state.windowController) {
                        try { state.windowController.abort(); } catch (e) {}
                    }
                    const ctrl = new AbortController();
                    state.windowController = ctrl;

                    const video = document.getElementById('anirium-player-pro-video');
                    const pos = (video && Number.isFinite(video.currentTime) && video.currentTime > 0) ? Math.floor(video.currentTime) : 0;

                    const sessionRes = await fetch(`http://127.0.0.1:4004/playback/session?playbackTicket=${encodeURIComponent(state.playbackTicket)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: ctrl.signal,
                        body: JSON.stringify({
                            action: 'seek',
                            quality: state.selectedQuality,
                            position: pos,
                            playing: true,
                            audio: state.selectedAudio || '',
                            subtitle: state.selectedSubtitleTrackId && state.selectedSubtitleTrackId !== 'off' ? state.selectedSubtitleTrackId : ''
                        })
                    });

                    if (sessionRes.ok) {
                        const sessionData = await sessionRes.json().catch(() => ({}));
                        const win = sessionData.window;
                        if (win && win.status === 'ready' && win.playlistUrl) {
                            const streamUrl = `http://127.0.0.1:4004${win.playlistUrl}?playbackTicket=${encodeURIComponent(state.playbackTicket)}`;
                            window.playStreamInAddonModal(streamUrl, `Anirium+ Unificado (${state.selectedQuality})`);
                        }
                    }
                } else if (m.qualityOnDemand) {
                    await fetch(`http://127.0.0.1:4004/playback/variant?quality=${encodeURIComponent(state.selectedQuality)}&playbackTicket=${encodeURIComponent(state.playbackTicket)}`, {
                        method: 'POST'
                    });
                }
            } catch (e) {}
        };

        window.promptAddonDirectStreamUrl = function() {
            const url = prompt('Cole a URL direta do vídeo (.mp4, .webm, .m3u8) ou link de stream HTTP:');
            if (url && url.trim()) {
                window.playStreamInAddonModal(url.trim(), 'Stream Direto');
            }
        };

        window.stepPlayerProEpisode = function(delta) {
            const ctx = window.currentPlayerProContext;
            if (!ctx) return;
            const currentNum = parseInt(ctx.epNum, 10) || 1;
            const totalEps = parseInt(ctx.totalEpisodes, 10) || 0;
            const nextNum = currentNum + delta;
            if (nextNum < 1) return;
            if (totalEps > 0 && nextNum > totalEps) {
                console.warn('[PlayerPro] Próximo episódio ultrapassa total catalogado:', nextNum, totalEps);
                return;
            }
            if (typeof window.stopActivePlayerProIframe === 'function') {
                window.stopActivePlayerProIframe();
            }
            const nextEpId = `${ctx.workId}:ep:${nextNum}`;
            if (document.getElementById('episode-inline-player-host')) {
                window.pushNavigation('episode', nextEpId, `${ctx.workTitle} • Episódio ${nextNum}`);
                return;
            }
            window.launchExternalVideoAddon(ctx.workId, nextEpId, String(nextNum), ctx.workTitle);
        };

        window.mountInlineEpisodePlayer = async function(workId, epId, epNum, workTitle) {
            if (!window.hasActiveAddonCapability('video')) return;
            if (typeof window.stopActivePlayerProIframe === 'function') {
                window.stopActivePlayerProIframe();
            }
            const inlineHost = document.getElementById('episode-inline-player-host');
            if (!inlineHost) {
                return window.launchExternalVideoAddon(workId, epId, epNum, workTitle);
            }

            window.stopPlayerProEngine(false);

            const cleanEpNum = parseInt(epNum, 10) || 1;
            const resolvedEpId = epId || `${workId}:ep:${cleanEpNum}`;
            if (window.AniriumWatchParty?.isLeader?.()) {
                window.AniriumWatchParty.sendControl('change_episode', 0, {
                    workId: workId,
                    episodeId: resolvedEpId,
                    episodeNumber: cleanEpNum,
                });
                const discList = document.getElementById('discussion-comments-list');
                const discSection = discList?.closest('section, .rounded-2xl, .rounded-3xl') || discList?.parentElement;
                if (discSection) {
                    discSection.style.display = 'none';
                }
            }
            const stage = document.getElementById('episode-context-stage')
                || document.getElementById('work-context-stage')
                || document.getElementById('arc-context-stage');

            const malId = parseInt(stage?.getAttribute('data-mal-id') || '0', 10) || 0;
            const episodeCount = parseInt(stage?.getAttribute('data-episode-count') || '0', 10) || 0;
            const workFormat = stage?.getAttribute('data-work-format') || 'TV';
            const cleanTitle = String(workTitle || stage?.getAttribute('data-work-title') || 'Anime').trim();
            const englishTitle = String(stage?.getAttribute('data-work-english-title') || '').trim();
            const romajiTitle = String(stage?.getAttribute('data-work-romaji-title') || '').trim();
            const nativeTitle = String(stage?.getAttribute('data-work-native-title') || '').trim();
            let titleAliasesJson = '[]';
            try {
                const rawAliases = stage?.getAttribute('data-work-aliases') || '[]';
                const parsedAliases = JSON.parse(rawAliases);
                if (Array.isArray(parsedAliases) && parsedAliases.length > 0) {
                    titleAliasesJson = JSON.stringify(parsedAliases.map(a => String(a || '').trim()).filter(Boolean).slice(0, 24));
                }
            } catch (e) {}

            let resolvedSeason = 1;
            const seasonMatch = cleanTitle.match(/(?:(\d+)(?:st|nd|rd|th)?\s+season)|(?:season\s+(\d+))|(?:temporada\s+(\d+))|(?:\bS(\d+)\b)|(?:\s+(\d+)\b$)/i);
            if (seasonMatch) {
                resolvedSeason = parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3] || seasonMatch[4] || seasonMatch[5], 10) || 1;
            }

            window.currentPlayerProContext = {
                workId: workId || '',
                epId: resolvedEpId,
                epNum: cleanEpNum,
                workTitle: cleanTitle,
                englishTitle: englishTitle,
                romajiTitle: romajiTitle,
                nativeTitle: nativeTitle,
                totalEpisodes: episodeCount
            };

            const deviceId = window.getValidDeviceId();
            const playerSessionId = window.getValidPlayerSessionId();
            let sessionToken = '';

            try {
                const tokenRes = await fetch('/api/service/session', {
                    cache: 'no-store',
                    headers: {
                        'Accept': 'application/json',
                        'x-anirium-device': deviceId,
                        'x-anirium-player-session': playerSessionId
                    }
                });
                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json().catch(() => ({}));
                    sessionToken = tokenData.token || '';
                }
            } catch (err) {}

            const normalizedEpKey = `${workId}:ep:${cleanEpNum}`;
            const localSavedSec = parseInt(localStorage.getItem(`anirium_resume_${normalizedEpKey}`) || (epId ? localStorage.getItem(`anirium_resume_${epId}`) : '0') || '0', 10);
            const savedPref = window.userPreferences ? (
                window.userPreferences[resolvedEpId] ||
                window.userPreferences[normalizedEpKey] ||
                window.userPreferences[`episode:${resolvedEpId}`] ||
                (epId ? window.userPreferences[epId] : null)
            ) : null;
            const prefSec = savedPref && Number(savedPref.progress_seconds) > 0 ? Number(savedPref.progress_seconds) : 0;
            const resumeSeconds = Math.max(localSavedSec, prefSec);

            const embedQuery = new URLSearchParams({
                token: sessionToken,
                deviceId: deviceId,
                playerSessionId: playerSessionId,
                workId: workId || '',
                epId: resolvedEpId,
                ep: String(cleanEpNum),
                season: String(resolvedSeason),
                title: cleanTitle,
                titleEnglish: englishTitle,
                titleRomaji: romajiTitle,
                titleNative: nativeTitle,
                aliases: titleAliasesJson,
                malId: String(malId),
                format: workFormat,
                totalEpisodes: String(episodeCount),
                resume: window.__aniriumWatchPartyLocked ? '0' : String(resumeSeconds),
                wpLocked: window.__aniriumWatchPartyLocked ? '1' : '0',
                wpPhase: String(window.__aniriumWatchPartyPhase || ''),
                _v: String(Date.now())
            });

            const embedSrc = `/addons/player-pro/?${embedQuery.toString()}`;
            const badges = document.getElementById('episode-stage-badges');
            if (badges) badges.classList.add('hidden');
            inlineHost.classList.remove('hidden');
            inlineHost.innerHTML = `
                <iframe
                    id="anirium-player-pro-iframe"
                    src="${embedSrc}"
                    allow="fullscreen; autoplay; encrypted-media"
                    style="width: 100%; height: 100%; border: none; display: block;"
                    class="w-full h-full border-0 bg-black">
                </iframe>
            `;
        };

        window.launchExternalVideoAddon = async function(workId, epId, epNum, workTitle) {
            if (!window.hasActiveAddonCapability('video')) {
                alert('Nenhum Add-on de Vídeo ativo. Ative o Anirium Player Pro (Anirium+) no seu perfil.');
                return;
            }

            // Encerra qualquer ciclo anterior sem revogar o lease do mesmo dispositivo
            window.stopPlayerProEngine(false);

            const cleanEpNum = parseInt(epNum, 10) || 1;
            const resolvedEpId = epId || `${workId}:ep:${cleanEpNum}`;
            if (window.AniriumWatchParty?.isLeader?.()) {
                window.AniriumWatchParty.sendControl('change_episode', 0, {
                    workId: workId,
                    episodeId: resolvedEpId,
                    episodeNumber: cleanEpNum,
                });
                const discList = document.getElementById('discussion-comments-list');
                const discSection = discList?.closest('section, .rounded-2xl, .rounded-3xl') || discList?.parentElement;
                if (discSection) {
                    discSection.style.display = 'none';
                }
            }
            const stage = document.getElementById('episode-context-stage')
                || document.getElementById('work-context-stage')
                || document.getElementById('arc-context-stage');

            const malId = parseInt(stage?.getAttribute('data-mal-id') || '0', 10) || 0;
            const episodeCount = parseInt(stage?.getAttribute('data-episode-count') || '0', 10) || 0;
            const workFormat = stage?.getAttribute('data-work-format') || 'TV';
            const cleanTitle = String(workTitle || stage?.getAttribute('data-work-title') || 'Anime').trim();
            const englishTitle = String(stage?.getAttribute('data-work-english-title') || '').trim();
            const romajiTitle = String(stage?.getAttribute('data-work-romaji-title') || '').trim();
            const nativeTitle = String(stage?.getAttribute('data-work-native-title') || '').trim();
            let titleAliasesJson = '[]';
            try {
                const rawAliases = stage?.getAttribute('data-work-aliases') || '[]';
                const parsedAliases = JSON.parse(rawAliases);
                if (Array.isArray(parsedAliases) && parsedAliases.length > 0) {
                    titleAliasesJson = JSON.stringify(parsedAliases.map(a => String(a || '').trim()).filter(Boolean).slice(0, 24));
                }
            } catch (e) {}

            // Detecta temporada no título (ex: "2nd Season", "Season 2", "Temporada 2", "S2", ou dígitos finais como "Da Wang Rao Ming 3")
            let resolvedSeason = 1;
            const seasonMatch = cleanTitle.match(/(?:(\d+)(?:st|nd|rd|th)?\s+season)|(?:season\s+(\d+))|(?:temporada\s+(\d+))|(?:\bS(\d+)\b)|(?:\s+(\d+)\b$)/i);
            if (seasonMatch) {
                resolvedSeason = parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3] || seasonMatch[4] || seasonMatch[5], 10) || 1;
            }

            window.currentPlayerProContext = {
                workId: workId || '',
                epId: resolvedEpId,
                epNum: cleanEpNum,
                workTitle: cleanTitle,
                englishTitle: englishTitle,
                romajiTitle: romajiTitle,
                nativeTitle: nativeTitle,
                totalEpisodes: episodeCount
            };

            const modal = document.getElementById('modal-external-addon');
            const iconEl = document.getElementById('external-addon-icon');
            const titleEl = document.getElementById('external-addon-title');
            const subEl = document.getElementById('external-addon-subtitle');
            const viewport = document.getElementById('external-addon-viewport');
            if (!modal || !viewport) return;

            if (iconEl) iconEl.innerText = '▶';
            if (titleEl) titleEl.innerText = `${cleanTitle} • Episódio ${cleanEpNum}${episodeCount > 0 ? ` / ${episodeCount}` : ''}`;
            if (subEl) subEl.innerText = 'Embed Externo Soberano: github.com/GodZlayer/anirium-embeds (Player Pro)';

            modal.classList.remove('opacity-0', 'pointer-events-none');

            // 1. Obtém credencial de sessão do dispositivo para o Anirium Service 4004
            const deviceId = window.getValidDeviceId();
            const playerSessionId = window.getValidPlayerSessionId();
            let sessionToken = '';

            try {
                const tokenRes = await fetch('/api/service/session', {
                    cache: 'no-store',
                    headers: {
                        'Accept': 'application/json',
                        'x-anirium-device': deviceId,
                        'x-anirium-player-session': playerSessionId
                    }
                });
                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json().catch(() => ({}));
                    sessionToken = tokenData.token || '';
                }
            } catch (err) {}

            // Recupera o progresso salvo para retomada exata (Resume at Exact Instant)
            // Checa por resolvedEpId (UUID ou workId:ep:N) e por chave normalizada workId:ep:N
            const normalizedEpKey = `${workId}:ep:${cleanEpNum}`;
            const localSavedSec = parseInt(localStorage.getItem(`anirium_resume_${normalizedEpKey}`) || (epId ? localStorage.getItem(`anirium_resume_${epId}`) : '0') || '0', 10);
            const savedPref = window.userPreferences ? (
                window.userPreferences[resolvedEpId] ||
                window.userPreferences[normalizedEpKey] ||
                window.userPreferences[`episode:${resolvedEpId}`] ||
                (epId ? window.userPreferences[epId] : null)
            ) : null;
            const prefSec = savedPref && Number(savedPref.progress_seconds) > 0 ? Number(savedPref.progress_seconds) : 0;
            const resumeSeconds = Math.max(localSavedSec, prefSec);

            // Prioriza servir o módulo Player Pro com a mesma origem canônica (https://anirium.com.br/addons/player-pro/)
            // para garantir conformidade imediata com o Go anirium-service (CORS/Private Network/trustedPlayerOrigin)
            const playerAddon = (window.allUserAddons || []).find(a => a.id === 'player-pro');
            const canonicalEmbedUrl = '/addons/player-pro/';
            const externalEmbedBaseUrl = canonicalEmbedUrl;

            const embedQuery = new URLSearchParams({
                token: sessionToken,
                deviceId: deviceId,
                playerSessionId: playerSessionId,
                workId: workId || '',
                epId: resolvedEpId,
                ep: String(cleanEpNum),
                season: String(resolvedSeason),
                title: cleanTitle,
                titleEnglish: englishTitle,
                titleRomaji: romajiTitle,
                titleNative: nativeTitle,
                aliases: titleAliasesJson,
                malId: String(malId),
                format: workFormat,
                totalEpisodes: String(episodeCount),
                resume: window.__aniriumWatchPartyLocked ? '0' : String(resumeSeconds),
                wpLocked: window.__aniriumWatchPartyLocked ? '1' : '0',
                wpPhase: String(window.__aniriumWatchPartyPhase || ''),
                _v: String(Date.now())
            });

            const embedSrc = `${externalEmbedBaseUrl}?${embedQuery.toString()}`;

            viewport.innerHTML = `
                <iframe
                    id="anirium-player-pro-iframe"
                    src="${embedSrc}"
                    allow="fullscreen; autoplay; encrypted-media"
                    style="width: 100%; height: 100%; border: none; display: block;"
                    class="w-full h-full flex-1 border-0 bg-black">
                </iframe>
            `;
        };

        window.loadExternalVideoFile = function(input) {
            const file = input?.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            const video = document.getElementById('anirium-player-pro-video');
            if (video) {
                window.playStreamInAddonModal(url, `Arquivo Local: ${file.name}`);
            } else {
                const viewport = document.getElementById('external-addon-viewport');
                if (viewport) {
                    viewport.innerHTML = `<video src="${url}" controls autoplay playsinline class="w-full max-h-[65vh] rounded-2xl bg-black"></video>`;
                }
            }
        };

        window.launchExternalMangaAddon = function(workId, chapterNum, workTitle) {
            if (!window.hasActiveAddonCapability('manga')) {
                alert('Nenhum Add-on de Leitura de Mangá ativo. Ative o Anirium Manga Reader Pro (Anirium+) ou um Add-on de Leitura da Comunidade na aba Add-ons do seu perfil.');
                return;
            }

            const cleanChap = parseInt(chapterNum, 10) || 1;
            const cleanTitle = String(workTitle || 'Mangá').trim();
            window.currentMangaContext = { workId: workId || '', chapter: cleanChap, workTitle: cleanTitle };

            const modal = document.getElementById('modal-external-addon');
            const iconEl = document.getElementById('external-addon-icon');
            const titleEl = document.getElementById('external-addon-title');
            const subEl = document.getElementById('external-addon-subtitle');
            const viewport = document.getElementById('external-addon-viewport');
            if (!modal || !viewport) return;

            const mangaAddon = (window.allUserAddons || []).find(a => a.id === 'manga-reader-pro');
            const mangaEmbedBase = mangaAddon?.embed_url || 'https://godzlayer.github.io/anirium-embeds/manga/';
            const embedSrc = `${mangaEmbedBase}?workId=${encodeURIComponent(workId || '')}&chapter=${cleanChap}&title=${encodeURIComponent(cleanTitle)}`;

            if (iconEl) iconEl.innerText = '📖';
            if (titleEl) titleEl.innerText = `${cleanTitle} • Capítulo ${cleanChap}`;
            if (subEl) subEl.innerText = 'Embed Externo: github.com/GodZlayer/anirium-embeds (Manga Reader Pro)';

            modal.classList.remove('opacity-0', 'pointer-events-none');
            viewport.innerHTML = `
                <iframe
                    src="${embedSrc}"
                    allow="fullscreen"
                    class="w-full h-[65vh] rounded-2xl border border-theme-default bg-black shadow-2xl">
                </iframe>
            `;
        };

        window.addEventListener('message', async (event) => {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'anirium:manga:step-chapter' && window.currentMangaContext) {
                const nextChap = Math.max(1, (window.currentMangaContext.chapter || 1) + (Number(msg.delta) || 0));
                window.launchExternalMangaAddon(window.currentMangaContext.workId, nextChap, window.currentMangaContext.workTitle);
            } else if (msg.type === 'anirium:player:step-episode') {
                window.stepPlayerProEpisode(Number(msg.delta) || 1);
            } else if (msg.type === 'anirium:player:playback-progress') {
                // Sincroniza posição exata de reprodução para retomada instantânea (Resume at Exact Instant)
                const epId = msg.epId;
                const workId = msg.workId;
                const epNum = msg.episode;
                const targetSec = Math.floor(Number(msg.currentTime) || 0);
                const durSec = Math.floor(Number(msg.duration) || 0);
                const isEpCompleted = durSec > 60 && (targetSec / durSec >= 0.85 || targetSec >= durSec - 90);
                const resolvedStatus = isEpCompleted ? 'completed' : 'watching';

                if (targetSec >= 0) {
                    if (workId && epNum) {
                        localStorage.setItem(`anirium_resume_${workId}:ep:${epNum}`, String(targetSec));
                    }
                    if (epId) {
                        localStorage.setItem(`anirium_resume_${epId}`, String(targetSec));
                    }
                }

                if (epId && targetSec >= 0) {
                    if (!window.userPreferences) window.userPreferences = {};
                    if (!window.userPreferences[epId]) {
                        window.userPreferences[epId] = { target_id: epId, target_type: 'episode', progress_seconds: targetSec, status: resolvedStatus };
                    } else {
                        window.userPreferences[epId].progress_seconds = targetSec;
                        if (isEpCompleted || !window.userPreferences[epId].status) window.userPreferences[epId].status = resolvedStatus;
                    }
                    if (workId && epNum) {
                        const fallbackKey = `${workId}:ep:${epNum}`;
                        if (!window.userPreferences[fallbackKey]) {
                            window.userPreferences[fallbackKey] = { target_id: fallbackKey, target_type: 'episode', progress_seconds: targetSec, status: 'watching' };
                        } else {
                            window.userPreferences[fallbackKey].progress_seconds = targetSec;
                        }
                    }
                    if (window.currentUser) {
                        try {
                            fetch('/api/entity/preference', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json',
                                    'X-CSRF-TOKEN': '{{ csrf_token() }}'
                                },
                                body: JSON.stringify({
                                    target_id: epId,
                                    target_type: 'episode',
                                    progress_seconds: targetSec,
                                    status: resolvedStatus
                                })
                            }).catch(() => {});
                        } catch (e) {}
                    }
                }
            } else if (msg.type === 'anirium:player:request-token-renewal') {
                const deviceId = msg.deviceId || window.getValidDeviceId();
                const playerSessionId = window.getValidPlayerSessionId();
                try {
                    const res = await fetch('/api/service/session', {
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json',
                            'x-anirium-device': deviceId,
                            'x-anirium-player-session': playerSessionId
                        }
                    });
                    if (res.ok) {
                        const data = await res.json().catch(() => ({}));
                        if (data.token && event.source) {
                            event.source.postMessage({
                                type: 'anirium:core:token-renewed',
                                token: data.token
                            }, '*');
                        }
                    }
                } catch (e) {}
            } else if (msg.type === 'anirium:player:p2p-metrics' && msg.payload) {
                // Encaminha a telemetria do player / Anirium Service para o pipeline de gamificação do Core
                if (window.currentUser) {
                    try {
                        const p = msg.payload;
                        const p2pEvent = {
                            target_type: 'global',
                            target_id: 'p2p_swarm',
                            event_type: 'p2p_seeding_heartbeat',
                            payload: {
                                delta_uploaded_bytes: p.delta_uploaded_bytes || 0,
                                delta_downloaded_bytes: p.delta_downloaded_bytes || 0,
                                seeding_seconds: 30,
                                upload_rate: p.upload_rate,
                                download_rate: p.download_rate,
                                peers: p.peers
                            }
                        };
                        const payloadBody = JSON.stringify({
                            machine_fingerprint: window.getValidDeviceId(),
                            events: [p2pEvent]
                        });
                        const tRes = await fetch('/api/telemetry/events', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-CSRF-TOKEN': '{{ csrf_token() }}'
                            },
                            body: payloadBody
                        });
                        if (tRes.ok) {
                            const tData = await tRes.json().catch(() => ({}));
                            if (tData.seeding_xp !== undefined && window.currentUser) {
                                window.currentUser.seeding_xp = tData.seeding_xp;
                                window.currentUser.bytes_uploaded = tData.bytes_uploaded;
                                window.currentUser.bytes_downloaded = tData.bytes_downloaded;
                                window.currentUser.active_minutes = tData.active_minutes;
                            }
                        }
                    } catch (err) {}
                }
            }
        });

        window.loadExternalMangaFiles = function(input) {
            const files = Array.from(input?.files || []);
            const viewport = document.getElementById('external-addon-viewport');
            if (files.length === 0 || !viewport) return;

            if (files[0].type === 'application/pdf' || files[0].name.toLowerCase().endsWith('.pdf')) {
                const pdfUrl = URL.createObjectURL(files[0]);
                viewport.innerHTML = `<iframe src="${pdfUrl}" class="w-full h-[70vh] rounded-2xl border border-theme-default bg-white"></iframe>`;
                return;
            }

            const imgsHtml = files.map(f => {
                const u = URL.createObjectURL(f);
                return `<img src="${u}" class="max-w-full rounded-xl shadow-lg mx-auto mb-3">`;
            }).join('');
            viewport.innerHTML = `<div class="w-full max-h-[70vh] overflow-y-auto space-y-3 p-2">${imgsHtml}</div>`;
        };

        window.refreshEntityComments = async function(type, id) {
            if (!type || !id) {
                const container = document.getElementById('entity-discussions-container');
                if (container) {
                    type = type || container.getAttribute('data-target-type');
                    id = id || container.getAttribute('data-target-id');
                }
            }
            if (!type || !id) return;

            const listEl = document.getElementById('discussion-comments-list');
            if (!listEl) return;

            const key = `${type}:${id}`;
            const existingComments = window.entityDiscussionCache.get(key) || [];
            const lastCursor = window.entityDiscussionCursors.get(key);

            let url = `/api/entity/comments/${type}/${id}`;
            if (lastCursor) {
                url += `?since=${encodeURIComponent(lastCursor)}`;
            }

            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data.cursor) {
                        window.entityDiscussionCursors.set(key, data.cursor);
                    }

                    const incoming = data.comments || [];
                    if (data.is_delta && incoming.length > 0) {
                        // Mesclar apenas deltas no topo sem recarregar tudo
                        const merged = [...incoming, ...existingComments];
                        window.entityDiscussionCache.set(key, merged);
                        window.renderCommentsList(listEl, merged);
                    } else if (!data.is_delta) {
                        window.entityDiscussionCache.set(key, incoming);
                        window.renderCommentsList(listEl, incoming);
                    } else if (data.is_delta && incoming.length === 0) {
                        // Sem novidades
                        console.log('[Anirium Sync] Discussão sincronizada (zero deltas)');
                    }
                }
            } catch (err) {
                console.warn('[Anirium Discussions] Falha na sincronização:', err);
            }
        };

        window.renderCommentsList = function(container, comments) {
            if (!comments || comments.length === 0) {
                container.innerHTML = `
                    <div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="discussion.empty">
                        Nenhum comentário ou análise ainda. Seja o primeiro a interagir!
                    </div>
                `;
                return;
            }

            container.innerHTML = comments.map(c => {
                const author = c.user_name || 'Membro Anirium';
                const avatar = c.user_avatar || '/assets/icons/nav/profile.png';
                const date = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                const isSpoiler = Boolean(c.contains_spoilers);

                return `
                    <div class="p-3 rounded-2xl bg-theme-raised border border-theme-default flex flex-col gap-1.5 transition-all" data-comment-id="${c.id}" data-user-id="${c.user_id}">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="w-6 h-6 rounded-full bg-theme-pill border border-theme-default flex items-center justify-center text-[10px] font-bold text-theme-accent">
                                    ${author.charAt(0).toUpperCase()}
                                </span>
                                <span class="text-xs font-bold text-theme-primary">${author}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                ${isSpoiler ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30">SPOILER</span>' : ''}
                                <span class="text-[9px] font-mono text-theme-muted">${date}</span>
                            </div>
                        </div>
                        <div class="text-xs text-theme-secondary font-sans leading-relaxed pl-8 ${isSpoiler ? 'filter blur-sm hover:blur-none transition-all cursor-pointer select-none' : ''}">
                            ${c.comment_body}
                        </div>
                    </div>
                `;
            }).join('');
        };

        window.submitEntityComment = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }

            const input = document.getElementById('discussion-input-body');
            const spoilerCheck = document.getElementById('discussion-spoiler-check');
            if (!input || !input.value.trim()) return;

            const text = input.value.trim();
            const containsSpoilers = spoilerCheck ? spoilerCheck.checked : false;

            try {
                const res = await fetch('/api/entity/comments', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({
                        target_type: type,
                        target_id: id,
                        comment_body: text,
                        contains_spoilers: containsSpoilers
                    })
                });

                if (res.ok) {
                    input.value = '';
                    if (spoilerCheck) spoilerCheck.checked = false;
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao enviar comentário.');
                }
            } catch (err) {
                console.warn('[Anirium Discussions] Falha ao enviar comentário:', err);
            }
        };
window.toggleEntityBookmark = async function(type, id, btnEl) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const pref = window.userPreferences && window.userPreferences[id];
            const legacyBtn = document.getElementById('btn-action-bookmark');
            const isCurrently = pref
                ? Boolean(pref.bookmarked)
                : (btnEl && btnEl.dataset && btnEl.dataset.bookmarked !== undefined
                    ? btnEl.dataset.bookmarked === '1'
                    : Boolean(legacyBtn && legacyBtn.classList.contains('bg-theme-accent')));
            const nextVal = !isCurrently;

            if (legacyBtn) {
                if (nextVal) {
                    legacyBtn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-accent text-theme-inverse border-theme-accent shadow-md";
                } else {
                    legacyBtn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }

            document.querySelectorAll(`[data-bookmark-btn][data-entity-id="${CSS.escape(String(id))}"]`).forEach((el) => {
                el.dataset.bookmarked = nextVal ? '1' : '0';
                el.classList.toggle('text-theme-accent', nextVal);
                el.classList.toggle('border-theme-accent', nextVal);
                el.classList.toggle('text-theme-muted', !nextVal);
                el.classList.toggle('hover:text-white', !nextVal);
                const icon = el.querySelector('[data-bookmark-icon]');
                if (icon) icon.textContent = nextVal ? '♥' : '♡';
            });

            await window.submitPreference(id, type, { bookmarked: nextVal });
        };

        window.toggleEntityLike = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const btn = document.getElementById('btn-action-like');
            const isCurrently = btn && btn.classList.contains('bg-[var(--color-state-filler,#F43F5E)]');
            const nextVal = !isCurrently;
            
            if (btn) {
                if (nextVal) {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-[var(--color-state-filler,#F43F5E)] text-white border-[var(--color-state-filler,#F43F5E)] shadow-md";
                } else {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }
            await window.submitPreference(id, type, { liked: nextVal });
        };

        window.submitEntityRating = async function(type, id, score) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const valLabel = document.getElementById('user-rating-value');
            if (valLabel) valLabel.innerText = `${score}/10`;
            await window.submitPreference(id, type, { user_score: score });
        };

        window.setEntityStatus = async function(type, id, status) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            ['watching', 'completed', 'plan_to', 'dropped'].forEach(s => {
                const b = document.getElementById(`btn-status-${s}`);
                if (b) {
                    if (s === status) {
                        b.className = "px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase transition-all cursor-pointer border bg-theme-accent text-theme-inverse border-theme-accent shadow-md";
                    } else {
                        b.className = "px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase transition-all cursor-pointer border bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                    }
                }
            });
            await window.submitPreference(id, type, { status: status });
        };

        window.toggleEntityWatched = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const btn = document.getElementById('btn-action-watched');
            const isWatched = btn && btn.classList.contains('bg-[var(--color-state-canon,#10B981)]/20');
            const nextStatus = isWatched ? 'watching' : 'completed';

            if (btn) {
                if (!isWatched) {
                    btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40";
                } else {
                    btn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }
            await window.submitPreference(id, type, { status: nextStatus });
        };

        window.toggleUserBookmark = function(id, type, btnEl) {
            return window.toggleEntityBookmark(type || 'universe', id, btnEl);
        };

        // =========================================================================
        // STREAM SSE UNIFICADO (GET /api/stream) — TODO ESTADO AO VIVO DO SERVIDOR
        // =========================================================================
        window.AniriumSSE = (() => {
            let source = null;
            let currentScopeKey = '';

            function buildUrl(scope = {}) {
                const params = new URLSearchParams();
                if (scope.entityType && scope.entityId) {
                    params.set('entity_type', scope.entityType);
                    params.set('entity_id', scope.entityId);
                }
                if (scope.roomCode) {
                    params.set('room_code', scope.roomCode);
                }
                const qs = params.toString();
                return qs ? `/api/stream?${qs}` : '/api/stream';
            }

            function emit(name, detail) {
                window.dispatchEvent(new CustomEvent(`anirium:sse:${name}`, { detail }));
            }

            function handlePreferenceConfirmed(payload) {
                const pref = payload?.preference;
                const targetId = payload?.target_id || pref?.target_id;
                if (!pref || !targetId) return;

                if (!window.userPreferences || typeof window.userPreferences !== 'object') {
                    window.userPreferences = {};
                }
                window.userPreferences[targetId] = pref;
                if (pref.entity_id) window.userPreferences[pref.entity_id] = pref;

                // Sincronizar estrelas de avaliação na tela (inclusive em outras abas)
                if (pref.user_score !== undefined && pref.user_score !== null) {
                    const score = Number(pref.user_score) || 0;
                    document.querySelectorAll(`[data-rating-widget][data-target-id="${CSS.escape(String(targetId))}"]`).forEach((wrap) => {
                        wrap.dataset.currentScore = String(score);
                        wrap.querySelectorAll('[data-star-value]').forEach((el) => {
                            const v = Number(el.dataset.starValue || 0);
                            el.classList.toggle('text-amber-400', v <= score);
                            el.classList.toggle('text-theme-muted/40', v > score);
                        });
                        const lbl = wrap.querySelector('[data-rating-label]');
                        if (lbl) lbl.textContent = score > 0 ? `${score}/10` : '—';
                    });
                }

                // Sincronizar botões de favorito na tela
                if (typeof pref.bookmarked === 'boolean') {
                    const fav = Boolean(pref.bookmarked);
                    document.querySelectorAll(`[data-bookmark-btn][data-entity-id="${CSS.escape(String(targetId))}"]`).forEach((el) => {
                        el.dataset.bookmarked = fav ? '1' : '0';
                        el.classList.toggle('text-theme-accent', fav);
                        el.classList.toggle('border-theme-accent', fav);
                        el.classList.toggle('text-theme-muted', !fav);
                        el.classList.toggle('hover:text-white', !fav);
                        const icon = el.querySelector('[data-bookmark-icon]');
                        if (icon) icon.textContent = fav ? '♥' : '♡';
                    });
                }

                emit('preference.confirmed', payload);
            }

            function handleCommentPosted(payload) {
                const comment = payload?.comment;
                const type = payload?.target_type;
                const id = payload?.target_id;
                if (!comment || !type || !id) return;

                const key = `${type}:${id}`;
                const existing = window.entityDiscussionCache.get(key) || [];
                if (!existing.some((c) => Number(c.id) === Number(comment.id))) {
                    const merged = [comment, ...existing];
                    window.entityDiscussionCache.set(key, merged);
                    const container = document.getElementById('entity-discussions-container');
                    const listEl = document.getElementById('discussion-comments-list');
                    if (listEl && container && container.dataset.targetId === String(id)) {
                        window.renderCommentsList(listEl, merged);
                    }
                }
                emit('comment.posted', payload);
            }

            function connect(scope = {}) {
                if (typeof EventSource === 'undefined') return;
                const scopeKey = `${scope.entityType || ''}:${scope.entityId || ''}:${scope.roomCode || ''}`;
                if (source && scopeKey === currentScopeKey && source.readyState !== EventSource.CLOSED) {
                    return;
                }
                if (source) {
                    try { source.close(); } catch {}
                    source = null;
                }
                currentScopeKey = scopeKey;
                source = new EventSource(buildUrl(scope));

                source.addEventListener('preference.confirmed', (e) => {
                    try { handlePreferenceConfirmed(JSON.parse(e.data)); } catch {}
                });
                source.addEventListener('entity.rating_updated', (e) => {
                    try { emit('entity.rating_updated', JSON.parse(e.data)); } catch {}
                });
                source.addEventListener('comment.posted', (e) => {
                    try { handleCommentPosted(JSON.parse(e.data)); } catch {}
                });
                source.addEventListener('progress.updated', (e) => {
                    try { emit('progress.updated', JSON.parse(e.data)); } catch {}
                });
                source.addEventListener('pix.paid', (e) => {
                    try { emit('pix.paid', JSON.parse(e.data)); } catch {}
                });
                source.addEventListener('subscription.updated', (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (window.currentUser && data.tier) window.currentUser.tier = Number(data.tier);
                        emit('subscription.updated', data);
                    } catch {}
                });
                source.addEventListener('account.updated', (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (window.currentUser && typeof data.adult_content_enabled === 'boolean') {
                            window.currentUser.adult_content_enabled = data.adult_content_enabled;
                        }
                        emit('account.updated', data);
                    } catch {}
                });
                source.addEventListener('watch_party.updated', (e) => {
                    try { emit('watch_party.updated', JSON.parse(e.data)); } catch {}
                });
                source.addEventListener('watch_party.message', (e) => {
                    try { emit('watch_party.message', JSON.parse(e.data)); } catch {}
                });
            }

            return { connect };
        })();

        // Fonte Única de Verdade no Cliente (SQLite WASM + OPFS/IndexedDB + Delta Sync — Zero JSON)
        window.AniriumCatalogSSOT = (() => {
            const BIN_DB_NAME = 'anirium_sqlite_bin_v5';
            const BIN_STORE = 'files';
            const FILE_KEY = 'catalog-public-v5.sqlite';
            let sqlDb = null;
            let revision = 0;
            let bootPromise = null;

            const setOverlay = (show, statusText, pct, metaText) => {
                const el = document.getElementById('anirium-catalog-boot-overlay');
                if (!el) return;
                if (show) {
                    el.classList.remove('hidden');
                    el.classList.add('flex');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('flex');
                }
                const st = document.getElementById('anirium-boot-status');
                const bar = document.getElementById('anirium-boot-bar');
                const mt = document.getElementById('anirium-boot-meta');
                if (st && statusText) st.textContent = statusText;
                if (bar && typeof pct === 'number') bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
                if (mt && metaText) mt.textContent = metaText;
            };

            const loadSqlJs = () => new Promise((resolve, reject) => {
                if (typeof window.initSqlJs === 'function') {
                    window.initSqlJs({ locateFile: f => `/wasm/${f}` }).then(resolve, reject);
                    return;
                }
                const s = document.createElement('script');
                s.src = '/wasm/sql-wasm.js';
                s.async = true;
                s.onload = () => window.initSqlJs({ locateFile: f => `/wasm/${f}` }).then(resolve, reject);
                s.onerror = () => reject(new Error('Falha ao carregar sql-wasm.js'));
                document.head.appendChild(s);
            });

            const openBinIdb = () => new Promise((resolve, reject) => {
                const req = indexedDB.open(BIN_DB_NAME, 1);
                req.onupgradeneeded = () => {
                    if (!req.result.objectStoreNames.contains(BIN_STORE)) req.result.createObjectStore(BIN_STORE);
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            const readCachedBytes = async () => {
                try {
                    if (navigator.storage?.getDirectory) {
                        const root = await navigator.storage.getDirectory();
                        const handle = await root.getFileHandle(FILE_KEY);
                        const file = await handle.getFile();
                        const buf = await file.arrayBuffer();
                        if (buf.byteLength > 4096) return new Uint8Array(buf);
                    }
                } catch (_) {}
                try {
                    const idb = await openBinIdb();
                    return await new Promise((resolve) => {
                        const req = idb.transaction(BIN_STORE, 'readonly').objectStore(BIN_STORE).get(FILE_KEY);
                        req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : null);
                        req.onerror = () => resolve(null);
                    });
                } catch (_) {
                    return null;
                }
            };

            const writeCachedBytes = async (bytes) => {
                try {
                    if (navigator.storage?.getDirectory) {
                        const root = await navigator.storage.getDirectory();
                        const handle = await root.getFileHandle(FILE_KEY, { create: true });
                        const writable = await handle.createWritable();
                        await writable.write(bytes);
                        await writable.close();
                        return;
                    }
                } catch (_) {}
                try {
                    const idb = await openBinIdb();
                    await new Promise((resolve, reject) => {
                        const tx = idb.transaction(BIN_STORE, 'readwrite');
                        tx.objectStore(BIN_STORE).put(bytes, FILE_KEY);
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => reject(tx.error);
                    });
                } catch (_) {}
            };

            const downloadAndGunzip = async (url) => {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`SQLite HTTP ${res.status}`);
                const total = Number(res.headers.get('content-length') || 0);
                let received = 0;
                const chunks = [];
                if (res.body && typeof res.body.getReader === 'function') {
                    const reader = res.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                        received += value.byteLength;
                        const mb = (received / 1048576).toFixed(1);
                        const pct = total > 0 ? Math.round((received / total) * 75) + 10 : 45;
                        setOverlay(true, 'Baixando base SQLite para cache local...', pct, total > 0 ? `${mb} MB / ${(total / 1048576).toFixed(1)} MB` : `${mb} MB baixados`);
                    }
                } else {
                    chunks.push(new Uint8Array(await res.arrayBuffer()));
                }
                setOverlay(true, 'Descompactando e montando SQLite local...', 90, 'Preparando índices instantâneos...');
                const blob = new Blob(chunks);
                if (typeof DecompressionStream === 'function') {
                    const ds = new DecompressionStream('gzip');
                    const decompressed = await new Response(blob.stream().pipeThrough(ds)).arrayBuffer();
                    return new Uint8Array(decompressed);
                }
                return new Uint8Array(await blob.arrayBuffer());
            };

            const applyDeltaToSqlite = (upserts, deletes) => {
                if (!sqlDb) return;
                sqlDb.run('BEGIN TRANSACTION;');
                try {
                    for (const id of deletes) {
                        sqlDb.run('DELETE FROM works WHERE id = ?;', [id]);
                        sqlDb.run('DELETE FROM schedules WHERE work_id = ?;', [id]);
                    }
                    const stmtWork = sqlDb.prepare('INSERT OR REPLACE INTO works (id, media, title, format, status, episode_count, is_adult, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?);');
                    const stmtSched = sqlDb.prepare('INSERT OR REPLACE INTO schedules (work_id, airing_day, airing_time, latest_episode_num) VALUES (?, ?, ?, ?);');
                    for (const w of upserts) {
                        stmtWork.run([w.id, w.media || 'anime', w.title || '', w.format || null, w.status || null, w.episode_count ?? null, w.is_adult ? 1 : 0, w.image || null]);
                        if (w.airing_day && ['RELEASING', 'PUBLISHING', 'CURRENT'].includes(String(w.status || '').toUpperCase())) {
                            stmtSched.run([w.id, String(w.airing_day).toLowerCase(), w.airing_time || null, w.latest_episode_num || 1]);
                        }
                    }
                    stmtWork.free();
                    stmtSched.free();
                    sqlDb.run('COMMIT;');
                } catch (err) {
                    sqlDb.run('ROLLBACK;');
                    throw err;
                }
            };

            async function boot() {
                if (sqlDb) return { revision, ready: true };
                if (bootPromise) return bootPromise;
                bootPromise = (async () => {
                    try {
                        const vRes = await fetch('/api/catalog/version', { headers: { Accept: 'application/json' } });
                        const vData = vRes.ok ? await vRes.json() : { revision: 1, db_url: '/data/catalog-public.sqlite.gz' };
                        const serverRev = Number(vData.revision || 1);
                        const dbUrl = String(vData.db_url || '/data/catalog-public.sqlite.gz');

                        let bytes = await readCachedBytes();
                        const SQL = await loadSqlJs();

                        if (!bytes) {
                            setOverlay(true, 'Baixando base SQLite inicial...', 10, 'Primeiro acesso · Cache permanente');
                            bytes = await downloadAndGunzip(dbUrl);
                            await writeCachedBytes(bytes);
                        }

                        sqlDb = new SQL.Database(bytes);
                        const metaRes = sqlDb.exec("SELECT value FROM meta WHERE key = 'revision' LIMIT 1;");
                        const localRev = Number(metaRes?.[0]?.values?.[0]?.[0] || 1);
                        revision = localRev;

                        if (localRev < serverRev) {
                            setOverlay(true, 'Aplicando atualizações incrementais...', 85, `Revisão #${localRev} → #${serverRev}`);
                            const dRes = await fetch(`/api/catalog/delta?since=${localRev}`, { headers: { Accept: 'application/json' } });
                            if (dRes.ok) {
                                const dData = await dRes.json();
                                applyDeltaToSqlite(dData.upserts || [], dData.deletes || []);
                                revision = Number(dData.revision || serverRev);
                                sqlDb.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('revision', ?);", [String(revision)]);
                                await writeCachedBytes(sqlDb.export());
                            }
                        }

                        setOverlay(false);
                        return { revision, ready: true };
                    } catch (err) {
                        console.warn('[AniriumCatalogSSOT] Fallback para API online:', err);
                        setOverlay(false);
                        return { revision: 0, ready: false };
                    } finally {
                        bootPromise = null;
                    }
                })();
                return bootPromise;
            }

            const countCache = new Map();

            const extractSearchTokens = (raw) => {
                return String(raw || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
                    .trim()
                    .split(/\s+/)
                    .filter(t => t.length >= 2)
                    .slice(0, 6);
            };

            function queryExploreSql(kind, query, page = 1, allowAdult = false) {
                const t0 = performance.now();
                const perPage = 24;
                const safePage = Math.max(1, Number(page || 1));
                const offset = (safePage - 1) * perPage;
                const mediaSql = kind === 'manga' ? "w.media IN ('manga', 'novel')" : "w.media = 'anime'";
                const adultSql = allowAdult ? '' : ' AND w.is_adult = 0';
                const visibilitySql = kind === 'manga'
                    ? " AND UPPER(COALESCE(w.format, '')) NOT IN ('DOUJINSHI', 'OTHER')"
                    : " AND w.image_url IS NOT NULL AND w.image_url != ''";
                const q = String(query || '').trim();
                const tokens = q !== '' ? extractSearchTokens(q) : [];

                let sql = '';
                let countSql = '';
                let params = [];

                if (tokens.length > 0) {
                    const intersectParts = [];
                    for (const tok of tokens) {
                        intersectParts.push('SELECT DISTINCT work_id FROM search_tokens WHERE token >= ? AND token < ?');
                        params.push(tok, `${tok}\uffff`);
                    }
                    const cte = `WITH matched AS (${intersectParts.join(' INTERSECT ')})`;
                    sql = `${cte}
                           SELECT w.id, w.title, w.format, w.status, w.episode_count, w.is_adult, w.image_url
                           FROM matched m
                           INNER JOIN works w ON w.id = m.work_id
                           WHERE ${mediaSql}${adultSql}${visibilitySql}
                           ORDER BY w.title ASC
                           LIMIT ${perPage} OFFSET ${offset};`;
                    countSql = `${cte}
                                SELECT COUNT(*) AS c
                                FROM matched m
                                INNER JOIN works w ON w.id = m.work_id
                                WHERE ${mediaSql}${adultSql}${visibilitySql};`;
                } else {
                    const whereClause = `WHERE ${mediaSql}${adultSql}${visibilitySql}`;
                    sql = `SELECT w.id, w.title, w.format, w.status, w.episode_count, w.is_adult, w.image_url
                           FROM works w ${whereClause}
                           ORDER BY w.title ASC
                           LIMIT ${perPage} OFFSET ${offset};`;
                    countSql = `SELECT COUNT(*) AS c FROM works w ${whereClause};`;
                }

                let total = 0;
                const cacheKey = tokens.length === 0 ? `count:${kind}:${allowAdult ? 1 : 0}` : null;
                if (cacheKey && countCache.has(cacheKey)) {
                    total = countCache.get(cacheKey);
                } else {
                    if (cacheKey) {
                        const mRes = sqlDb.exec(`SELECT value FROM meta WHERE key = '${cacheKey}' LIMIT 1;`);
                        const pre = Number(mRes?.[0]?.values?.[0]?.[0] || 0);
                        if (pre > 0) {
                            total = pre;
                            countCache.set(cacheKey, total);
                        }
                    }
                    if (total === 0) {
                        const cStmt = sqlDb.prepare(countSql);
                        cStmt.bind(params);
                        if (cStmt.step()) total = Number(cStmt.getAsObject().c || 0);
                        cStmt.free();
                        if (cacheKey) countCache.set(cacheKey, total);
                    }
                }

                const stmt = sqlDb.prepare(sql);
                stmt.bind(params);
                const rows = [];
                while (stmt.step()) rows.push(stmt.getAsObject());
                stmt.free();

                const slice = rows.map(w => {
                    const fmt = String(w.format || (kind === 'manga' ? 'MANGA' : 'TV')).toUpperCase();
                    const eps = w.episode_count ? Number(w.episode_count) : null;
                    return {
                        id: w.id,
                        title: w.title || 'Sem título',
                        format: fmt,
                        status: w.status || 'COMPLETED',
                        image: w.image_url || '/assets/icons/actions/search.png',
                        episode_count: eps,
                        is_adult: Boolean(w.is_adult),
                        kind,
                        subMeta: eps ? `${fmt} • ${eps} ${eps === 1 ? 'ep' : 'eps'}` : fmt,
                    };
                });
                const totalPages = Math.max(1, Math.ceil(total / perPage));
                window.__lastExploreMs = Math.round((performance.now() - t0) * 10) / 10;
                return {
                    items: slice,
                    page: Math.min(safePage, totalPages),
                    pages: totalPages,
                    total,
                };
            }

            return {
                boot,
                isReady: () => Boolean(sqlDb),
                queryExploreSql,
                getWorks: () => [],
                getRevision: () => revision,
            };
        })();

        // Cliente Global de Watch Party (Ponte SSE + Player Pro / anirium-service P2P + Chat ao Vivo)
        window.AniriumWatchParty = (() => {
            const csrf = '{{ csrf_token() }}';
            let activeCode = null;
            let activeRoom = null;
            let roomEventSource = null;
            let applyingRemoteSync = false;

            const ensureDrawer = () => {
                let drawer = document.getElementById('anirium-wp-drawer');
                if (drawer) return drawer;
                drawer = document.createElement('aside');
                drawer.id = 'anirium-wp-drawer';
                drawer.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99990;width:320px;max-width:92vw;border-radius:16px;border:1px solid rgba(139,92,246,0.35);background:rgba(13,13,19,0.96);color:#f4f4f5;display:none;flex-direction:column;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.8);';
                drawer.innerHTML = `
                    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-violet-950/30">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span id="wp-drawer-title" class="text-xs font-bold text-white truncate">Watch Party</span>
                                <span id="wp-drawer-badge" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">P2P</span>
                            </div>
                            <div id="wp-drawer-meta" class="text-[11px] text-zinc-400 truncate mt-0.5">Sincronizado via anirium-service</div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button type="button" id="wp-copy-link" title="Copiar link da sala" class="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white">Link</button>
                            <button type="button" id="wp-leave-btn" title="Sair da sala" class="px-2 py-1 rounded-lg bg-red-600/80 hover:bg-red-500 text-[11px] font-semibold text-white">Sair</button>
                        </div>
                    </div>
                    <div id="wp-messages-list" class="h-56 overflow-y-auto px-3.5 py-2.5 space-y-2 text-xs"></div>
                    <form id="wp-chat-form" class="flex gap-1.5 p-2.5 border-t border-white/10 bg-black/40">
                        <input id="wp-chat-input" type="text" maxlength="500" placeholder="Mensagem na sala..." class="flex-1 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500">
                        <button type="submit" class="rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white">Enviar</button>
                    </form>
                `;
                document.body.appendChild(drawer);

                drawer.querySelector('#wp-copy-link')?.addEventListener('click', () => {
                    if (!activeCode) return;
                    const url = `${window.location.origin}/?party=${encodeURIComponent(activeCode)}`;
                    navigator.clipboard?.writeText(url);
                    const btn = drawer.querySelector('#wp-copy-link');
                    if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = 'Link'; }, 1500); }
                });
                drawer.querySelector('#wp-leave-btn')?.addEventListener('click', () => leaveRoom());
                drawer.querySelector('#wp-chat-form')?.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const inp = drawer.querySelector('#wp-chat-input');
                    const text = (inp?.value || '').trim();
                    if (!text || !activeCode) return;
                    inp.value = '';
                    await sendMessage(text);
                });
                return drawer;
            };

            const seenMessageIds = new Set();
            let lastMessageId = 0;

            const wpRequest = async (url, method = 'GET', body = null) => {
                const headers = { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf };
                if (body !== null) headers['Content-Type'] = 'application/json';
                const res = await fetch(url, {
                    method,
                    headers,
                    credentials: 'same-origin',
                    body: body !== null ? JSON.stringify(body) : undefined,
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
                return data;
            };

            const appendMessage = (msg) => {
                if (!msg) return;
                const msgId = Number(msg.id || 0);
                if (msgId > 0) {
                    if (seenMessageIds.has(msgId)) return;
                    seenMessageIds.add(msgId);
                    if (msgId > lastMessageId) lastMessageId = msgId;
                }
                const lists = [document.getElementById('wp-messages-list'), document.getElementById('wp-theater-messages')].filter(Boolean);
                const who = msg.userHandle ? `@${msg.userHandle}` : (msg.user?.handle ? `@${msg.user.handle}` : (msg.userName || msg.user?.name || 'Membro'));
                for (const list of lists) {
                    const row = document.createElement('div');
                    row.className = 'rounded-lg bg-white/[0.04] px-2.5 py-1.5';
                    row.innerHTML = `<span class="font-semibold text-violet-300">${who}:</span> <span class="text-zinc-200 break-words"></span>`;
                    row.querySelector('span:last-child').textContent = msg.body || msg.message || '';
                    list.appendChild(row);
                    list.scrollTop = list.scrollHeight;
                }
            };

            let syncCountdownTimer = null;

            const ensureTheaterModal = () => {
                let modal = document.getElementById('anirium-wp-theater-modal');
                if (modal) return modal;
                modal = document.createElement('div');
                modal.id = 'anirium-wp-theater-modal';
                modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#060609;color:#f4f4f5;display:none;flex-direction:row;overflow:hidden;';
                modal.innerHTML = `
                    <div class="flex-1 flex flex-col min-w-0 relative bg-black">
                        <div class="h-12 px-4 border-b border-white/10 bg-[#0c0c12] flex items-center justify-between gap-3 shrink-0">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0"></span>
                                <span id="wp-theater-title" class="text-sm font-bold text-white truncate">Sala Watch Party</span>
                                <span id="wp-theater-phase-badge" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 shrink-0">SYNC P2P</span>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <div class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-mono text-amber-300" title="Avaliar episódio">
                                    <span>★</span>
                                    <select id="wp-theater-score" class="bg-transparent text-white outline-none cursor-pointer text-[11px]">
                                        <option value="" class="bg-[#0c0c12]">Nota</option>
                                        <option value="10" class="bg-[#0c0c12]">10</option>
                                        <option value="9" class="bg-[#0c0c12]">9</option>
                                        <option value="8" class="bg-[#0c0c12]">8</option>
                                        <option value="7" class="bg-[#0c0c12]">7</option>
                                        <option value="6" class="bg-[#0c0c12]">6</option>
                                        <option value="5" class="bg-[#0c0c12]">5</option>
                                    </select>
                                </div>
                                <button type="button" id="wp-theater-fav" title="Favoritar episódio" class="px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-pink-500/20 text-xs text-zinc-200 hover:text-pink-300 transition">♡ Favorito</button>
                                <button type="button" id="wp-theater-leave" class="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-xs font-semibold text-white shrink-0">Sair da Sala</button>
                            </div>
                        </div>
                        <div class="flex-1 relative flex items-center justify-center overflow-hidden">
                            <div id="wp-theater-player-slot" class="w-full h-full flex items-center justify-center"></div>
                            <style>
                                #wp-theater-waiting, #wp-theater-stabilizing {
                                    position: fixed !important;
                                    top: 0 !important;
                                    left: 0 !important;
                                    right: 320px !important;
                                    bottom: 0 !important;
                                    backdrop-filter: blur(16px) !important;
                                    -webkit-backdrop-filter: blur(16px) !important;
                                }
                                @media (max-width: 1023px) {
                                    #wp-theater-waiting, #wp-theater-stabilizing {
                                        right: 0 !important;
                                        bottom: 256px !important;
                                    }
                                }
                            </style>
                            <div id="wp-theater-waiting" class="hidden flex-col items-center justify-center bg-[#09090f]/95 text-center p-6 gap-3" style="z-index:9997;">
                                <div class="w-12 h-12 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin"></div>
                                <h3 class="text-lg font-bold text-white">Aguardando o líder escolher o próximo episódio...</h3>
                                <p id="wp-theater-waiting-sub" class="text-xs text-zinc-400 max-w-md">Você continua conectado na sala e pode usar o chat normalmente.</p>
                            </div>
                            <div id="wp-theater-stabilizing" class="hidden flex-col items-center justify-center bg-black/90 text-center p-6 gap-3" style="z-index:9998;">
                                <div class="text-4xl font-mono font-black text-violet-400" id="wp-stabilize-countdown">60s</div>
                                <h3 id="wp-stabilize-heading" class="text-base font-bold text-white">Estabilizando e sincronizando todos via rede torrent P2P...</h3>
                                <p id="wp-stabilize-sub" class="text-xs text-zinc-400 max-w-md">Baixando buffer de segurança (3 min) pelo anirium-service para iniciar todos no tempo exato.</p>
                                <button type="button" id="wp-stabilize-leave" class="hidden mt-2 px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-500 text-xs font-semibold text-white">Sair da Sala</button>
                            </div>
                        </div>
                    </div>
                    <aside class="w-full lg:w-80 h-64 lg:h-full border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0d0d13] flex flex-col shrink-0">
                        <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                            <span class="text-xs font-bold text-white">Chat da Sala</span>
                            <span id="wp-theater-members" class="text-[11px] font-mono text-zinc-400">1 na sala</span>
                        </div>
                        <div id="wp-theater-messages" class="flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2 text-xs"></div>
                        <form id="wp-theater-chat-form" class="flex gap-1.5 p-2.5 border-t border-white/10 bg-black/40">
                            <input id="wp-theater-chat-input" type="text" maxlength="500" placeholder="Mensagem na sala..." class="flex-1 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500">
                            <button type="submit" class="rounded-lg bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white">Enviar</button>
                        </form>
                    </aside>
                `;
                document.body.appendChild(modal);
                modal.querySelector('#wp-theater-leave')?.addEventListener('click', () => leaveRoom());
                modal.querySelector('#wp-stabilize-leave')?.addEventListener('click', () => leaveRoom());
                modal.querySelector('#wp-theater-chat-form')?.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const inp = modal.querySelector('#wp-theater-chat-input');
                    const text = (inp?.value || '').trim();
                    if (!text || !activeCode) return;
                    inp.value = '';
                    await sendMessage(text);
                });
                return modal;
            };

            const loadEpisodeIntoTheater = async (epId) => {
                const slot = document.getElementById('wp-theater-player-slot');
                if (!slot || !epId) return;
                slot.innerHTML = '<div class="text-xs font-mono text-zinc-400 animate-pulse">Carregando player da sala...</div>';
                try {
                    const res = await fetch(`/api/catalog/graph/episode/${encodeURIComponent(epId)}?render=blade`, {
                        headers: { Accept: 'text/html' },
                    });
                    if (!res.ok) {
                        slot.innerHTML = '<div class="text-xs text-red-300">Não foi possível carregar o episódio da sala.</div>';
                        return;
                    }
                    const html = await res.text();
                    slot.innerHTML = `<style>
                        #wp-theater-player-slot { position:relative!important; width:100%!important; height:100%!important; overflow:hidden!important; background:#000!important; }
                        #wp-theater-player-slot > div { position:relative!important; width:100%!important; height:100%!important; padding:0!important; margin:0!important; max-width:none!important; }
                        #wp-theater-player-slot header,
                        #wp-theater-player-slot aside,
                        #wp-theater-player-slot #ep-info-popover,
                        #wp-theater-player-slot [id*="discussion"] { display:none!important; }
                        #wp-theater-player-slot #episode-inline-player-stage {
                            position:fixed!important;
                            top:48px!important;
                            left:0!important;
                            right:320px!important;
                            bottom:0!important;
                            width:auto!important;
                            height:auto!important;
                            border-radius:0!important;
                            z-index:10!important;
                            background:#000!important;
                        }
                        @media (max-width: 1023px) {
                            #wp-theater-player-slot #episode-inline-player-stage { right:0!important; bottom:256px!important; }
                        }
                        #wp-theater-player-slot.wp-locked input[type="range"],
                        #wp-theater-player-slot.wp-locked [data-play-toggle],
                        #wp-theater-player-slot.wp-locked button[title*="Play"],
                        #wp-theater-player-slot.wp-locked button[title*="Pausar"],
                        #wp-theater-player-slot.wp-locked button[title*="Reproduzir"],
                        #wp-theater-player-slot.wp-locked button[title*="Avançar"],
                        #wp-theater-player-slot.wp-locked button[title*="Voltar"] { pointer-events:none!important; opacity:0.3!important; }
                    </style><div class="w-full h-full overflow-hidden">${html}</div>`;
                    if (activeRoom && (!activeRoom.isLeader || activeRoom.mode === 'live_launch' || activeRoom.phase === 'stabilizing')) {
                        slot.classList.add('wp-locked');
                    } else {
                        slot.classList.remove('wp-locked');
                    }
                    // Trava real no elemento <video>: impede autoplay durante sync mode (stabilizing)
                    const enforceSyncGuard = () => {
                        const vid = slot.querySelector('video');
                        if (!vid || vid.dataset.wpGuarded === '1') return;
                        vid.dataset.wpGuarded = '1';
                        vid.addEventListener('play', () => {
                            if (activeRoom && activeRoom.phase === 'stabilizing') {
                                vid.pause();
                            }
                        });
                        vid.addEventListener('ended', () => {
                            if (activeRoom && activeRoom.mode === 'live_launch') {
                                handleRoomEnded();
                            }
                        });
                    };
                    setTimeout(enforceSyncGuard, 400);
                    setTimeout(enforceSyncGuard, 1500);
                    setTimeout(enforceSyncGuard, 3500);
                    slot.querySelectorAll('script').forEach((oldScript) => {
                        const s = document.createElement('script');
                        if (oldScript.src) s.src = oldScript.src;
                        else s.textContent = oldScript.textContent;
                        oldScript.replaceWith(s);
                    });
                } catch (_) {
                    slot.innerHTML = '<div class="text-xs text-red-300">Erro de rede ao carregar o episódio.</div>';
                }
            };

            const renderRoomPhaseUI = (roomState) => {
                if (!roomState) return;
                const phase = String(roomState.phase || 'playing');
                if (roomState.serverTimeMs) {
                    window.__aniriumServerClockOffsetMs = Number(roomState.serverTimeMs) - Date.now();
                }
                const clockOffset = Number(window.__aniriumServerClockOffsetMs || 0);
                const lockUntilMs = roomState.syncLockUntil ? Date.parse(roomState.syncLockUntil) : 0;
                window.__aniriumWatchPartySyncUntil = lockUntilMs;
                const computedRem = lockUntilMs > 0 ? Math.max(0, Math.ceil((lockUntilMs - (Date.now() + clockOffset)) / 1000)) : 0;
                const rem = computedRem > 0 ? computedRem : Number(roomState.syncRemainingSeconds || 0);
                const isSyncHold = phase === 'stabilizing' || phase === 'overtime';
                const isLeader = Boolean(roomState.isLeader);

                if (syncCountdownTimer) { clearInterval(syncCountdownTimer); syncCountdownTimer = null; }

                if (phase === 'ended' || roomState.status === 'ended') {
                    handleRoomEnded();
                    return;
                }

                if (isLeader) {
                    const meta = document.getElementById('wp-drawer-meta');
                    if (meta) {
                        meta.textContent = isSyncHold && rem > 0
                            ? `${roomState.membersCount || 1} na sala • Sync ${rem}s (${roomState.minBufferedSeconds || 0}s/180s)`
                            : `${roomState.membersCount || 1} na sala • Modo Dono de Party`;
                    }
                    window.__aniriumWatchPartyPhase = isSyncHold && rem > 0 ? phase : 'playing';
                    try {
                        document.querySelectorAll('iframe[src*="player-pro"], iframe#anirium-player-pro-iframe').forEach((f) => {
                            f.contentWindow?.postMessage({
                                type: 'anirium:wp:state',
                                locked: false,
                                phase: window.__aniriumWatchPartyPhase,
                            }, '*');
                        });
                    } catch {}
                    if (isSyncHold && rem > 0) {
                        let left = rem;
                        syncCountdownTimer = setInterval(() => {
                            left -= 1;
                            if (left <= 0) {
                                clearInterval(syncCountdownTimer);
                                syncCountdownTimer = null;
                                window.__aniriumWatchPartyPhase = 'playing';
                                if (meta) meta.textContent = `${roomState.membersCount || 1} na sala • Modo Dono de Party`;
                                document.querySelectorAll('iframe[src*="player-pro"], iframe#anirium-player-pro-iframe').forEach((f) => {
                                    try { f.contentWindow?.postMessage({ type: 'anirium:wp:state', locked: false, phase: 'playing' }, '*'); } catch {}
                                });
                            } else if (meta) {
                                meta.textContent = `${roomState.membersCount || 1} na sala • Sync ${left}s (${roomState.minBufferedSeconds || 0}s/180s)`;
                            }
                        }, 1000);
                    }
                } else {
                    const modal = ensureTheaterModal();
                    modal.style.display = 'flex';
                    const waitEl = modal.querySelector('#wp-theater-waiting');
                    const stabEl = modal.querySelector('#wp-theater-stabilizing');
                    const cdEl = modal.querySelector('#wp-stabilize-countdown');
                    const headEl = modal.querySelector('#wp-stabilize-heading');
                    const subEl = modal.querySelector('#wp-stabilize-sub');
                    const leaveOverlayBtn = modal.querySelector('#wp-stabilize-leave');
                    const memEl = modal.querySelector('#wp-theater-members');
                    if (memEl) memEl.textContent = `${roomState.membersCount || 1} na sala`;

                    if (headEl) {
                        headEl.textContent = roomState.isOvertime
                            ? (roomState.overtimeStage >= 2
                                ? 'Sobretempo estendido (+10 min máx.) — torrent lento, compartilhando peers P2P...'
                                : 'Sobretempo de sincronização (+5 min) — aguardando buffer de todos...')
                            : 'Estabilizando e sincronizando todos via rede torrent P2P...';
                    }
                    if (leaveOverlayBtn) {
                        leaveOverlayBtn.classList.toggle('hidden', !roomState.canLeaveFromOverlay && !roomState.isOvertime);
                    }
                    if (subEl && typeof roomState.minBufferedSeconds === 'number') {
                        const targetBuf = Number(roomState.targetBufferSeconds || 180);
                        subEl.textContent = `Buffer de segurança coletivo: ${roomState.minBufferedSeconds}s / ${targetBuf}s • ${roomState.readyCount || 0}/${roomState.membersCount || 1} prontos`;
                    }

                    if (waitEl) { waitEl.classList.toggle('hidden', phase !== 'waiting'); waitEl.classList.toggle('flex', phase === 'waiting'); }
                    if (stabEl) { stabEl.classList.toggle('hidden', !(isSyncHold && rem > 0)); stabEl.classList.toggle('flex', isSyncHold && rem > 0); }

                    if (isSyncHold && rem > 0 && cdEl) {
                        window.__aniriumWatchPartyPhase = phase;
                        let left = rem;
                        cdEl.textContent = `${left}s`;
                        syncCountdownTimer = setInterval(() => {
                            left -= 1;
                            if (left <= 0) {
                                clearInterval(syncCountdownTimer);
                                syncCountdownTimer = null;
                                // Mantém blur ativo e consulta o servidor para confirmar se entrou em overtime ou playing
                                cdEl.textContent = '...';
                                if (activeCode) {
                                    wpRequest(`/api/watch-party/rooms/${encodeURIComponent(activeCode)}`)
                                        .then((res) => {
                                            if (res?.room) {
                                                activeRoom = res.room;
                                                renderRoomPhaseUI(res.room);
                                                if (res.room.phase === 'playing') {
                                                    applyRemotePlayback(res.room);
                                                }
                                            }
                                        })
                                        .catch(() => {
                                            stabEl?.classList.add('hidden');
                                            stabEl?.classList.remove('flex');
                                            window.__aniriumWatchPartyPhase = 'playing';
                                        });
                                }
                            } else {
                                cdEl.textContent = `${left}s`;
                            }
                        }, 1000);
                    } else if (phase === 'playing' || (isSyncHold && rem <= 0)) {
                        window.__aniriumWatchPartyPhase = 'playing';
                        try {
                            document.getElementById('anirium-player-pro-iframe')?.contentWindow?.postMessage({
                                type: 'anirium:wp:state',
                                locked: Boolean(window.__aniriumWatchPartyLocked),
                                phase: 'playing'
                            }, '*');
                        } catch {}
                    }
                }
            };

            const handleRoomEnded = () => {
                const wasLiveLaunch = activeRoom?.mode === 'live_launch';
                const lastEpId = activeRoom?.episodeId || activeRoom?.episode_id || null;
                activeCode = null;
                activeRoom = null;
                window.__aniriumWatchPartyLocked = false;
                window.__aniriumWatchPartyPhase = '';
                if (syncCountdownTimer) { clearInterval(syncCountdownTimer); syncCountdownTimer = null; }
                if (roomEventSource) { roomEventSource.close(); roomEventSource = null; }
                const drawer = document.getElementById('anirium-wp-drawer');
                if (drawer) drawer.remove();
                const modal = document.getElementById('anirium-wp-theater-modal');
                if (modal) modal.remove();
                try {
                    const u = new URL(window.location.href);
                    u.searchParams.delete('party');
                    u.searchParams.delete('partyPass');
                    window.history.replaceState({}, '', u.pathname + u.search);
                } catch (_) {}
                if (wasLiveLaunch && lastEpId && typeof window.pushNavigation === 'function') {
                    window.pushNavigation('episode', lastEpId, 'Episódio');
                } else {
                    if (typeof window.clearNavigation === 'function') window.clearNavigation();
                    if (typeof window.switchTab === 'function') window.switchTab('home');
                }
            };

            const applyRemotePlayback = (roomState) => {
                if (!roomState) return;
                const targetPos = Number(roomState.position_seconds ?? roomState.positionSeconds ?? 0);
                const isPlaying = Boolean(roomState.is_playing ?? roomState.isPlaying);
                applyingRemoteSync = true;
                try {
                    const iframe = document.querySelector('iframe[src*="player-pro"], iframe#player-pro-iframe');
                    if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage({
                            type: 'anirium:watch-party:sync',
                            code: activeCode,
                            isPlaying: roomState.phase === 'stabilizing' ? false : isPlaying,
                            positionSeconds: targetPos,
                            controlsLocked: !roomState.isLeader || roomState.mode === 'live_launch' || roomState.phase === 'stabilizing',
                            phase: roomState.phase || 'playing',
                            syncRemainingSeconds: Number(roomState.syncRemainingSeconds || 0),
                        }, '*');
                    }
                    const vid = document.querySelector('video');
                    if (vid) {
                        if (Math.abs((vid.currentTime || 0) - targetPos) > 1.5) vid.currentTime = targetPos;
                        if (isPlaying && vid.paused) vid.play().catch(() => {});
                        if (!isPlaying && !vid.paused) vid.pause();
                    }
                } finally {
                    setTimeout(() => { applyingRemoteSync = false; }, 350);
                }
            };

            const connectRoomSse = (code) => {
                if (roomEventSource) { roomEventSource.close(); roomEventSource = null; }
                const es = new EventSource(`/api/stream?room_code=${encodeURIComponent(code)}`);
                const handleRoomUpdateEvent = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data.room) {
                            const prevEp = activeRoom?.episodeId || activeRoom?.episode_id;
                            const wasLeader = Boolean(activeRoom?.isLeader);
                            activeRoom = { ...data.room, isLeader: wasLeader || Boolean(data.room.isLeader) };
                            renderRoomPhaseUI(activeRoom);
                            const nextEp = activeRoom.episodeId || activeRoom.episode_id;
                            if (!activeRoom.isLeader && nextEp && nextEp !== prevEp) {
                                mountTheaterPlayer(activeRoom);
                            }
                            if (!activeRoom.isLeader) {
                                applyRemotePlayback(activeRoom);
                            }
                        }
                    } catch (_) {}
                };
                es.addEventListener('watch_party.updated', handleRoomUpdateEvent);
                es.addEventListener('watch_party.episode_changed', handleRoomUpdateEvent);
                es.addEventListener('watch_party.ended', () => {
                    handleRoomEnded();
                });
                es.addEventListener('watch_party.message', (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data.message) appendMessage(data.message);
                    } catch (_) {}
                });
                roomEventSource = es;
            };

            let lastBufferReportAt = 0;
            window.addEventListener('message', (event) => {
                const msg = event.data;
                if (!msg || typeof msg !== 'object') return;
                if (msg.type === 'anirium:wp:playing') {
                    const stabEl = document.getElementById('wp-theater-stabilizing');
                    if (stabEl) { stabEl.classList.add('hidden'); stabEl.classList.remove('flex'); }
                    return;
                }
                if (msg.type === 'anirium:wp:leader-control' && activeRoom?.isLeader && activeCode) {
                    sendControl(msg.action, Number(msg.positionSeconds || 0));
                    return;
                }
                if (msg.type !== 'anirium:wp:buffer' || !activeCode) return;
                if (Date.now() - lastBufferReportAt < 3000) return;
                lastBufferReportAt = Date.now();
                const bufferedSeconds = Math.max(0, Math.floor(Number(msg.bufferedSeconds || 0)));
                wpRequest(`/api/watch-party/rooms/${encodeURIComponent(activeCode)}/ready`, 'POST', { bufferedSeconds })
                    .then((res) => {
                        if (res?.room) {
                            activeRoom = res.room;
                            renderRoomPhaseUI(res.room);
                        }
                    })
                    .catch(() => {});
            });

            async function openRoom(code, password = '') {
                if (!code) return;
                const joinRes = await fetch(`/api/watch-party/rooms/${encodeURIComponent(code)}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf },
                    body: JSON.stringify(password ? { password } : {}),
                });
                if (!joinRes.ok) {
                    const err = await joinRes.json().catch(() => ({}));
                    alert(err.message || 'Não foi possível entrar na Watch Party.');
                    return;
                }
                const stateRes = await fetch(`/api/watch-party/rooms/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json' } });
                if (!stateRes.ok) return;
                const data = await stateRes.json();
                activeCode = code;
                activeRoom = data.room || data;

                if (activeRoom?.isLeader) {
                    const drawer = ensureDrawer();
                    drawer.style.display = 'flex';
                    const titleEl = drawer.querySelector('#wp-drawer-title');
                    const metaEl = drawer.querySelector('#wp-drawer-meta');
                    if (titleEl) titleEl.textContent = `Sala #${code}`;
                    if (metaEl) metaEl.textContent = `${(data.members || []).length || 1} na sala · Rede Torrent P2P`;
                    const list = drawer.querySelector('#wp-messages-list');
                    if (list) {
                        list.innerHTML = '';
                        (data.messages || []).forEach(appendMessage);
                    }
                } else {
                    const modal = ensureTheaterModal();
                    const list = modal.querySelector('#wp-theater-messages');
                    if (list) {
                        list.innerHTML = '';
                        (data.messages || []).forEach(appendMessage);
                    }
                }

                const epId = activeRoom?.episode_id || activeRoom?.episodeId;
                window.__aniriumWatchPartyLocked = !activeRoom?.isLeader || activeRoom?.mode === 'live_launch' || activeRoom?.phase === 'stabilizing';
                window.__aniriumWatchPartyPhase = String(activeRoom?.phase || 'playing');
                renderRoomPhaseUI(activeRoom);
                if (epId) {
                    if (activeRoom?.isLeader) {
                        if (typeof window.openEntityContext === 'function') window.openEntityContext('episode', epId);
                    } else {
                        await loadEpisodeIntoTheater(epId);
                    }
                }
                connectRoomSse(code);
                applyRemotePlayback(activeRoom);
            }

            async function startPartyMode(options = {}) {
                const res = await fetch('/api/watch-party/rooms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf },
                    body: JSON.stringify({
                        mode: 'party',
                        password: options.password || null,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    alert(data.message || 'Não foi possível iniciar o Modo Party (exclusivo Anirium+).');
                    return;
                }
                const code = data.code || data.room?.code;
                if (code) {
                    await openRoom(code, options.password || '');
                    const meta = document.getElementById('wp-drawer-meta');
                    if (meta) meta.textContent = 'Modo Dono de Party ativo • Escolha qualquer episódio no catálogo';
                }
            }

            async function createRoom(episodeId, options = {}) {
                if (!episodeId) return;
                const stage = document.getElementById('episode-context-stage') || document.getElementById('work-context-stage');
                const workId = options.workId || stage?.getAttribute('data-work-id') || null;
                const res = await fetch('/api/watch-party/rooms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf },
                    body: JSON.stringify({
                        workId: workId,
                        episodeId: episodeId,
                        episode_id: episodeId,
                        password: options.password || null,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.room?.code) {
                    alert(data.message || 'Não foi possível criar a Watch Party (exclusivo Anirium+).');
                    return;
                }
                await openRoom(data.room.code, options.password || '');
            }

            async function sendControl(action, positionSeconds = 0, extra = {}) {
                if (!activeCode || applyingRemoteSync) return;
                await fetch(`/api/watch-party/rooms/${encodeURIComponent(activeCode)}/control`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf },
                    body: JSON.stringify({
                        action,
                        positionSeconds: Math.max(0, Math.floor(positionSeconds)),
                        ...extra,
                    }),
                }).catch(() => {});
            }

            async function sendMessage(body) {
                if (!activeCode) return;
                await fetch(`/api/watch-party/rooms/${encodeURIComponent(activeCode)}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrf },
                    body: JSON.stringify({ body }),
                }).catch(() => {});
            }

            async function leaveRoom() {
                const code = activeCode;
                handleRoomEnded();
                if (code) {
                    await fetch(`/api/watch-party/rooms/${encodeURIComponent(code)}/leave`, {
                        method: 'POST',
                        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf },
                    }).catch(() => {});
                }
            }

            // Ouve eventos do Player Pro (anirium-service) para repassar play/pause/seek do Host
            window.addEventListener('message', (event) => {
                const msg = event.data;
                if (!msg || typeof msg !== 'object' || !activeCode || applyingRemoteSync) return;
                if (msg.type === 'anirium:player:control' && ['play', 'pause', 'seek'].includes(msg.action)) {
                    sendControl(msg.action, Number(msg.positionSeconds || 0));
                }
            });

            return { openRoom, createRoom, startPartyMode, sendControl, sendMessage, leaveRoom, getActiveCode: () => activeCode, isLeader: () => Boolean(activeRoom?.isLeader) };
        })();

        // Inicializa estado ao carregar
        document.addEventListener('DOMContentLoaded', async () => {
            window.AniriumCatalogSSOT?.boot().then(() => {
                if (window.currentTab === 'explore') window.runClientSideCatalogFilter();
            });
            window.AniriumSSE?.connect();
            const urlParams = new URLSearchParams(window.location.search);
            const partyCode = urlParams.get('party');
            if (partyCode) {
                window.AniriumWatchParty?.openRoom(partyCode, urlParams.get('partyPass') || '');
            }
            const initialTab = urlParams.get('tab');
            if (initialTab && ['home', 'explore', 'calendar'].includes(initialTab)) {
                window.switchTab(initialTab);
            }
            if (typeof window.initRollingDaysBar === 'function') {
                window.initRollingDaysBar();
            }
            window.deriveHeroRollFromCalendar();
            if (window.currentUser) {
                window.loadAccountAddons();
                if (window.isAdultContentAllowed()) {
                    window.syncAdultShardsIfAllowed('work');
                }
            }

            if (urlParams.get('age_verify') === 'underage') {
                window.openProfileModal();
                window.switchProfileTab('settings');
                window.setAgeVerifyFeedback('Esta conta está bloqueada para conteúdo adulto (-18 anos).', 'error');
            }

            if (window.__pendingGoogleAgeVerify) {
                const pending = window.__pendingGoogleAgeVerify;
                delete window.__pendingGoogleAgeVerify;
                window.openProfileModal();
                window.switchProfileTab('settings');

                if (pending.error || !pending.idToken || !pending.accessToken) {
                    window.toggleManualAgeBox(true);
                    window.setAgeVerifyFeedback('Não foi possível obter sua data de nascimento pelo Google. Você pode enviar uma solicitação manual ao Administrador.', 'info');
                } else {
                    window.setAgeVerifyFeedback('Validando sua data de nascimento junto ao Google...', 'info');
                    try {
                        const res = await fetch('/api/account/age-verification/google', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-Requested-With': 'XMLHttpRequest',
                                'X-CSRF-TOKEN': '{{ csrf_token() }}'
                            },
                            body: JSON.stringify({
                                state: pending.state,
                                id_token: pending.idToken,
                                access_token: pending.accessToken
                            })
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) {
                            window.applyAgeVerificationStatusUI(data);
                            window.setAgeVerifyFeedback('Idade +18 verificada via Google! Você já pode ativar o filtro de Conteúdo Adulto.', 'success');
                        } else if (data.error === 'minimum_age_not_met' || data.status === 'underage') {
                            window.applyAgeVerificationStatusUI({
                                age_verification_status: 'underage',
                                age_verified: false,
                                adult_content_enabled: false
                            });
                            window.setAgeVerifyFeedback('Sua conta Google indica idade inferior a 18 anos. Conteúdo adulto bloqueado.', 'error');
                        } else if (data.error === 'google_people_unavailable') {
                            window.toggleManualAgeBox(true);
                            window.setAgeVerifyFeedback('Não foi possível consultar a Google People API (verifique se a People API está ativada no Google Cloud Console). Você pode enviar a solicitação manual abaixo.', 'error');
                        } else if (data.error === 'birthday_unavailable') {
                            window.toggleManualAgeBox(true);
                            window.setAgeVerifyFeedback('Sua conta Google não retornou o ano de nascimento completo. Use a solicitação manual abaixo para revisão do Administrador.', 'info');
                        } else if (data.error === 'google_account_mismatch') {
                            window.setAgeVerifyFeedback('Use exatamente a mesma conta Google que está conectada nesta sessão.', 'error');
                        } else {
                            window.setAgeVerifyFeedback('Falha na verificação via Google. Tente novamente ou use a solicitação manual.', 'error');
                        }
                    } catch (err) {
                        console.error('[Anirium Age] Erro na verificação Google:', err);
                        window.toggleManualAgeBox(true);
                        window.setAgeVerifyFeedback('Erro de conexão ao verificar com Google. Você pode enviar uma solicitação manual.', 'error');
                    }
                }
            }

            if (window.currentTab === 'explore') window.runClientSideCatalogFilter();
            if (window.currentTab === 'calendar') window.renderCalendarPage();
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                window.closeOfficialTrailerModal?.();
                window.closeExternalAddonModal?.();
                if (window.navStack.length > 0) window.popNavigation();
                window.closeProfileModal();
            }
        });
    </script>
    @endpush
    @include('partials.compliance-gate')
</x-app-layout>
