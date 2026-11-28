@props([
    'targetType' => 'work',
    'targetId' => '',
])

@php
    $discussionTitle = match (strtolower((string) $targetType)) {
        'episode' => 'Discussão do Episódio',
        'universe' => 'Discussão do Universo',
        'arc' => 'Discussão do Arco',
        'creator' => 'Discussão do Criador',
        'studio' => 'Discussão do Estúdio',
        'track' => 'Discussão da Música',
        default => 'Discussão da Obra',
    };
@endphp

<div class="w-full flex-1 flex flex-col min-h-0 bg-theme-surface/60 rounded-3xl border border-theme-default p-4 gap-3"
     id="entity-discussions-container"
     data-target-type="{{ $targetType }}"
     data-target-id="{{ $targetId }}">
    
    <!-- Cabeçalho do Bloco de Discussão -->
    <div class="flex items-center justify-between pb-2 border-b border-theme-default">
        <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-theme-accent animate-pulse"></span>
            <h3 class="text-xs font-mono font-bold uppercase tracking-wider text-theme-primary">{{ $discussionTitle }}</h3>
        </div>
        <span class="px-2 py-0.5 rounded-full border border-theme-accent/30 bg-theme-pill text-[9px] font-mono font-bold text-theme-accent">
            LIVE · SSE
        </span>
    </div>

    <!-- Lista de Comentários com Scroll Suave -->
    <div class="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1 min-h-[120px]" id="discussion-comments-list">
        <div class="p-6 text-center text-xs font-mono text-theme-muted" data-i18n="discussion.loading">
            Carregando discussões...
        </div>
    </div>

    <!-- Formulário de Envio de Comentário -->
    <div class="pt-2 border-t border-theme-default flex flex-col gap-2">
        <div class="flex items-center justify-between px-1">
            <label class="flex items-center gap-1.5 text-[10px] font-mono text-theme-muted cursor-pointer select-none">
                <input type="checkbox" id="discussion-spoiler-check" class="rounded border-theme-default text-theme-accent focus:ring-0">
                <span data-i18n="discussion.spoiler_label">Contém Spoilers</span>
            </label>
            <span class="text-[9px] font-mono text-theme-muted" data-i18n="discussion.markdown_hint">Suporta texto limpo</span>
        </div>
        <div class="flex items-center gap-2">
            <input type="text"
                   id="discussion-input-body"
                   placeholder="Compartilhe sua teoria, análise ou opinião..."
                   data-i18n-placeholder="discussion.placeholder"
                   onkeydown="if(event.key==='Enter') window.submitEntityComment('{{ $targetType }}', '{{ $targetId }}')"
                   class="flex-1 px-3.5 py-2 rounded-xl text-xs bg-theme-pill border border-theme-default text-theme-primary placeholder-theme-muted focus:outline-none focus:border-theme-accent transition-all font-sans">
            <button type="button"
                    onclick="window.submitEntityComment('{{ $targetType }}', '{{ $targetId }}')"
                    class="px-4 py-2 rounded-xl text-xs font-mono font-bold bg-theme-accent text-theme-inverse hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-md shrink-0 flex items-center gap-1.5">
                <span data-i18n="discussion.send">Enviar</span>
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            </button>
        </div>
    </div>
</div>
