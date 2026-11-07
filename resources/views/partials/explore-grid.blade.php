@props([
    'items' => [],
    'total' => 0,
    'page' => 1,
    'lastPage' => 1,
])

<div id="explore-cards-container" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 py-4">
    @forelse($items as $item)
        <div class="explore-card group relative flex flex-col rounded-2xl bg-theme-card border border-theme-default hover:border-theme-highlight transition-all duration-300 hover:scale-[1.03] cursor-pointer overflow-hidden backdrop-blur-md shadow-lg"
             data-format="{{ $item['format'] }}"
             data-status="{{ $item['status'] }}"
             data-title="{{ strtolower($item['title']) }}"
             onclick="window.pushNavigation('work', '{{ $item['id'] }}', '{{ addslashes($item['title']) }}')">
            <div class="relative w-full aspect-[3/4] overflow-hidden bg-theme-base">
                <img src="{{ $item['image'] }}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70"></div>
                
                <!-- Selo Geométrico Superior -->
                <span class="absolute top-2 left-2 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-theme-pill text-theme-accent border border-theme-default uppercase">
                    {{ $item['format'] }}
                </span>

                <!-- Status Canônico -->
                @if(!empty($item['status']))
                    <span class="absolute bottom-2 right-2 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded uppercase {{ $item['status'] === 'RELEASING' ? 'bg-theme-accent/20 text-theme-accent border border-theme-accent/30' : 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border border-[var(--color-state-canon,#10B981)]/30' }}">
                        {{ $item['status'] === 'RELEASING' ? 'Lançamento' : 'Finalizado' }}
                    </span>
                @endif
            </div>
            
            <div class="p-3 flex flex-col justify-between flex-1">
                <h4 class="text-xs font-semibold text-theme-primary truncate group-hover:text-theme-accent transition-colors" title="{{ $item['title'] }}">
                    {{ $item['title'] }}
                </h4>
                <div class="flex items-center justify-between text-[10px] font-mono text-theme-muted mt-1">
                    <span>{{ $item['episode_count'] ? $item['episode_count'] . ' eps' : 'Filme / Especial' }}</span>
                    <span class="w-1.5 h-1.5 rounded-full bg-theme-accent"></span>
                </div>
            </div>
        </div>
    @empty
        <div class="col-span-full py-20 text-center flex flex-col items-center justify-center gap-2">
            <span class="text-3xl">🔍</span>
            <p class="text-sm font-mono text-theme-muted" data-i18n="explore.empty">Nenhuma obra encontrada para esta combinação de filtros.</p>
        </div>
    @endforelse
</div>
