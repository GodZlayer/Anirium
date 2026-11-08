<x-app-layout>
    <!-- 1. TOPBAR FLUTUANTE (Idêntica à versão TSX de Lobby.tsx) -->
    <header class="w-full h-14 flex-none px-3 lg:px-6 z-40 border-b border-theme-default bg-theme-header backdrop-blur-xl flex items-center justify-between gap-1 lg:gap-4 select-none">
        <!-- Lado Esquerdo: Mascote + Logo Textual + DOCK CÁPSULA ACRÍLICA DE NAVEGAÇÃO -->
        <div class="flex items-center gap-2 lg:gap-5 shrink-0">
            <!-- Botão Logotipo Canônico Anirium -->
            <button type="button"
                    onclick="window.switchTab('home')"
                    class="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl cursor-pointer group transition-all duration-300 hover:scale-[1.02] bg-theme-pill border border-theme-highlight shadow-md">
                <img src="/assets/logos/Anirium-favicon.png"
                     alt="Anirium Mascot"
                     class="w-7 h-7 object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.4)] group-hover:rotate-6 transition-transform">
                <img src="/assets/logos/Anirium-Textlogo.png"
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

                <!-- Pílulas Ontológicas Canônicas do Explorador de Entidades (Visíveis apenas ao focar busca ou abrir Explorar) -->
                <div id="topbar-pills-container" class="{{ $initialTab === 'explore' ? 'flex' : 'hidden' }} items-center gap-1 pl-2 border-l border-white/10 text-[11px] font-mono overflow-x-auto no-scrollbar">
    <button type="button" onclick="window.setExploreKind('universe')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="universe" title="Universo" data-i18n-title="entity.universe">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>
        <span class="hidden md:inline" data-i18n="entity.universe">Universo</span>
    </button>
    <button type="button" onclick="window.setExploreKind('work')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm whitespace-nowrap" data-kind="work" title="Obra" data-i18n-title="entity.work">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="7" width="20" height="15" rx="2" stroke-width="2"/><polyline stroke-width="2" points="17 2 12 7 7 2"/></svg>
        <span class="hidden md:inline" data-i18n="entity.work">Obra</span>
    </button>
    <button type="button" onclick="window.setExploreKind('manga')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="manga" title="Mangá" data-i18n-title="entity.manga">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
        <span class="hidden md:inline" data-i18n="entity.manga">Mangá</span>
    </button>
    <button type="button" onclick="window.setExploreKind('arc')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="arc" title="Arco" data-i18n-title="entity.arc">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><polygon stroke-width="2" points="12 2 2 7 12 12 22 7 12 2"/><polyline stroke-width="2" points="2 17 12 22 22 17"/><polyline stroke-width="2" points="2 12 12 17 22 12"/></svg>
        <span class="hidden md:inline" data-i18n="entity.arc">Arco</span>
    </button>
    <button type="button" onclick="window.setExploreKind('author')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="author" title="Autor" data-i18n-title="entity.author">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l7-7 3 3-7 7-3-3z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="11" cy="11" r="2" stroke-width="2"/></svg>
        <span class="hidden md:inline" data-i18n="entity.author">Autor</span>
    </button>
    <button type="button" onclick="window.setExploreKind('director')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="director" title="Diretor" data-i18n-title="entity.director">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l3 5m4-5l3 5m4-5l3 5M2 9h20"/></svg>
        <span class="hidden md:inline" data-i18n="entity.director">Diretor</span>
    </button>
    <button type="button" onclick="window.setExploreKind('studio')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="studio" title="Produtora" data-i18n-title="entity.studio">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18M2 22h20M9 6h1m4 0h1M9 10h1m4 0h1M9 14h1m4 0h1M9 18h1m4 0h1"/></svg>
        <span class="hidden md:inline" data-i18n="entity.studio">Produtora</span>
    </button>
    <button type="button" onclick="window.setExploreKind('music')" class="explore-kind-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60 whitespace-nowrap" data-kind="music" title="Música" data-i18n-title="entity.music">
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
        <span class="hidden md:inline" data-i18n="entity.music">Música</span>
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
    </header>

    <!-- PALCO 1: VIEW DA HOME (100% EXCLUSIVA AOS 3 LANÇAMENTOS - SEM CARDS EMBOLADOS) -->
    <section id="view-home" class="view-stage {{ $initialTab === 'home' ? '' : 'hidden' }} flex-1 flex flex-col overflow-hidden relative">
        <!-- Arena dos 3 Lançamentos Reais em 100vh Sem Rolagem Cega (Idêntica ao TSX) -->
        <x-shell.arena :work="$hero" :roll="$featuredRoll" />
    </section>

    <!-- PALCO 2: VIEW EXPLORAR (Limpo em Linha Única na Navbar, sem duplicações) -->
    <section id="view-explore" class="view-stage {{ $initialTab === 'explore' ? '' : 'hidden' }} flex-1 min-h-0 flex flex-col gap-3 p-4 overflow-hidden">
        <!-- Barra de Cabeçalho do Explorar (Contador e Indicador de Filtro Ativo) -->
        <div class="px-4 py-2.5 rounded-2xl border border-theme-default bg-theme-card backdrop-blur-xl flex items-center justify-between flex-none">
            <div class="flex items-center gap-2 text-xs font-mono text-theme-muted">
                <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-state-canon,#10B981)]"></span>
                <span id="client-explore-count" class="text-white font-bold">{{ number_format($explore['total'] ?? 39328, 0, ',', '.') }}</span>
                <span data-i18n="explore.results_count">resultados ordenados alfabeticamente</span>
            </div>
            <div class="text-[11px] font-mono text-theme-muted">
                <span data-i18n="explore.order_label">Ordem: </span><span class="text-theme-accent font-bold uppercase">Alfabética (A-Z)</span>
            </div>
        </div>

        <!-- Grade ModularHubTrack Paginada (Sem Rolagem Cega de Janela) -->
        <div class="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
            <div id="explore-cards-container" class="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 auto-rows-fr gap-3 overflow-y-auto no-scrollbar pb-2">
                <!-- Cards injetados via JS local -->
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
                <button type="button"
                        id="explore-btn-next"
                        onclick="window.stepExplorePage(1)"
                        class="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </nav>
        </div>
    </section>

    <!-- PALCO 3: VIEW CALENDÁRIO (CalendarHeader + CalendarWorkCard Paginado) -->
    <section id="view-calendar" class="view-stage hidden h-full flex flex-col justify-between gap-3 p-4 overflow-hidden">
        <!-- Header Oficial do Calendário (CalendarHeader.tsx) -->
        <div class="p-4 rounded-3xl border border-theme-default bg-theme-card backdrop-blur-xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 flex-none">
            <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-2xl border border-theme-accent/30 bg-[#0E1118] text-theme-accent backdrop-blur-md">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <div>
                    <h2 id="calendar-header-title" class="text-sm font-black uppercase tracking-wider text-white">
                        Grade Semanal • Segunda-feira
                    </h2>
                    <p id="calendar-header-count" class="text-[11px] font-mono text-theme-muted">
                        {{ count($calendar['mondays'] ?? []) }} lançamentos programados
                    </p>
                </div>
            </div>

            <!-- Seletor de Dias em Pílula Acrílica -->
            <div class="flex items-center p-1 rounded-2xl border border-white/10 bg-[#0E1118] shadow-inner gap-1 overflow-x-auto no-scrollbar">
                @php
                    $daysMap = [
                        ['id' => 'mondays', 'label' => 'SEG', 'full' => 'Segunda-feira'],
                        ['id' => 'tuesdays', 'label' => 'TER', 'full' => 'Terça-feira'],
                        ['id' => 'wednesdays', 'label' => 'QUA', 'full' => 'Quarta-feira'],
                        ['id' => 'thursdays', 'label' => 'QUI', 'full' => 'Quinta-feira'],
                        ['id' => 'fridays', 'label' => 'SEX', 'full' => 'Sexta-feira'],
                        ['id' => 'saturdays', 'label' => 'SÁB', 'full' => 'Sábado'],
                        ['id' => 'sundays', 'label' => 'DOM', 'full' => 'Domingo'],
                    ];
                @endphp
                @foreach($daysMap as $d)
                    <button type="button"
                            onclick="window.selectCalendarDay('{{ $d['id'] }}', '{{ $d['full'] }}')"
                            class="cal-day-btn px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 {{ $loop->first ? 'bg-theme-accent text-theme-inverse shadow-md scale-105' : 'text-theme-muted hover:text-white opacity-60 hover:opacity-100' }}"
                            data-day="{{ $d['id'] }}">
                        <span>{{ $d['label'] }}</span>
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

    @push('scripts')
    <script>
        // PROCESSAMENTO DE AUTENTICACAO GOOGLE OAUTH (#id_token=...)
        (function handleGoogleOAuthHash() {
            if (typeof window === 'undefined') return;
            const hash = window.location.hash;
            if (hash && (hash.includes('id_token=') || hash.includes('access_token='))) {
                const params = new URLSearchParams(hash.substring(1));
                const idToken = params.get('id_token');
                window.history.replaceState(null, '', window.location.pathname + window.location.search);

                if (idToken) {
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
                            console.error('[Anirium Auth] Falha na validacao do token Google:', data);
                        }
                    })
                    .catch(err => {
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
        window.currentUser = @json($user);
        window.userPreferences = @json($userPreferences ?? []);
        
        // Catálogo e Calendário na máquina do cliente
        // Carrega inicialmente os itens rápidos e em background sincroniza o acervo completo de 33.390 obras
        window.clientCatalog = @json($explore['items']);
        window.calendarData = @json($calendar);
        window.adultTitlesSet = new Set();
        fetch('/data/adult_titles.json').then(r => r.json()).then(titles => {
            if (Array.isArray(titles)) {
                titles.forEach(t => window.adultTitlesSet.add(t.toLowerCase().trim()));
                if (window.currentTab === 'explore') window.runClientSideCatalogFilter();
                if (window.currentTab === 'calendar') window.renderCalendarPage();
            }
        }).catch(() => {});
        fetch('/?feed=init', { headers: { 'Accept': 'application/json' } })
            .then(r => r.json())
            .then(data => {
                if (data.featuredRoll && data.featuredRoll.length > 0) {
                    window.heroRoll = data.featuredRoll;
                    window.setHeroIndex(0);
                }
                if (data.calendar) {
                    window.calendarData = data.calendar;
                    window.deriveHeroRollFromCalendar();
                    if (window.currentTab === 'calendar') window.renderCalendarPage();
                }
            }).catch(() => {});
        // Detecta dinamicamente o dia da semana atual no fuso do usuário (0: Domingo, 1: Segunda... 6: Sábado)
        const dayNames = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
        const dayFullNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const todayIdx = new Date().getDay();
        window.currentCalDay = dayNames[todayIdx];
        window.currentCalDayFull = dayFullNames[todayIdx];
        window.calPage = 1;
        window.explorePage = 1;
        const PAGE_SIZE = 12;

        window.clientStatusFilter = 'all';

        // Local-First Catalog Engine via IndexedDB (Zero bloqueio de thread, Zero JSON de 34MB)
        const DB_NAME = 'anirium_local_catalog';
        const DB_VERSION = 4;
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

        async function initLocalFirstCatalog() {
            try {
                const db = await openCatalogDB();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const countReq = store.count();

                countReq.onsuccess = () => {
                    const localCount = countReq.result;
                    if (localCount >= 50000) {
                        const allReq = store.getAll();
                        allReq.onsuccess = () => {
                            if (allReq.result && allReq.result.length > 0) {
                                window.clientCatalog = allReq.result;
                                if (window.currentTab === 'explore') {
                                    window.runClientSideCatalogFilter();
                                }
                            }
                        };
                    } else {
                        // Sincroniza em background o catálogo consolidado multi-entidade
                        setTimeout(async () => {
                            try {
                                const res = await fetch('/data/catalog_clean.json');
                                if (res.ok) {
                                    const fullCatalog = await res.json();
                                    if (Array.isArray(fullCatalog) && fullCatalog.length > 0) {
                                        window.clientCatalog = fullCatalog;
                                        const wTx = db.transaction(STORE_NAME, 'readwrite');
                                        const wStore = wTx.objectStore(STORE_NAME);
                                        fullCatalog.forEach(it => wStore.put(it));
                                        if (window.currentTab === 'explore') {
                                            window.runClientSideCatalogFilter();
                                        }
                                        console.log('[Anirium Catalog] Local-first catalog sincronizado com', fullCatalog.length, 'entidades');
                                    }
                                }
                            } catch (e) {
                                console.warn('[Anirium Catalog] Fallback background fetch:', e);
                            }
                        }, 500);
                    }
                };
            } catch (err) {
                console.warn('[Anirium Engine] IndexedDB local:', err);
            }
        }

        initLocalFirstCatalog();

        // 1. GERENCIADOR DE ABAS DA TOPBAR (Home, Explorar, Calendário)
        window.switchTab = function(tab) {
    window.currentTab = tab;
    document.querySelectorAll('.view-stage').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${tab}`);
    if (target) target.classList.remove('hidden');

    const isExplore = (tab === 'explore');

    ['home', 'explore', 'calendar'].forEach(k => {
        const btn = document.getElementById(`top-nav-${k}`);
        if (btn) {
            const spanText = btn.querySelector('span');
            if (isExplore) {
                // Modo explorador: dock compacto só ícones para caber na tela
                if (spanText) {
                    spanText.className = "hidden";
                    spanText.style.display = "none";
                }
                if (k === tab) {
                    btn.className = "flex items-center justify-center p-2 rounded-full transition-all duration-300 font-semibold cursor-pointer bg-theme-accent text-theme-inverse shadow-md";
                } else {
                    btn.className = "flex items-center justify-center p-2 rounded-full transition-all duration-300 font-semibold cursor-pointer text-theme-muted hover:text-white";
                }
            } else {
                // Modo normal: ícone + texto
                if (spanText) {
                    spanText.className = "hidden sm:inline";
                    spanText.style.display = "";
                }
                if (k === tab) {
                    btn.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer bg-theme-accent text-theme-inverse shadow-md";
                } else {
                    btn.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 font-semibold cursor-pointer text-theme-muted hover:text-white";
                }
            }
        }
    });

    if (tab === 'explore') {
        window.showExploreFilters();
        window.runClientSideCatalogFilter();
    } else {
        window.hideExploreFilters();
    }
    if (tab === 'calendar') window.renderCalendarPage();
};

        // 2. DERIVAÇÃO DETERMINÍSTICA DO HERO ROLL PELO CALENDÁRIO E HORÁRIO ATUAL (Playhead Contínuo)
                // FILTRO GLOBAL DETERMINÍSTICO DE PORNOGRAFIA / ADULTO (Forçado por Padrão em Todo o Sistema)
        window.isAdultContentAllowed = function() {
            return Boolean(window.currentUser && window.currentUser.adult_content_enabled);
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
                    if (!allowAdult && window.isAdultEntity(item)) return false;
                    return item.time && item.time !== 'TBA';
                });
                prevItems.sort((a, b) => b.time.localeCompare(a.time));
                roll.push(...prevItems);
            }

            if (roll.length > 0) {
                window.heroRoll = roll.slice(0, 3);
                window.setHeroIndex(0);
            }
        };

        // SWITCHER DE HERO ROLL NA HOME
        window.setHeroIndex = function(idx) {
            if (!window.heroRoll || !window.heroRoll[idx]) return;
            window.heroIndex = idx;
            const item = window.heroRoll[idx];

            document.getElementById('hero-title').innerText = item.title;
            document.getElementById('hero-synopsis').innerText = item.synopsis || '';
            const epNum = item.latest_episode || item.episode || item.episode_count || 1;
            document.getElementById('hero-ep-number').innerText = epNum;
            document.getElementById('hero-btn-ep').innerText = epNum;
            document.getElementById('hero-badge-format').innerText = `${item.format || 'TV'} • ${item.year || '2026'}`;
            const escapedTitle = (item.title || '').replace(/'/g, "\\'");
            document.getElementById('hero-btn-play').setAttribute('onclick', `window.pushNavigation('work', '${item.id}', '${escapedTitle}')`);
            const btnDetails = document.getElementById('hero-btn-details');
            if (btnDetails) {
                btnDetails.setAttribute('onclick', `window.pushNavigation('work', '${item.id}', '${escapedTitle}')`);
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

        window.stepHeroRoll = function(step) {
            if (!window.heroRoll || window.heroRoll.length === 0) return;
            let next = (window.heroIndex + step) % window.heroRoll.length;
            if (next < 0) next = window.heroRoll.length - 1;
            window.setHeroIndex(next);
        };

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

        window.setExploreKind = function(kind) {
            window.exploreKindFilter = kind;
            document.querySelectorAll('.explore-kind-btn').forEach(btn => {
                if (btn.getAttribute('data-kind') === kind) {
                    btn.className = "explore-kind-btn px-2.5 py-1 rounded-full font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm";
                } else {
                    btn.className = "explore-kind-btn px-2.5 py-1 rounded-full font-bold transition-all text-theme-muted hover:text-white opacity-60";
                }
            });
            window.explorePage = 1;
            window.runClientSideCatalogFilter();
        };

        window.stepExplorePage = function(step) {
            window.explorePage += step;
            window.runClientSideCatalogFilter();
        };

        window.syncSearch = function(val) {
            window.explorePage = 1;
            window.runClientSideCatalogFilter();
        };

        window.runClientSideCatalogFilter = function() {
            const query = (document.getElementById('topbar-search-input')?.value || '').toLowerCase().trim();
            // Trava +24 Anos é estritamente baseada no perfil da conta logada (sem botão no catálogo público)
            const allowAdult = window.isAdultContentAllowed();

            let filtered = (window.clientCatalog || []).filter(item => {
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
                        // Regra Canônica: Obras são estritamente animes/animações; mangás possuem filtro próprio
                        if (itemKind !== 'work' && item.kind !== 'work') return false;
                        const isManga = item.kind === 'manga' || ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'DOUJINSHI', 'NOVEL', 'LIGHT_NOVEL', 'OEL'].includes(item.format);
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
                        if (itemKind !== 'music' && item.kind !== 'track' && item.format !== 'MUSIC' && item.format !== 'OST') return false;
                    } else if (window.exploreKindFilter === 'character') {
                        if (itemKind !== 'character') return false;
                    }
                }

                // Busca Unificada no Campo da Navbar (Atua no título, formato e em todas as CORRELAÇÕES)
                if (query) {
                    const titleMatch = (item.title || item.name || '').toLowerCase().includes(query);
                    const formatMatch = item.format && item.format.toLowerCase().includes(query);
                    
                    // Checa correlação direta de obras vinculadas (ex: Bleach -> Tite Kubo, Pierrot, Noriyuki Abe)
                    let correlationMatch = false;
                    if (item.rel_works && Array.isArray(item.rel_works)) {
                        correlationMatch = item.rel_works.some(rw => rw && rw.toLowerCase().includes(query));
                    }
                    if (!correlationMatch && item.best_work) {
                        correlationMatch = item.best_work.toLowerCase().includes(query);
                    }

                    if (!titleMatch && !formatMatch && !correlationMatch) return false;
                }

                return true;
            });

            // Ordenação Sempre Alfabética (A-Z)
            const normalizeSortKey = (t) => (t || '').toLowerCase().replace(/^[\s"'«»"''""_\-\.\[\]()!?~*#@]+/g, '');
            filtered.sort((a, b) => {
                const keyA = normalizeSortKey(a.title || a.name);
                const keyB = normalizeSortKey(b.title || b.name);
                return keyA.localeCompare(keyB);
            });

            const total = filtered.length;
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            window.explorePage = Math.min(Math.max(1, window.explorePage), totalPages);

            const start = (window.explorePage - 1) * PAGE_SIZE;
            const paged = filtered.slice(start, start + PAGE_SIZE);

            const container = document.getElementById('explore-cards-container');
            const countLabel = document.getElementById('client-explore-count');
            if (countLabel) countLabel.innerText = total;

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
                const badgeLabel = (item.kind || item.format || 'OBRA').toUpperCase();
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
                } else if (item.status === 'COMPLETED') {
                    statusMeta = 'Completo';
                } else if (item.track_type) {
                    statusMeta = item.track_type.toUpperCase();
                } else {
                    statusMeta = (item.kind || item.format || '').toUpperCase();
                }

                return `
                <div class="group relative flex flex-col rounded-2xl overflow-hidden border border-theme-default bg-theme-card transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:border-theme-highlight"
                     onclick="window.pushNavigation('${navType}', '${item.id}', '${(item.title || item.name || '').replace(/'/g, "\\'")}')">
                    <div class="relative w-full aspect-[3/4] overflow-hidden bg-black/40">
                        <img src="${item.image || '/assets/icons/actions/search.png'}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" onerror="this.src='/assets/icons/actions/search.png'" loading="lazy">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                        <span class="absolute top-2 left-2 text-[10px] font-black font-mono px-2 py-0.5 rounded-full bg-black/75 text-theme-accent border border-white/10 uppercase">
                            ${badgeLabel}
                        </span>
                        ${isArc ? `
                        <span class="absolute bottom-2 right-2 text-[9px] font-black font-mono px-2 py-0.5 rounded-md uppercase backdrop-blur-md border ${item.status === 'FILLER' || item.classification === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/25 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40' : (item.status === 'MISTO' || item.classification === 'mixed' ? 'bg-[var(--color-state-mixed,#A855F7)]/25 text-[var(--color-state-mixed,#A855F7)] border-[var(--color-state-mixed,#A855F7)]/40' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40')} shadow-sm">
                            ${statusMeta}
                        </span>
                        ` : ''}
                        <button type="button"
                                onclick="window.toggleCardFavorite(event, '${item.id}', '${navType}', '${(item.title || item.name || '').replace(/'/g, "\'")}')"
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

        window.renderCalendarPage = function() {
            if (window.currentCalDayFull) {
                const headerTitle = document.getElementById('calendar-header-title');
                if (headerTitle) headerTitle.innerText = `Grade Semanal • ${window.currentCalDayFull}`;
                
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
            const rawItems = rawAll.filter(item => allowAdultCal || !window.isAdultEntity(item));
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

            // Playhead do Calendário: Determina se o anime já foi lançado nesta semana
            const now = new Date();
            const currentDayIdx = now.getDay(); // 0 = Domingo, 1 = Segunda, 2 = Terça...
            const nowHour = String(now.getHours()).padStart(2, '0');
            const nowMin = String(now.getMinutes()).padStart(2, '0');
            const nowTimeStr = `${nowHour}:${nowMin}`;
            const daysOrder = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
            const selectedDayIdx = daysOrder.indexOf(window.currentCalDay);

            // Renderiza Cards Fiéis a CalendarWorkCard.tsx com Estado do Episódio e Progresso do Usuário
            container.innerHTML = paged.map(item => {
                // Checa se já foi ao ar na semana
                let isAired = false;
                if (selectedDayIdx < currentDayIdx) {
                    isAired = true;
                } else if (selectedDayIdx === currentDayIdx) {
                    isAired = (item.time && item.time !== 'TBA' && item.time <= nowTimeStr);
                }

                // Checa se o usuário logado já assistiu ou está acompanhando
                const pref = window.userPreferences ? (window.userPreferences[item.id] || window.userPreferences[item.id.replace('work:', '')]) : null;
                const isWatched = pref && (pref.status === 'completed' || (pref.progress_seconds && pref.progress_seconds > 0));
                const isWatching = pref && pref.status === 'watching';

                return `
                <div class="group relative min-h-0 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0E1118]/80 text-left flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-theme-accent/40 cursor-pointer"
                     onclick="window.pushNavigation('work', '${item.id}', '${item.title.replace(/'/g, "\\'")}')">
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
                                    Episódio ${item.episode || 1} ${isAired ? '• Lançado' : '• Programado'}
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

                // 5. PILHA DE NAVEGAÇÃO DETERMINÍSTICA DINÂMICA DO TGCODE (Histórico Vivo de Navegação pelas Entidades)
        window.navStack = [];

        window.pushNavigation = function(type, id, label) {
            // Se a mesma entidade já estiver no topo, não duplica
            const current = window.navStack[window.navStack.length - 1];
            if (current && current.id === id && current.type === type) return;

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

        window.entityHtmlCache = new Map();

        window.renderCurrentState = async function() {
            const contextLayer = document.getElementById('layer-context');
            if (window.navStack.length === 0) {
                contextLayer.classList.add('opacity-0', 'pointer-events-none');
                return;
            }

            const current = window.navStack[window.navStack.length - 1];
            contextLayer.classList.remove('opacity-0', 'pointer-events-none');
            
            const container = document.getElementById('context-blade-container');
            const isAdultAllowed = (window.currentUser && window.currentUser.adult_content_enabled) ? '1' : '0';
            const cacheKey = `${current.type}:${current.id}:${isAdultAllowed}`;

            // LOCAL-FIRST: Renderização instantânea se já estiver no cache local da sessão
            if (window.entityHtmlCache.has(cacheKey)) {
                container.innerHTML = window.entityHtmlCache.get(cacheKey);
                window.renderDynamicBreadcrumb();
if (window.i18n) window.i18n.applyToDOM();
                return;
            }

            container.innerHTML = `
                <div class="w-full h-full flex items-center justify-center font-mono text-xs text-theme-accent">
                    <span class="w-6 h-6 border-2 border-theme-accent border-t-transparent rounded-full animate-spin"></span>
                </div>
            `;

            try {
                let endpoint = `/api/catalog/graph/work/${current.id}?render=blade&adult=${isAdultAllowed}&kind=${current.type || 'work'}`;
                if (current.type === 'manga' || current.type === 'work') {
                    endpoint = `/api/catalog/graph/work/${current.id}?render=blade&adult=${isAdultAllowed}&kind=${current.type}`;
                } else if (current.type === 'episode') {
                    endpoint = `/api/catalog/graph/episode/${current.id}?render=blade&adult=${isAdultAllowed}`;
                } else if (current.type === 'universe') {
                    endpoint = `/api/catalog/graph/universe/${current.id}?render=blade&adult=${isAdultAllowed}`;
                } else if (current.type === 'arc') {
                    endpoint = `/api/catalog/graph/arc/${current.id}?render=blade&adult=${isAdultAllowed}`;
                } else if (current.type === 'author' || current.type === 'director' || current.type === 'creator') {
                    endpoint = `/api/catalog/graph/creator/${current.id}?render=blade&adult=${isAdultAllowed}`;
                } else if (current.type === 'studio') {
                    endpoint = `/api/catalog/graph/studio/${current.id}?render=blade&adult=${isAdultAllowed}`;
                } else if (current.type === 'music' || current.type === 'track') {
                    endpoint = `/api/catalog/graph/track/${current.id}?render=blade&adult=${isAdultAllowed}`;
                }
                const res = await fetch(endpoint, {
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
                return;
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
                    return;
                }
                const data = await res.json();
                if (data.preference) {
                    window.renderCurrentState();
                }
            } catch (err) {
                console.error("Erro ao salvar preferência:", err);
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

        // 7. PREFERÊNCIA ADULTA (+24 ANOS) PERSISTIDA NA CONTA
        window.toggleAdultPreference = async function(enabled) {
            try {
                await fetch('/api/account/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': '{{ csrf_token() }}'
                    },
                    body: JSON.stringify({ adult_content_enabled: enabled })
                });
                if (window.currentUser) window.currentUser.adult_content_enabled = enabled;
                window.deriveHeroRollFromCalendar();
                window.runClientSideCatalogFilter();
                window.renderCalendarPage();
            } catch (err) {
                console.error("Falha ao salvar preferência +24:", err);
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

        window.renderProfileLibrary = function() {
            const container = document.getElementById('profile-library-container');
            if (!container) return;

            const filtered = (window.userLibraryList || []).filter(item => {
                if (!item.bookmarked && !item.user_score && !item.status) return false;
                if (window.activeLibEntityFilter === 'all') return true;
                return (item.target_type === window.activeLibEntityFilter);
            });

            if (filtered.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_library">${window.i18n ? window.i18n.t('profile.empty_library') : 'Nenhum item adicionado aos favoritos ainda.'}</div>`;
                return;
            }

            container.innerHTML = filtered.map(item => {
                const title = item.title || item.target_id;
                const statusBadge = item.status ? `<span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">${item.status}</span>` : '';
                const scoreBadge = item.user_score ? `<span class="text-xs font-mono font-bold text-theme-accent">★ ${item.user_score}/10</span>` : '';
                return `
                    <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between hover:border-theme-highlight transition-all cursor-pointer group"
                         onclick="window.closeProfileModal(); window.pushNavigation('${item.target_type || 'work'}', '${item.target_id}', '${(title || '').replace(/'/g, "\\'")}')">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="w-2 h-2 rounded-full bg-theme-accent"></span>
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">${title}</h5>
                                <p class="text-[10px] font-mono text-theme-muted uppercase">${item.target_type || 'work'}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
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

            const universeMap = new Map();
            (window.userLibraryList || []).forEach(item => {
                if (!item.last_interacted_at && !item.progress_seconds && !item.status) return;
                const key = item.universe_id || item.target_id;
                if (!universeMap.has(key)) {
                    universeMap.set(key, item);
                }
            });

            const condensedList = Array.from(universeMap.values());

            if (condensedList.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs font-mono text-theme-muted" data-i18n="profile.empty_history">${window.i18n ? window.i18n.t('profile.empty_history') : 'Nenhum histórico registrado ainda.'}</div>`;
                return;
            }

            container.innerHTML = condensedList.map(item => {
                const uTitle = item.universe_name || item.title || 'Universo Conectado';
                return `
                    <div class="p-4 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between hover:border-theme-accent transition-all cursor-pointer group"
                         onclick="window.closeProfileModal(); window.pushNavigation('universe', '${item.universe_id || item.target_id}', '${uTitle.replace(/'/g, "\\'")}')">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-xl bg-theme-pill border border-theme-default flex items-center justify-center text-base shrink-0">
                                🌌
                            </div>
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">${uTitle}</h5>
                                <p class="text-[10px] font-mono text-theme-muted mt-0.5">
                                    <span data-i18n="profile.last_progress">Último Progresso:</span> ${item.title || item.target_id}
                                </p>
                            </div>
                        </div>
                        <span class="text-xs font-mono font-bold text-theme-accent shrink-0 group-hover:translate-x-1 transition-transform">
                            Continuar â¯
                        </span>
                    </div>
                `;
            }).join('');
        };

        window.loadAccountAddons = async function() {
            const listContainer = document.getElementById('profile-addons-list');
            if (!listContainer) return;
            try {
                const res = await fetch('/api/addons');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.addons)) {
                        window.userAddonsList = data.addons.filter(a => a.id !== 'player-pro');
                        window.renderAddonsList();
                    }
                }
            } catch (err) {
                console.warn('[Anirium Addons] Falha ao carregar lista de addons:', err);
            }
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
            const structureBtn = document.getElementById('tab-btn-structure');
            const discussionBtn = document.getElementById('tab-btn-discussion');
            const structurePanel = document.getElementById('entity-tab-panel-structure');
            const discussionPanel = document.getElementById('entity-tab-panel-discussion');

            if (!structurePanel || !discussionPanel) return;

            if (tabName === 'structure') {
                structurePanel.classList.remove('hidden');
                structurePanel.classList.add('flex');
                discussionPanel.classList.add('hidden');
                discussionPanel.classList.remove('flex');

                if (structureBtn) {
                    structureBtn.className = "flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer";
                }
                if (discussionBtn) {
                    discussionBtn.className = "flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer";
                }
            } else {
                structurePanel.classList.add('hidden');
                structurePanel.classList.remove('flex');
                discussionPanel.classList.remove('hidden');
                discussionPanel.classList.add('flex');

                if (discussionBtn) {
                    discussionBtn.className = "flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer";
                }
                if (structureBtn) {
                    structureBtn.className = "flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer";
                }

                // Carrega ou sincroniza deltas de comentários da entidade ativa
                const container = document.getElementById('entity-discussions-container');
                if (container) {
                    const type = container.getAttribute('data-target-type');
                    const id = container.getAttribute('data-target-id');
                    if (type && id) window.refreshEntityComments(type, id);
                }
            }
        };

        window.refreshEntityComments = async function(type, id) {
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
                    // Sincroniza imediatamente o delta da discussão
                    window.refreshEntityComments(type, id);
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erro ao enviar comentário.');
                }
            } catch (err) {
                console.warn('[Anirium Discussions] Falha ao enviar comentário:', err);
            }
        };
window.toggleEntityBookmark = async function(type, id) {
            if (!window.currentUser) {
                window.openProfileModal();
                return;
            }
            const btn = document.getElementById('btn-action-bookmark');
            const isCurrently = btn && btn.classList.contains('bg-theme-accent');
            const nextVal = !isCurrently;
            
            if (btn) {
                if (nextVal) {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-accent text-theme-inverse border-theme-accent shadow-md";
                } else {
                    btn.className = "p-2 rounded-xl border text-xs transition-all cursor-pointer bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary";
                }
            }
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

        window.openProfileModal = function() {
            document.getElementById('modal-profile').classList.remove('opacity-0', 'pointer-events-none');
        };
        window.closeProfileModal = function() {
            document.getElementById('modal-profile').classList.add('opacity-0', 'pointer-events-none');
        };

        // Inicializa estado ao carregar
        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const initialTab = urlParams.get('tab');
            if (initialTab && ['home', 'explore', 'calendar'].includes(initialTab)) {
                window.switchTab(initialTab);
            }
            window.deriveHeroRollFromCalendar();
            window.runClientSideCatalogFilter();
            window.renderCalendarPage();
        });
        const initialParams = new URLSearchParams(window.location.search);
        const initialTabNow = initialParams.get('tab');
        if (initialTabNow && ['home', 'explore', 'calendar'].includes(initialTabNow)) {
            window.switchTab(initialTabNow);
        }
        window.deriveHeroRollFromCalendar();
        window.runClientSideCatalogFilter();
        window.renderCalendarPage();

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (window.navStack.length > 0) window.popNavigation();
                window.closeProfileModal();
            }
        });
    </script>
    @endpush
</x-app-layout>
