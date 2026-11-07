@props([
    'targetType' => 'work',
    'targetId' => '',
    'targetTitle' => '',
    'isBookmarked' => false,
    'isLiked' => false,
    'userScore' => null,
    'userStatus' => null,
    'isWatched' => false,
])

<div class="w-full flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-theme-default bg-theme-surface/80 backdrop-blur-md"
     id="entity-actions-bar"
     data-target-type="{{ $targetType }}"
     data-target-id="{{ $targetId }}">
    
    <!-- 1. Avaliação Pessoal (1 a 10 Estrelas Interativas) -->
    <div class="flex items-center gap-2">
        <div class="flex items-center gap-0.5" id="user-rating-stars">
            @for($i = 1; $i <= 10; $i++)
                <button type="button"
                        class="p-0.5 text-xs transition-transform hover:scale-125 cursor-pointer text-theme-muted hover:text-theme-accent"
                        title="Nota {{ $i }}/10"
                        onclick="window.submitEntityRating('{{ $targetType }}', '{{ $targetId }}', {{ $i }})"
                        data-star="{{ $i }}">
                    ★
                </button>
            @endfor
        </div>
        <span class="text-[11px] font-mono font-bold text-theme-accent min-w-[28px]" id="user-rating-value">
            {{ $userScore ? $userScore . '/10' : '' }}
        </span>
    </div>

    <!-- 2. Status de Consumo (Consumindo, Concluído, Na Fila, Pausado) -->
    <div class="flex items-center gap-1.5 flex-wrap">
        @php
            $statuses = [
                ['key' => 'watching', 'i18n' => 'action.status_watching', 'label' => 'Consumindo'],
                ['key' => 'completed', 'i18n' => 'action.status_completed', 'label' => 'Concluído'],
                ['key' => 'plan_to', 'i18n' => 'action.status_plan', 'label' => 'Na Fila'],
                ['key' => 'dropped', 'i18n' => 'action.status_dropped', 'label' => 'Pausado'],
            ];
        @endphp
        @foreach($statuses as $st)
            <button type="button"
                    onclick="window.setEntityStatus('{{ $targetType }}', '{{ $targetId }}', '{{ $st['key'] }}')"
                    id="btn-status-{{ $st['key'] }}"
                    class="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase transition-all cursor-pointer border {{ $userStatus === $st['key'] ? 'bg-theme-accent text-theme-inverse border-theme-accent shadow-md' : 'bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary' }}">
                <span data-i18n="{{ $st['i18n'] }}">{{ $st['label'] }}</span>
            </button>
        @endforeach
    </div>

    <!-- 3. Botões Rápidos: Favorito, Curtida e Assistido -->
    <div class="flex items-center gap-2">
        @if($targetType === 'episode' || $targetType === 'work')
            <button type="button"
                    onclick="window.toggleEntityWatched('{{ $targetType }}', '{{ $targetId }}')"
                    id="btn-action-watched"
                    title="Marcar como Assistido"
                    data-i18n-title="action.mark_watched"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer {{ $isWatched ? 'bg-[var(--color-state-canon,#10B981)]/20 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/40' : 'bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary' }}">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span data-i18n="action.watched">Assistido</span>
            </button>
        @endif

        <button type="button"
                onclick="window.toggleEntityBookmark('{{ $targetType }}', '{{ $targetId }}')"
                id="btn-action-bookmark"
                title="Favoritar"
                data-i18n-title="action.bookmark"
                class="p-2 rounded-xl border text-xs transition-all cursor-pointer {{ $isBookmarked ? 'bg-theme-accent text-theme-inverse border-theme-accent shadow-md' : 'bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary' }}">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>

        <button type="button"
                onclick="window.toggleEntityLike('{{ $targetType }}', '{{ $targetId }}')"
                id="btn-action-like"
                title="Curtir"
                data-i18n-title="action.like"
                class="p-2 rounded-xl border text-xs transition-all cursor-pointer {{ $isLiked ? 'bg-[var(--color-state-filler,#F43F5E)] text-white border-[var(--color-state-filler,#F43F5E)] shadow-md' : 'bg-theme-pill text-theme-muted border-theme-default hover:text-theme-primary' }}">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
    </div>
</div>
