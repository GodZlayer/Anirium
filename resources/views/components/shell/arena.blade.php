@props([
    'work' => null,
    'roll' => [],
])

@php
    $banner = $work['image'] ?? '';
    $score = $work['score'] ?? '8.5';
    $year = $work['year'] ?? '2026';
    $format = $work['format'] ?? 'TV';
    $title = $work['title'] ?? 'Lançamento Canônico';
    $synopsis = $work['synopsis'] ?? 'Acompanhe as transmissões e genealogias da temporada atual diretamente da malha ontológica.';
    $latestEp = $work['latest_episode'] ?? $work['episode_count'] ?? 1;
    $airingTime = $work['airing_time'] ?? null;
@endphp

<div {{ $attributes->merge(['class' => 'relative w-full h-full flex items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden select-none']) }}
     id="hero-cinematic-arena">
    
    <!-- 1. Aura Edge-Diffusion Bloom (Projeção volumétrica viva das bordas da imagem em toda a viewport) -->
    <div id="hero-aura-bloom"
         class="absolute inset-0 opacity-45 blur-3xl pointer-events-none transition-all duration-1000 scale-125 z-0"
         style="background-image: url('{{ $banner }}'); background-position: center; background-size: cover; filter: brightness(0.65) saturate(1.8);">
    </div>

    <!-- Degradê Canônico Multi-Camadas conectado aos Tokens Ativos -->
    <div class="absolute inset-0 pointer-events-none z-0"
         style="background: radial-gradient(circle at 75% 50%, transparent 20%, var(--color-bg-base) 80%, var(--color-bg-base) 100%);">
    </div>
    <div class="absolute inset-0 pointer-events-none z-0"
         style="background: linear-gradient(to top, var(--color-bg-base) 0%, transparent 60%, var(--color-bg-overlay) 100%);">
    </div>

    <!-- 2. Palco do Cinema (Layout Fiel ao CinematicArena.tsx) -->
    <div class="relative z-10 w-full max-w-7xl h-full flex items-center justify-between gap-8">
        <!-- Lado Esquerdo: Tipografia Monumental e Controles da Obra -->
        <div class="w-full max-w-2xl flex flex-col justify-center gap-4">
            <!-- Metadados Canônicos da Obra -->
            <div class="flex items-center gap-2 flex-wrap">
                <!-- Tag explícita do Último Episódio Lançado -->
                <span id="hero-badge-episode"
                      class="px-2.5 py-0.5 rounded-full border border-theme-highlight text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-md flex items-center gap-1.5 shadow-sm text-theme-accent bg-theme-pill">
                    <span data-i18n="hero.episode_label">Episódio</span> <span id="hero-ep-number">{{ $latestEp }}</span>
                </span>

                @if($airingTime)
                    <span id="hero-badge-time"
                          class="px-2.5 py-0.5 rounded-full border border-theme-default text-[10px] font-mono font-semibold backdrop-blur-md flex items-center gap-1.5 text-theme-accent bg-theme-pill">
                        <span class="w-1.5 h-1.5 rounded-full bg-[var(--color-state-canon,#10B981)] animate-ping"></span>
                        <span>🕒 {{ $airingTime }}</span>
                    </span>
                @endif

                <span class="px-2.5 py-0.5 rounded-full border border-theme-default text-xs font-mono font-bold backdrop-blur-md flex items-center gap-1 shadow-sm text-theme-primary bg-theme-pill">
                    ★ {{ $score }}
                </span>

                <span id="hero-badge-format"
                      class="px-2.5 py-0.5 rounded-full border border-theme-default text-[10px] font-mono font-bold uppercase tracking-wider backdrop-blur-md text-theme-muted bg-theme-pill">
                    {{ $format }} • {{ $year }}
                </span>

                <span class="px-2 py-0.5 rounded-full border border-[var(--color-state-canon,#10B981)]/30 text-[10px] font-mono font-semibold uppercase text-[var(--color-state-canon,#10B981)] bg-[var(--color-state-canon,#10B981)]/10"
                      data-i18n="status.releasing">
                    Lançamento
                </span>
            </div>

            <!-- Título Monumental Serifado (Exato Padrão TGCode) -->
            <h1 id="hero-title"
                class="text-3xl sm:text-5xl lg:text-6xl font-black font-serif tracking-tight leading-[1.08] text-theme-primary drop-shadow-xl line-clamp-2">
                {{ $title }}
            </h1>

            <!-- Sinopse Dinâmica Regionalizada -->
            <p id="hero-synopsis"
               class="text-xs sm:text-sm lg:text-base leading-relaxed drop-shadow line-clamp-3 max-w-xl font-normal text-theme-secondary">
                {{ strip_tags($synopsis ?? '') }}
            </p>

            <!-- Ações Cinemáticas do Cinema -->
            <div class="flex items-center gap-3 pt-2 flex-wrap">
                <button type="button"
                        id="hero-btn-play"
                        onclick="window.pushNavigation('work', '{{ $work['id'] ?? '' }}', '{{ addslashes($work['title'] ?? '') }}')"
                        class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-xl bg-theme-accent text-theme-inverse">
                    <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span><span data-i18n="hero.watch_episode">Assistir Episódio</span> <span id="hero-btn-ep">{{ $latestEp }}</span></span>
                </button>

                <button type="button"
                        id="hero-btn-details"
                        onclick="window.pushNavigation('work', '{{ $work['id'] ?? '' }}', '{{ addslashes($work['title'] ?? '') }}')"
                        class="px-5 py-3 rounded-xl border border-theme-default bg-theme-pill hover:bg-white/10 text-theme-primary text-xs font-bold uppercase tracking-wider backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer">
                    <span data-i18n="hero.details_arcs">Ficha & Arcos</span>
                </button>
            </div>

            <!-- Indicadores do Roll de 3 Lançamentos (Último, Penúltimo, Antepenúltimo) -->
            @if(count($roll) > 1)
                <div class="flex items-center gap-3 pt-4">
                    <div class="flex items-center gap-2">
                        <button type="button"
                                aria-label="Anterior"
                                onclick="window.stepHeroRoll(-1)"
                                class="p-1.5 rounded-full border border-theme-default bg-theme-pill text-theme-primary hover:scale-110 transition-all cursor-pointer">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        </button>

                        <div id="hero-pills-container" class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-theme-default bg-theme-pill">
                            @foreach($roll as $idx => $item)
                                <button type="button"
                                        id="hero-roll-pill-{{ $idx }}"
                                        onclick="window.setHeroIndex({{ $idx }})"
                                        class="hero-roll-pill h-2 rounded-full transition-all duration-300 cursor-pointer {{ $idx === 0 ? 'w-8 bg-theme-accent' : 'w-2.5 bg-theme-muted/40 hover:bg-theme-muted' }}"
                                        title="{{ $item['title'] }}">
                                </button>
                            @endforeach
                        </div>

                        <button type="button"
                                aria-label="Próximo"
                                onclick="window.stepHeroRoll(1)"
                                class="p-1.5 rounded-full border border-theme-default bg-theme-pill text-theme-primary hover:scale-110 transition-all cursor-pointer">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        </button>
                    </div>
                </div>
            @endif
        </div>

        <!-- Lado Direito: Pôster Volumétrico High-Def com Profundidade 3D -->
        <div class="hidden lg:flex flex-col items-center justify-center flex-1 max-w-sm">
            <div class="relative group cursor-pointer"
                 onclick="window.pushNavigation('work', '{{ $work['id'] ?? '' }}', '{{ addslashes($work['title'] ?? '') }}')">
                <div id="hero-poster-glow"
                     class="absolute -inset-1 rounded-3xl opacity-30 group-hover:opacity-60 blur-xl transition duration-700 bg-theme-accent">
                </div>
                <div class="relative aspect-[3/4] w-72 rounded-3xl overflow-hidden border border-theme-default shadow-2xl bg-theme-raised">
                    <img id="hero-poster-img"
                         src="{{ $banner }}"
                         alt="{{ $title }}"
                         class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
                </div>
            </div>
        </div>
    </div>
</div>
