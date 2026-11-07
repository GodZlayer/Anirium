@props([
    'label',
    'variant' => 'default', // default, canon, filler, accent
    'size' => 'md',
])

@php
$classes = match($variant) {
    'canon' => 'bg-[var(--color-state-canon,#10B981)]/10 text-[var(--color-state-canon,#10B981)] border-[var(--color-state-canon,#10B981)]/20',
    'filler' => 'bg-[var(--color-state-filler,#F43F5E)]/10 text-[var(--color-state-filler,#F43F5E)] border-[var(--color-state-filler,#F43F5E)]/20',
    'accent' => 'bg-theme-pill text-theme-accent border-theme-highlight',
    default => 'bg-theme-pill text-theme-secondary border-theme-default',
};

$sizeClasses = match($size) {
    'sm' => 'text-[10px] px-1.5 py-0.5',
    default => 'text-xs px-2.5 py-1',
};
@endphp

<span {{ $attributes->merge(['class' => "inline-flex items-center font-medium tracking-wider uppercase rounded border backdrop-blur-sm {$classes} {$sizeClasses}"]) }}>
    {{ $label }}
</span>
