<?php

return [

    'anirium' => [
        'service_secret' => env('ANIRIUM_SERVICE_SECRET', 'development-only-anirium-service-secret'),
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

];
