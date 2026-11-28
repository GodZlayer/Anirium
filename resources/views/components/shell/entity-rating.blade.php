@props([
    'targetType' => 'work',
    'targetId' => '',
    'userScore' => null,
    'communityScore' => null,
    'compact' => false,
])

@php
    $currentScore = is_numeric($userScore) ? (int) round((float) $userScore) : 0;
    $formattedCommunity = is_numeric($communityScore) && (float) $communityScore > 0
        ? number_format((float) $communityScore, 1)
        : null;
    $uid = 'rating-' . preg_replace('/[^a-zA-Z0-9_-]/', '', $targetType . '-' . $targetId);
@endphp

<div class="inline-flex flex-wrap items-center gap-2.5 {{ $compact ? 'px-2.5 py-1.5 rounded-xl' : 'px-3.5 py-2 rounded-2xl' }} bg-theme-surface/85 border border-theme-default backdrop-blur-md"
     id="{{ $uid }}"
     data-rating-widget
     data-target-type="{{ $targetType }}"
     data-target-id="{{ $targetId }}"
     data-current-score="{{ $currentScore }}">

    @if($formattedCommunity)
        <div class="flex items-center gap-1 pr-2.5 border-r border-theme-default/70" title="Nota da comunidade">
            <span class="text-amber-400 text-sm leading-none">★</span>
            <span class="text-xs font-mono font-black text-theme-primary">{{ $formattedCommunity }}</span>
            <span class="text-[10px] font-mono text-theme-muted">/10</span>
        </div>
    @endif

    <div class="flex items-center gap-1.5">
        <span class="text-[10px] font-mono uppercase tracking-wider text-theme-muted hidden sm:inline">Sua nota</span>
        <div class="flex items-center gap-0.5" role="radiogroup" aria-label="Avaliar de 1 a 10">
            @for($i = 1; $i <= 10; $i++)
                <button type="button"
                        data-star-value="{{ $i }}"
                        title="Nota {{ $i }}/10"
                        onclick="(function(btn){
                            const wrap = btn.closest('[data-rating-widget]');
                            if (wrap) {
                                wrap.dataset.currentScore = '{{ $i }}';
                                wrap.querySelectorAll('[data-star-value]').forEach(function(el){
                                    const v = Number(el.dataset.starValue || 0);
                                    el.classList.toggle('text-amber-400', v <= {{ $i }});
                                    el.classList.toggle('text-theme-muted/40', v > {{ $i }});
                                });
                                const lbl = wrap.querySelector('[data-rating-label]');
                                if (lbl) lbl.textContent = '{{ $i }}/10';
                            }
                            if (window.submitEntityRating) {
                                window.submitEntityRating('{{ $targetType }}', '{{ $targetId }}', {{ $i }});
                            }
                        })(this)"
                        onmouseenter="(function(btn){
                            const wrap = btn.closest('[data-rating-widget]');
                            if (!wrap) return;
                            wrap.querySelectorAll('[data-star-value]').forEach(function(el){
                                const v = Number(el.dataset.starValue || 0);
                                el.classList.toggle('text-amber-300', v <= {{ $i }});
                            });
                        })(this)"
                        onmouseleave="(function(btn){
                            const wrap = btn.closest('[data-rating-widget]');
                            if (!wrap) return;
                            const cur = Number(wrap.dataset.currentScore || 0);
                            wrap.querySelectorAll('[data-star-value]').forEach(function(el){
                                const v = Number(el.dataset.starValue || 0);
                                el.classList.remove('text-amber-300');
                                el.classList.toggle('text-amber-400', v <= cur);
                                el.classList.toggle('text-theme-muted/40', v > cur);
                            });
                        })(this)"
                        class="p-0.5 {{ $compact ? 'text-xs' : 'text-sm' }} leading-none transition-transform hover:scale-125 cursor-pointer {{ $i <= $currentScore ? 'text-amber-400' : 'text-theme-muted/40' }}">
                    ★
                </button>
            @endfor
        </div>
        <span data-rating-label class="text-[11px] font-mono font-bold text-amber-400 min-w-[32px] text-right">
            {{ $currentScore > 0 ? $currentScore . '/10' : '—' }}
        </span>
    </div>
</div>
