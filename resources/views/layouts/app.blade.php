<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark h-full w-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>{{ config('app.name', 'Anirium') }} — Plataforma Ontológica</title>

    <!-- Favicon Oficial Anirium -->
    <link rel="icon" type="image/png" href="/assets/logos/Anirium-favicon.png">
    <link rel="shortcut icon" href="/favicon.ico">

    <!-- Tailwind CSS v4 / App Stylesheet -->
    @vite(['resources/css/app.css'])

    <!-- Tokens Universais de Design TGCode Inicializados -->
    <style>
        :root {
            --color-bg-base: #0B0B0D;
            --color-bg-surface: #1A1A1F;
            --color-bg-raised: #23232A;
            --color-border-default: rgba(255, 255, 255, 0.1);
            --color-border-highlight: #FFC766;
            --color-text-primary: #FFF9F0;
            --color-text-secondary: #EADCC8;
            --color-text-muted: #8E8E93;
            --color-accent-primary: #FFC766;
            --color-state-canon: #10B981;
            --color-state-filler: #F43F5E;
            --color-state-mixed: #A855F7;
            --color-header-bg: #0E1118;
            --color-card-bg: #141720;
            --color-pill-bg: #1C202E;
            --bg-canvas: var(--color-bg-base);
            --surface-elevated: var(--color-bg-surface);
            --surface-border: var(--color-border-default);
        }
        body {
            background-color: var(--color-bg-base);
            color: var(--color-text-primary);
            user-select: none;
            -webkit-user-select: none;
        }
    </style>
</head>
<body class="h-full w-full overflow-hidden antialiased bg-theme-base text-theme-primary font-sans">
    <!-- Viewport Fixa Anti-Scroll Cego (Padrão TGCode) -->
    <main class="relative h-screen w-screen flex flex-col justify-between overflow-hidden bg-theme-base">
        {{ $slot }}
    </main>

    <!-- Host de Modais Ontológicos Globais -->
    <div id="modal-container" class="relative z-50"></div>

    <script src="/js/theme-lang-engine.js"></script>
    @stack('scripts')
</body>
</html>
