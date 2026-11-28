@props([
    'status' => 'none', // 'completed' | 'partial' | 'none'
    'watched' => 0,
    'total' => 0,
    'percent' => 0,
    'completeLabel' => 'Assistido',
    'partialLabel' => 'Parcial',
    'showBar' => true,
])

@if($status === 'completed')
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 backdrop-blur-md shadow-sm">
        <svg class="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
        <span>{{ $completeLabel }}@if($total > 0 && $watched > 0) · {{ $watched }}/{{ $total }}@endif</span>
    </span>
@elseif($status === 'partial')
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-200 border border-amber-400/40 backdrop-blur-md shadow-sm">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
        <span>
            @if($total > 0 && $watched > 0)
                {{ $watched }}/{{ $total }}
            @elseif($percent > 0)
                {{ $partialLabel }} {{ $percent }}%
            @else
                {{ $partialLabel }}
            @endif
        </span>
    </span>
@endif
