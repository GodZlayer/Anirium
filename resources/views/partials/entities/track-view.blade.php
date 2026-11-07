@props([
    'track',
    'works' => [],
    'composer' => null,
    'universe' => null,
    'isLiked' => false,
    'isBookmarked' => false,
])

@php
    $title = $track->title ?? 'Faixa Musical';
    $trackType = strtoupper($track->track_type ?? 'OST');
    $composerName = $composer->name ?? 'Compositor Oficial';
    $leadImage = $works[0]->image_url ?? '/assets/icons/actions/search.png';
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- BARRA SUPERIOR: NAVEGAÇÃO ONTOLÓGICA -->
    <header class="h-16 w-full flex items-center justify-between px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20">
        <div class="flex items-center gap-4 min-w-0">
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span id="btn-context-back-label" data-i18n="nav.back">Voltar</span>
            </button>

            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
            </nav>
        </div>

        <div class="flex items-center gap-3 shrink-0">
            <span class="px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[11px] font-bold tracking-wider uppercase font-mono">
                <span data-i18n="entity.track_badge">🎵 TRILHA SONORA</span> • {{ $trackType }}
            </span>
        </div>
    </header>

    <!-- CORPO DA MÚSICA: PLAYER DE ÁUDIO & OBRAS ONDE TOCA -->
    <div class="flex-1 flex overflow-hidden p-6 lg:p-8 gap-6 relative">
        <!-- Esquerda: Mini Player de Vinil / Trilha & Ações -->
        <div class="w-2/5 flex flex-col gap-5 overflow-y-auto no-scrollbar">
            <div class="relative w-full aspect-square max-w-sm mx-auto rounded-3xl bg-theme-card border border-theme-default overflow-hidden shadow-2xl flex flex-col items-center justify-center p-6 text-center group">
                <div class="w-40 h-40 rounded-full border-4 border-theme-highlight overflow-hidden shadow-xl mb-4 relative flex items-center justify-center bg-black">
                    <img src="{{ $leadImage }}" class="w-full h-full object-cover filter brightness-75 group-hover:scale-110 transition-transform duration-700">
                    <button type="button" class="absolute z-10 w-12 h-12 rounded-full bg-theme-accent text-theme-inverse flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer">
                        <svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                </div>

                <h2 class="text-xl font-black text-theme-primary tracking-tight font-serif">{{ $title }}</h2>
                <p class="text-xs font-mono text-theme-accent mt-1">{{ $composerName }}</p>
                <span class="inline-block mt-3 px-3 py-0.5 rounded-full bg-theme-pill text-theme-muted border border-theme-default text-[10px] font-mono uppercase"
                      data-i18n="entity.track">
                    Trilha Sonora (OST)
                </span>
            </div>
        </div>

        <!-- Direita: Obras que Utilizam Esta Faixa -->
        <div class="w-3/5 flex flex-col gap-5 overflow-hidden">
            <div class="flex-1 min-h-0 flex flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold" data-i18n="entity.works_in_timeline">Obras Onde Toca</h3>
                    <span class="text-[11px] font-mono text-theme-muted">{{ count($works) }} <span data-i18n="entity.works_associated_suffix">obras associadas</span></span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                    @forelse($works as $w)
                        <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight transition-all flex items-center justify-between cursor-pointer group"
                             onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-12 h-12 rounded-xl overflow-hidden bg-black shrink-0">
                                    <img src="{{ $w->image_url }}" class="w-full h-full object-cover">
                                </div>
                                <div class="truncate">
                                    <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $w->title }}</h4>
                                    <p class="text-[10px] font-mono text-theme-muted">{{ $w->format ?? 'TV' }} • {{ $w->year ?? '—' }}</p>
                                </div>
                            </div>
                            <span class="text-xs text-theme-muted group-hover:text-theme-accent" data-i18n="entity.view_work">Ver Obra ❯</span>
                        </div>
                    @empty
                        <p class="text-xs font-mono text-theme-muted" data-i18n="entity.no_associated_works">Nenhuma obra vinculada.</p>
                    @endforelse
                </div>
            </div>
        </div>
    </div>
</div>
