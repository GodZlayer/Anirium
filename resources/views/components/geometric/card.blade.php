@props([
    'id',
    'title',
    'image' => null,
    'format' => 'ANIME',
    'badge' => null,
    'studio' => null,
])

<div {{ $attributes->merge(['class' => 'group relative flex flex-col w-[190px] h-[280px] shrink-0 rounded-xl bg-theme-card border border-theme-default hover:border-theme-highlight transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl cursor-pointer overflow-hidden backdrop-blur-md']) }}
     data-entity-id="{{ $id }}"
     onclick="window.pushNavigation('work', '{{ $id }}', '{{ addslashes($title) }}')">
    
    <!-- Thumbnail Imagem com Máscara Gradiente -->
    <div class="relative w-full h-[200px] overflow-hidden bg-theme-base">
        @if($image)
            <img src="{{ $image }}" alt="{{ $title }}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
        @else
            <div class="w-full h-full flex items-center justify-center bg-theme-raised text-theme-muted">
                <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
        @endif

        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90"></div>

        <!-- Badges Geométricos Flutuantes -->
        <div class="absolute top-2 left-2 flex gap-1.5">
            <x-geometric.badge :label="$format" size="sm" variant="accent" />
            @if($badge)
                <x-geometric.badge :label="$badge" size="sm" variant="canon" />
            @endif
        </div>
    </div>

    <!-- Metadados Limpos (Densidade Mínima) -->
    <div class="flex flex-col justify-between flex-1 p-3">
        <h3 class="text-sm font-semibold text-theme-primary truncate group-hover:text-theme-accent transition-colors" title="{{ $title }}">
            {{ $title }}
        </h3>
        
        <div class="flex items-center justify-between text-[11px] text-theme-muted">
            <span>{{ $studio ?? '' }}</span>
            @if(!$studio)
                <span data-i18n="catalog.official_production">Produção Oficial</span>
            @endif
            <span class="w-1.5 h-1.5 rounded-full bg-theme-accent"></span>
        </div>
    </div>
</div>
