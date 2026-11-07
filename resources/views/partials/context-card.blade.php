@props([
    'work',
    'universe' => null,
    'currentArc' => null,
    'currentEpisode' => null,
    'creators' => [],
    'studios' => [],
    'tracks' => [],
    'arcs' => [],
    'episodes' => [],
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
])

@php
    $title = $work->title ?? 'Obra Canônica';
    $format = $work->format ?? 'TV';
    $status = $work->status ?? 'RELEASING';
    $score = $work->score ?? '8.5';
    $image = $work->image_url ?? '';
    $synopsis = $work->synopsis ?? 'Sinopse oficial catalogada na malha ontológica relacional.';
    $isEpisodeMode = !empty($currentEpisode);
    $episodeTitle = $isEpisodeMode ? ('Episódio ' . ($currentEpisode->number ?? '1')) : null;
@endphp

<div class="w-full h-full flex flex-col overflow-hidden select-none bg-theme-base text-theme-primary">
    <!-- BARRA SUPERIOR UNIFICADA DE NAVEGAÇÃO FRACTAL -->
    <header class="h-16 w-full flex items-center justify-between px-6 lg:px-8 border-b border-theme-default bg-theme-header shrink-0 z-20">
        <div class="flex items-center gap-4 min-w-0">
            <!-- Botão Voltar Nativo da Pilha -->
            <button type="button"
                    onclick="window.popNavigation()"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-theme-pill hover:bg-white/10 border border-theme-default text-theme-accent hover:text-white text-xs font-bold font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg shrink-0">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span id="btn-context-back-label" data-i18n="nav.back">Voltar</span>
            </button>

            <!-- Breadcrumb Fractal (Universo > Obra > Arco > Episódio) -->
            <nav id="entity-dynamic-breadcrumb" class="flex items-center gap-2 text-xs font-mono text-theme-muted overflow-x-auto no-scrollbar">
                <button type="button" onclick="window.clearNavigation()" class="hover:text-theme-accent transition-colors shrink-0" data-i18n="nav.home">Lobby</button>
            </nav>
        </div>

        <!-- Indicador de Status Canônico e Tipo -->
        <div class="flex items-center gap-3 shrink-0">
            @if($isEpisodeMode)
                <span class="px-2.5 py-1 rounded-full border border-theme-accent/40 text-[10px] font-mono font-bold text-theme-accent bg-theme-accent/10 uppercase">
                    {{ $episodeTitle }}
                </span>
            @endif
            <span class="px-2.5 py-1 rounded-full border border-theme-default text-[10px] font-mono font-bold text-theme-muted bg-theme-pill uppercase">
                {{ $format }}
            </span>
            <span class="px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase {{ $status === 'RELEASING' ? 'bg-theme-accent/20 text-theme-accent border-theme-accent/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/30' }}">
                {{ $status === 'RELEASING' ? 'Em Lançamento' : 'Finalizado' }}
            </span>
        </div>
    </header>

    <!-- CORPO DO CONTEXTO -->
    <div class="flex-1 flex overflow-hidden p-6 lg:p-8 gap-6 relative">
        <!-- Esquerda: Informações Gerais da Obra / Episódio -->
        <div class="w-2/5 flex flex-col gap-5 overflow-y-auto no-scrollbar">
            <div class="relative w-full aspect-video rounded-3xl bg-theme-raised border border-theme-default overflow-hidden shadow-2xl group">
                <img src="{{ $image }}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 filter brightness-90">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                <div class="absolute bottom-4 left-4 right-4">
                    @if($isEpisodeMode)
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-theme-accent text-theme-inverse uppercase">Episódio Ativo</span>
                            <span class="text-xs text-theme-muted font-mono">{{ $work->title ?? '' }}</span>
                        </div>
                        <h1 class="text-2xl font-black text-white font-serif tracking-tight">{{ $episodeTitle }}</h1>
                    @else
                        <h1 class="text-2xl font-black text-white font-serif tracking-tight mt-1">{{ $title }}</h1>
                        <p class="text-xs text-theme-secondary font-mono mt-0.5">★ {{ $score }} • {{ $work->year ?? '—' }}</p>
                    @endif
                </div>
            </div>

            <!-- Botão de Assistir no Player Pro (Se for Episódio Ativo ou Obra com Episódios) -->
            @if($isEpisodeMode)
                <button type="button"
                        onclick="window.openPlayerPro('{{ $work->id ?? '' }}', '{{ $currentEpisode->id ?? '' }}', '{{ $currentEpisode->number ?? 1 }}')"
                        class="w-full py-3.5 px-6 rounded-2xl bg-theme-accent hover:bg-theme-accent/90 text-theme-inverse font-mono font-bold text-sm flex items-center justify-center gap-3 shadow-lg shadow-theme-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                    <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>Assistir Episódio {{ $currentEpisode->number ?? 1 }}</span>
                </button>
            @endif

            <!-- Barra de Ações do Usuário (Interação com a Entidade Obra/Episódio) -->
            <x-shell.entity-actions
                :targetType="$isEpisodeMode ? 'episode' : 'work'"
                :targetId="$isEpisodeMode ? ($currentEpisode->id ?? '') : ($work->id ?? '')"
                :targetTitle="$isEpisodeMode ? ($title . ' - ' . $episodeTitle) : $title"
                :isBookmarked="$isBookmarked ?? false"
                :isLiked="$isLiked ?? false"
                :userScore="$userScore ?? null"
                :userStatus="$userStatus ?? null"
                :isWatched="$isWatched ?? false" />

            <!-- Sinopse -->
            <div class="p-5 rounded-2xl bg-theme-card border border-theme-default">
                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-muted font-bold mb-2" data-i18n="hero.synopsis_label">Sinopse</h3>
                <p class="text-xs leading-relaxed text-theme-secondary">{{ $synopsis }}</p>
            </div>
        </div>

        <!-- Direita: Sagas, Arcos, Episódios e Discussão Comunitária -->
        <div class="w-3/5 flex flex-col gap-4 overflow-hidden">
            <!-- Alternador de Abas de Interação da Entidade -->
            <div class="flex items-center gap-2 p-1 rounded-2xl bg-theme-raised border border-theme-default shrink-0">
                <button type="button"
                        onclick="window.switchEntityTab('structure')"
                        id="tab-btn-structure"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all {{ $isEpisodeMode && count($episodes) > 0 ? 'text-theme-muted hover:text-theme-primary' : 'bg-theme-accent text-theme-inverse shadow-sm' }} cursor-pointer">
                    <span data-i18n="explore.filter_arcs">Sagas & Arcos</span> ({{ count($arcs) }})
                </button>
                @if(count($episodes) > 0)
                <button type="button"
                        onclick="window.switchEntityTab('episodes')"
                        id="tab-btn-episodes"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all {{ $isEpisodeMode ? 'bg-theme-accent text-theme-inverse shadow-sm' : 'text-theme-muted hover:text-theme-primary' }} cursor-pointer">
                    <span>Episódios</span> ({{ count($episodes) }})
                </button>
                @endif
                <button type="button"
                        onclick="window.switchEntityTab('discussion')"
                        id="tab-btn-discussion"
                        class="flex-1 py-1.5 px-3 rounded-xl text-xs font-mono font-bold transition-all text-theme-muted hover:text-theme-primary cursor-pointer">
                    <span data-i18n="discussion.tab_label">Discussão Comunitária</span>
                </button>
            </div>

            <!-- Aba 1: Sagas & Arcos -->
            <div id="entity-tab-panel-structure" class="flex-1 min-h-0 {{ $isEpisodeMode && count($episodes) > 0 ? 'hidden' : 'flex' }} flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold" data-i18n="explore.filter_arcs">Sagas & Arcos</h3>
                    <span class="text-[11px] font-mono text-theme-muted">{{ count($arcs) }} <span data-i18n="entity.arcs_count_suffix">arcos</span></span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                    @forelse($arcs as $arc)
                        <div class="p-3.5 rounded-2xl border border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight transition-all flex items-center justify-between cursor-pointer group"
                             onclick="window.pushNavigation('arc', '{{ $arc->id }}', '{{ addslashes($arc->title) }}')">
                            <div class="flex items-center gap-3 min-w-0">
                                <span class="w-2 h-2 rounded-full {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]' : 'bg-[var(--color-state-canon,#10B981)]' }}"></span>
                                <div>
                                    <h4 class="text-xs font-bold text-theme-primary group-hover:text-theme-accent transition-colors truncate">{{ $arc->title }}</h4>
                                    <p class="text-[10px] font-mono text-theme-muted"><span data-i18n="hero.episode_label">Episódios</span> {{ $arc->start_number ?? 1 }} - {{ $arc->end_number ?? '?' }}</p>
                                </div>
                            </div>
                            <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase {{ ($arc->classification ?? '') === 'filler' ? 'bg-[var(--color-state-filler,#F43F5E)]/20 text-[var(--color-state-filler,#F43F5E)] border border-[var(--color-state-filler,#F43F5E)]/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                                {{ strtoupper($arc->classification ?? 'CANON') }}
                            </span>
                        </div>
                    @empty
                        <p class="text-xs font-mono text-theme-muted" data-i18n="entity.no_arcs">Nenhum arco vinculado.</p>
                    @endforelse
                </div>
            </div>

            <!-- Aba Episódios (quando disponível) -->
            @if(count($episodes) > 0)
            <div id="entity-tab-panel-episodes" class="flex-1 min-h-0 {{ $isEpisodeMode ? 'flex' : 'hidden' }} flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold">Episódios da Obra</h3>
                    <span class="text-[11px] font-mono text-theme-muted">{{ count($episodes) }} disponíveis</span>
                </div>
                <div class="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                    @foreach($episodes as $ep)
                        @php
                            $isActiveEp = $isEpisodeMode && ($currentEpisode->id ?? '') === $ep->id;
                        @endphp
                        <div class="p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer group {{ $isActiveEp ? 'border-theme-accent bg-theme-accent/15' : 'border-theme-default bg-theme-raised/60 hover:bg-theme-raised hover:border-theme-highlight' }}"
                             onclick="window.pushNavigation('episode', '{{ $ep->id }}', 'Episódio {{ $ep->number }}')">
                            <div class="flex items-center gap-3 min-w-0">
                                <span class="w-6 h-6 rounded-lg {{ $isActiveEp ? 'bg-theme-accent text-theme-inverse' : 'bg-theme-pill text-theme-primary' }} flex items-center justify-center text-xs font-mono font-bold">
                                    {{ $ep->number }}
                                </span>
                                <div>
                                    <h4 class="text-xs font-bold {{ $isActiveEp ? 'text-theme-accent' : 'text-theme-primary group-hover:text-theme-accent' }} transition-colors truncate">
                                        Episódio {{ $ep->number }}
                                    </h4>
                                    <p class="text-[10px] font-mono text-theme-muted">{{ $ep->air_date_utc ?? 'Data não informada' }}</p>
                                </div>
                            </div>
                            @if($isActiveEp)
                                <span class="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-theme-accent/20 text-theme-accent border border-theme-accent/30">
                                    ATIVO
                                </span>
                            @endif
                        </div>
                    @endforeach
                </div>
            </div>
            @endif

            <!-- Aba 2: Discussão Comunitária com Sincronização Delta -->
            <div id="entity-tab-panel-discussion" class="flex-1 min-h-0 hidden flex-col overflow-hidden">
                <x-shell.entity-discussion
                    :targetType="$isEpisodeMode ? 'episode' : 'work'"
                    :targetId="$isEpisodeMode ? ($currentEpisode->id ?? '') : ($work->id ?? '')" />
            </div>
        </div>
    </div>
</div>
