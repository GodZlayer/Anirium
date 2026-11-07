@props([
    'arc',
    'work' => null,
    'universe' => null,
    'episodes' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
])

@php
    $arcTitle = $arc->title ?? 'Arco Canônico';
    $isFiller = ($arc->classification ?? '') === 'filler';
    $isMixed = ($arc->classification ?? '') === 'mixed';
    $badgeText = $isFiller ? 'FILLER' : ($isMixed ? 'MISTO' : 'CÂNON');
    $badgeStyle = $isFiller ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/40' : ($isMixed ? 'bg-[var(--color-state-mixed,#A855F7)]/20 text-[var(--color-state-mixed,#A855F7)] border-[var(--color-state-mixed,#A855F7)]/40' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40');
    
    $workTitle = $work->title ?? 'Obra Vinculada';
    $workImage = $work->image_url ?? '/assets/icons/actions/search.png';
    $universeName = $universe->name ?? 'Universo Canônico';
    $totalEpisodes = count($episodes);
    $startEp = $arc->start_number ?? ($episodes[0]->number ?? 1);
    $endEp = $arc->end_number ?? ($episodes[count($episodes)-1]->number ?? $totalEpisodes);
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
            <span class="px-3 py-1 rounded-full border text-[11px] font-bold tracking-wider uppercase font-mono {{ $badgeStyle }}">
                {{ $badgeText }}
            </span>
        </div>
    </header>

    <!-- CORPO DO ARCO: DETALHE DO ARCO & EPISÓDIOS MEMBROS -->
    <div class="flex-1 flex overflow-hidden p-6 lg:p-8 gap-6 relative">
        <!-- Esquerda: Informações do Arco e Escopo de Episódios -->
        <div class="w-2/5 flex flex-col gap-5 overflow-y-auto no-scrollbar">
            <div class="relative w-full aspect-video rounded-3xl bg-theme-raised border border-theme-default overflow-hidden shadow-2xl group">
                <img src="{{ $workImage }}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 filter brightness-90">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                <div class="absolute bottom-4 left-4 right-4">
                    <span class="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-black/60 text-theme-accent border border-white/10" data-i18n="entity.arc">
                        Arco Narrativo / Saga
                    </span>
                    <h1 class="text-2xl font-black text-white font-serif tracking-tight mt-1">{{ $arcTitle }}</h1>
                    <p class="text-xs text-theme-secondary font-mono mt-0.5">{{ $workTitle }}</p>
                </div>
            </div>

            <!-- Barra de Ações do Usuário (Interação com a Entidade Arco) -->
            <x-shell.entity-actions
                targetType="arc"
                :targetId="$arc->id ?? ''"
                :targetTitle="$arcTitle"
                :isBookmarked="$isBookmarked ?? false"
                :isLiked="$isLiked ?? false"
                :userScore="$userScore ?? null"
                :userStatus="$userStatus ?? null" />

            <!-- Faixa Numérica do Arco (Episódio X ao Y) -->
            <div class="p-5 rounded-3xl bg-theme-card border border-theme-default flex items-center justify-between">
                <div>
                    <span class="text-[11px] font-mono text-theme-muted uppercase" data-i18n="entity.episodes_range">Episódios</span>
                    <p class="text-lg font-black font-mono text-theme-primary">
                        Eps. {{ $startEp }} <span class="text-theme-accent font-normal" data-i18n="calendar.until">até</span> {{ $endEp }}
                    </p>
                </div>
                <div class="text-right">
                    <span class="text-[11px] font-mono text-theme-muted uppercase" data-i18n="entity.episodes_count">Total de Episódios</span>
                    <p class="text-lg font-black font-mono text-theme-accent">{{ $totalEpisodes }} eps</p>
                </div>
            </div>
        </div>

        <!-- Direita: Grade de Episódios do Arco e Discussão Comunitária -->
        <div class="w-3/5 flex flex-col gap-4 overflow-hidden">
            <!-- Alternador de Abas de Interação da Entidade -->
            <div class="flex items-center gap-2 p-1 rounded-2xl bg-theme-raised border border-theme-default shrink-0">
                <button type="button"
                        onclick="window.switchEntityTab('structure')"
                        id="tab-btn-structure"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all bg-theme-accent text-theme-inverse shadow-sm cursor-pointer">
                    <span data-i18n="entity.member_episodes">Episódios do Arco</span> ({{ $totalEpisodes }})
                </button>
                <button type="button"
                        onclick="window.switchEntityTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer">
                    <span data-i18n="discussion.tab_label">Discussão da Saga</span>
                </button>
            </div>

            <!-- Aba 1: Grade de Episódios do Arco -->
            <div id="entity-tab-panel-structure" class="flex-1 min-h-0 flex flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold" data-i18n="entity.member_episodes">Episódios do Arco</h3>
                    <span class="text-[11px] font-mono text-theme-muted">{{ $totalEpisodes }} <span data-i18n="entity.episodes_count_suffix">capítulos</span></span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                    @forelse($episodes as $ep)
                        <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight transition-all flex items-center justify-between cursor-pointer group"
                             onclick="window.pushNavigation('episode', '{{ $ep->id }}', 'Episódio {{ $ep->number }}')">
                            <div class="flex items-center gap-3 min-w-0">
                                <span class="w-8 h-8 rounded-xl bg-theme-pill flex items-center justify-center text-xs font-bold font-mono text-theme-accent shrink-0">
                                    {{ $ep->number }}
                                </span>
                                <div class="truncate">
                                    <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">
                                        {{ isset($ep->title) && $ep->title ? $ep->title : ('Episódio ' . ($ep->number ?? '?')) }}
                                    </h4>
                                    <p class="text-[10px] font-mono text-theme-muted">{{ $ep->air_date_utc ?? ($ep->air_date ?? '') }}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-xs text-theme-muted group-hover:text-theme-accent" data-i18n="hero.watch_episode">▶ Assistir</span>
                            </div>
                        </div>
                    @empty
                        <p class="text-xs font-mono text-theme-muted" data-i18n="entity.no_episodes">Nenhum episódio associado diretamente a este arco.</p>
                    @endforelse
                </div>
            </div>

            <!-- Aba 2: Discussão Comunitária com Sincronização Delta -->
            <div id="entity-tab-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                <x-shell.entity-discussion
                    targetType="arc"
                    :targetId="$arc->id ?? ''" />
            </div>
        </div>
    </div>
</div>
