<?php

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class SynopsisTranslator
{
    /** @var array<string, string> */
    private const array TARGET_LANGUAGE_NAMES = [
        'pt-BR' => 'Brazilian Portuguese',
        'es-ES' => 'Spanish',
        'ja-JP' => 'Japanese',
        'zh-CN' => 'Simplified Chinese',
        'ru-RU' => 'Russian',
        'it-IT' => 'Italian',
        'fr-FR' => 'French',
        'de-DE' => 'German',
        'hi-IN' => 'Hindi',
    ];

    private bool $rateLimited = false;

    public function __construct(private LocaleResolver $locales) {}

    public function consumeRateLimitFlag(): bool
    {
        $flag = $this->rateLimited;
        $this->rateLimited = false;

        return $flag;
    }

    public function resolveForWork(string $workId, string $uiLocale): ?string
    {
        $normalizedUi = $this->locales->normalize($uiLocale) ?? 'en-US';
        $catalogLocale = $this->locales->toCatalogLocale($normalizedUi);
        $lookupLocales = array_values(array_unique([$normalizedUi, $catalogLocale, 'en', 'und']));

        $byLocale = DB::table('catalog_translations')
            ->where('entity_id', $workId)
            ->where('field', 'synopsis')
            ->whereIn('locale', $lookupLocales)
            ->pluck('value', 'locale');

        foreach ([$normalizedUi, $catalogLocale] as $preferred) {
            $existing = trim((string) ($byLocale[$preferred] ?? ''));
            if ($existing !== '') {
                return $existing;
            }
        }

        $sourceEn = trim((string) ($byLocale['en'] ?? ''));
        if ($normalizedUi !== 'en-US' && $sourceEn !== '') {
            $translated = $this->translateAndStore($workId, $sourceEn, $normalizedUi);
            if ($translated !== null && $translated !== '') {
                return $translated;
            }
        }

        if ($sourceEn !== '') {
            return $sourceEn;
        }

        $und = trim((string) ($byLocale['und'] ?? ''));

        return $und !== '' ? $und : null;
    }

    public function translateAndStore(string $entityId, string $sourceEn, string $targetUiLocale): ?string
    {
        $normalizedUi = $this->locales->normalize($targetUiLocale) ?? 'en-US';
        $targetLocale = $this->locales->toCatalogLocale($normalizedUi);
        if ($targetLocale === 'en') {
            return trim($sourceEn) !== '' ? $sourceEn : null;
        }

        $translated = $this->translate($sourceEn, $normalizedUi);
        if ($translated === null || trim($translated) === '') {
            return null;
        }

        $this->storeTranslation($entityId, $targetLocale, mb_scrub($translated, 'UTF-8'));

        return $translated;
    }

    private function storeTranslation(string $entityId, string $targetLocale, string $translated): void
    {
        $maxAttempts = 3;
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                DB::table('catalog_translations')->upsert(
                    [[
                        'entity_id' => $entityId,
                        'entity_kind' => 'work',
                        'field' => 'synopsis',
                        'locale' => $targetLocale,
                        'value' => $translated,
                    ]],
                    ['entity_id', 'field', 'locale'],
                    ['entity_kind', 'value'],
                );

                return;
            } catch (QueryException $e) {
                if ($attempt === $maxAttempts) {
                    throw $e;
                }
                usleep(250_000 * $attempt);
            }
        }
    }

    public function translate(string $text, string $targetUiLocale): ?string
    {
        $this->rateLimited = false;
        $scrubbed = mb_scrub($text, 'UTF-8');
        $cleaned = trim(strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $scrubbed)));
        if ($cleaned === '') {
            return null;
        }

        $normalizedUi = $this->locales->normalize($targetUiLocale) ?? 'en-US';
        if ($normalizedUi === 'en-US') {
            return $cleaned;
        }

        $languageName = self::TARGET_LANGUAGE_NAMES[$normalizedUi] ?? 'English';
        $baseUrl = rtrim((string) config('services.ollama.url', 'http://host.docker.internal:11434'), '/');
        $model = trim((string) config('services.ollama.model', 'gemma4:e2b-it-qat'));
        $translatedParts = [];

        foreach ($this->chunkText($cleaned, 3800) as $chunk) {
            try {
                $response = Http::connectTimeout(3)
                    ->timeout(30)
                    ->post("{$baseUrl}/api/generate", [
                        'model' => $model,
                        'stream' => false,
                        'think' => false,
                        'options' => [
                            'temperature' => 0.1,
                        ],
                        'prompt' => "Translate the following anime/manga synopsis from English to {$languageName}. Return ONLY the translated text without quotes, notes, or explanations:\n\n{$chunk}",
                    ]);
            } catch (ConnectionException|\InvalidArgumentException) {
                return null;
            }

            if ($response->status() === 429) {
                $this->rateLimited = true;

                return null;
            }

            if (! $response->successful()) {
                return null;
            }

            $piece = trim((string) $response->json('response', ''));
            if ($piece === '') {
                return null;
            }

            $translatedParts[] = $piece;
        }

        $joined = trim(implode("\n", $translatedParts));

        return $joined !== '' ? $joined : null;
    }

    /**
     * @return list<string>
     */
    private function chunkText(string $text, int $maxLength): array
    {
        if (mb_strlen($text, 'UTF-8') <= $maxLength) {
            return [$text];
        }

        $chunks = [];
        $current = '';
        $paragraphs = preg_split('/\R+/', $text) ?: [$text];

        foreach ($paragraphs as $paragraph) {
            $paragraph = trim($paragraph);
            if ($paragraph === '') {
                continue;
            }

            $candidate = $current === '' ? $paragraph : "{$current}\n{$paragraph}";
            if (mb_strlen($candidate, 'UTF-8') <= $maxLength) {
                $current = $candidate;

                continue;
            }

            if ($current !== '') {
                $chunks[] = $current;
                $current = '';
            }

            while (mb_strlen($paragraph, 'UTF-8') > $maxLength) {
                $slice = mb_substr($paragraph, 0, $maxLength, 'UTF-8');
                $lastSpace = mb_strrpos($slice, ' ', 0, 'UTF-8');
                $cutAt = ($lastSpace !== false && $lastSpace > (int) ($maxLength * 0.5)) ? $lastSpace : $maxLength;
                $chunks[] = trim(mb_substr($paragraph, 0, $cutAt, 'UTF-8'));
                $paragraph = trim(mb_substr($paragraph, $cutAt, null, 'UTF-8'));
            }

            $current = $paragraph;
        }

        if ($current !== '') {
            $chunks[] = $current;
        }

        return $chunks;
    }
}
