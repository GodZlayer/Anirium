@props([
    'studio',
    'works' => [],
    'isLiked' => false,
    'isBookmarked' => false,
])

@php
    $name = $studio->name ?? 'Estúdio de Animação';
    $totalWorks = count($works);
    $leadImage = $studio->image_url ?? ($works[0]->image_url ?? '/assets/icons/actions/search.png');
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
            <span class="px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-bold tracking-wider uppercase font-mono"
                  data-i18n="entity.studio_badge">
                🏢 PRODUTORA & ESTÚDIO
            </span>
        </div>
    </header>

    <!-- CORPO DO ESTÚDIO: CATÁLOGO DE PRODUÇÃO -->
    <div class="flex-1 flex overflow-hidden p-6 lg:p-8 gap-6 relative">
        <!-- Esquerda: Identidade do Estúdio & Seguir -->
        <div class="w-2/5 flex flex-col gap-5 overflow-y-auto no-scrollbar">
            <div class="p-6 rounded-3xl bg-theme-card border border-theme-default flex flex-col items-center text-center gap-4 shadow-xl">
                <div class="w-24 h-24 rounded-2xl overflow-hidden border border-theme-default p-2 bg-theme-raised flex items-center justify-center">
                    <img src="{{ $leadImage }}" class="max-w-full max-h-full object-contain">
                </div>
                <div>
                    <h2 class="text-2xl font-black text-theme-primary tracking-tight font-serif">{{ $name }}</h2>
                    <span class="text-xs font-mono text-theme-accent" data-i18n="entity.studio">Estúdio de Animação</span>
                </div>
            </div>

            <div class="p-5 rounded-3xl bg-theme-card border border-theme-default">
                <h3 class="text-xs font-mono uppercase tracking-wider text-theme-muted font-bold mb-3" data-i18n="entity.catalog_productions">Produções no Catálogo</h3>
                <p class="text-2xl font-black font-mono text-theme-accent">{{ $totalWorks }} <span class="text-xs font-normal text-theme-muted" data-i18n="entity.animated_works">obras animadas</span></p>
            </div>
        </div>

        <!-- Direita: Grade de Produções do Estúdio -->
        <div class="w-3/5 flex flex-col gap-5 overflow-hidden">
            <div class="flex-1 min-h-0 flex flex-col p-5 rounded-3xl bg-theme-card border border-theme-default overflow-hidden">
                <div class="flex items-center justify-between mb-3 flex-none">
                    <h3 class="text-xs font-mono uppercase tracking-wider text-theme-accent font-bold" data-i18n="entity.studio_catalog">Catálogo do Estúdio</h3>
                    <span class="text-[11px] font-mono text-theme-muted">{{ $totalWorks }} <span data-i18n="entity.productions_suffix">produções</span></span>
                </div>

                <div class="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 md:grid-cols-3 gap-3 pr-1">
                    @forelse($works as $w)
                        <div class="rounded-2xl border border-theme-default bg-theme-raised overflow-hidden cursor-pointer hover:border-theme-highlight hover:scale-105 transition-all shadow-md group"
                             onclick="window.pushNavigation('work', '{{ $w->id }}', '{{ addslashes($w->title) }}')">
                            <div class="relative w-full aspect-[3/4] overflow-hidden bg-black">
                                <img src="{{ $w->image_url }}" class="w-full h-full object-cover group-hover:scale-105 transition-all">
                                <span class="absolute top-1.5 left-1.5 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-black/70 text-theme-accent">
                                    {{ $w->format ?? 'TV' }}
                                </span>
                            </div>
                            <div class="p-2">
                                <p class="text-[11px] font-bold text-theme-primary truncate">{{ $w->title }}</p>
                                <p class="text-[9px] font-mono text-theme-muted">{{ $w->year ?? '—' }}</p>
                            </div>
                        </div>
                    @empty
                        <p class="col-span-full text-xs font-mono text-theme-muted text-center py-10" data-i18n="entity.no_works">Nenhuma obra associada.</p>
                    @endforelse
                </div>
            </div>
        </div>
    </div>
</div>
