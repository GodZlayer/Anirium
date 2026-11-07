@props([
    'title',
    'items' => [],
    'icon' => 'flame',
])

<section {{ $attributes->merge(['class' => 'flex flex-col gap-3 w-full shrink-0 px-8 py-2']) }}>
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
            <span class="p-1.5 rounded-lg bg-theme-pill text-theme-accent border border-theme-highlight/30">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </span>
            <h2 class="text-base font-bold tracking-wide text-theme-primary uppercase">{{ $title }}</h2>
        </div>

        <span class="text-xs font-medium text-theme-muted hover:text-theme-accent cursor-pointer transition-colors" data-i18n="catalog.view_all">
            Ver Todos →
        </span>
    </div>

    <!-- Trilho Horizontal Deslizante Sem Scrollbar Feia -->
    <div class="flex items-center gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth">
        @foreach($items as $work)
            <x-geometric.card
                :id="$work['id']"
                :title="$work['title']"
                :image="$work['image']"
                :format="$work['format']"
                :studio="$work['studio']"
            />
        @endforeach
    </div>
</section>
