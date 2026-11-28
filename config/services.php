<?php

return [

    'anirium' => [
        'service_secret' => env('ANIRIUM_SERVICE_SECRET', 'development-only-anirium-service-secret'),
    ],

    'addons' => [
        'player_pro_bundle_url' => env('ANIRIUM_PLAYER_PRO_BUNDLE_URL', 'https://godzlayer.github.io/anirium-player-pro/dist/player-pro.js'),
        'player_pro_repository_url' => env('ANIRIUM_PLAYER_PRO_REPO_URL', 'https://github.com/GodZlayer/anirium-player-pro'),
        'manga_reader_bundle_url' => env('ANIRIUM_MANGA_READER_BUNDLE_URL', 'https://godzlayer.github.io/anirium-manga-reader/dist/manga-reader.js'),
        'manga_reader_repository_url' => env('ANIRIUM_MANGA_READER_REPO_URL', 'https://github.com/GodZlayer/anirium-manga-reader'),
    ],

    'ollama' => [
        'url' => env('OLLAMA_URL', 'http://host.docker.internal:11434'),
        'model' => env('OLLAMA_TRANSLATE_MODEL', 'gemma4:e2b-it-qat'),
    ],

    'myanimelist' => [
        'client_id' => env('MAL_CLIENT_ID'),
        'detail_budget' => env('MAL_DETAIL_BUDGET', 1000),
    ],

    'catalog' => [
        'arc_budget' => env('MEDIAWIKI_WORK_BUDGET', 10),
        'episode_budget' => env('EPISODE_DETAIL_BUDGET', 200),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', 'http://localhost:8080/auth/google/callback'),
    ],

    'efi' => [
        'sandbox' => (bool) env('EFI_SANDBOX', false),
        'client_id' => env('EFI_SANDBOX', false)
            ? env('EFI_SANDBOX_CLIENT_ID', env('EFI_CLIENT_ID'))
            : env('EFI_PROD_CLIENT_ID', env('EFI_CLIENT_ID')),
        'client_secret' => env('EFI_SANDBOX', false)
            ? env('EFI_SANDBOX_CLIENT_SECRET', env('EFI_CLIENT_SECRET'))
            : env('EFI_PROD_CLIENT_SECRET', env('EFI_CLIENT_SECRET')),
        'certificate_path' => env('EFI_SANDBOX', false)
            ? env('EFI_SANDBOX_CERTIFICATE_PATH', env('EFI_CERTIFICATE_PATH'))
            : env('EFI_PROD_CERTIFICATE_PATH', env('EFI_CERTIFICATE_PATH')),
        'pix_key' => env('EFI_PIX_KEY'),
        'usd_brl_rate' => (float) env('EFI_USD_BRL_RATE', 5.80),
        'monthly_price_usd' => 0.99,
        'annual_price_usd' => 9.99,
        'webhook_secret' => env('EFI_WEBHOOK_SECRET'),
    ],

];
