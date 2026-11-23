<?php

namespace App\Support;

use Illuminate\Http\Request;

class LocaleResolver
{
    /** @var list<string> */
    public const array SUPPORTED_LOCALES = [
        'pt-BR',
        'en-US',
        'es-ES',
        'ja-JP',
        'zh-CN',
        'ru-RU',
        'it-IT',
        'fr-FR',
        'de-DE',
        'hi-IN',
    ];

    /** @var array<string, string> */
    private const array PREFIX_TO_LOCALE = [
        'pt' => 'pt-BR',
        'en' => 'en-US',
        'es' => 'es-ES',
        'ja' => 'ja-JP',
        'zh' => 'zh-CN',
        'ru' => 'ru-RU',
        'it' => 'it-IT',
        'fr' => 'fr-FR',
        'de' => 'de-DE',
        'hi' => 'hi-IN',
    ];

    /** @var array<string, string> */
    private const array COUNTRY_TO_LOCALE = [
        'BR' => 'pt-BR', 'PT' => 'pt-BR', 'AO' => 'pt-BR', 'MZ' => 'pt-BR', 'CV' => 'pt-BR', 'GW' => 'pt-BR', 'ST' => 'pt-BR', 'TL' => 'pt-BR',
        'ES' => 'es-ES', 'MX' => 'es-ES', 'AR' => 'es-ES', 'CO' => 'es-ES', 'CL' => 'es-ES', 'PE' => 'es-ES', 'VE' => 'es-ES',
        'EC' => 'es-ES', 'GT' => 'es-ES', 'CU' => 'es-ES', 'BO' => 'es-ES', 'DO' => 'es-ES', 'HN' => 'es-ES', 'PY' => 'es-ES',
        'SV' => 'es-ES', 'NI' => 'es-ES', 'CR' => 'es-ES', 'PA' => 'es-ES', 'UY' => 'es-ES', 'GQ' => 'es-ES', 'PR' => 'es-ES',
        'JP' => 'ja-JP',
        'CN' => 'zh-CN', 'TW' => 'zh-CN', 'HK' => 'zh-CN', 'MO' => 'zh-CN', 'SG' => 'zh-CN',
        'RU' => 'ru-RU', 'BY' => 'ru-RU', 'KZ' => 'ru-RU', 'KG' => 'ru-RU',
        'IT' => 'it-IT', 'SM' => 'it-IT', 'VA' => 'it-IT',
        'FR' => 'fr-FR', 'MC' => 'fr-FR', 'BE' => 'fr-FR', 'LU' => 'fr-FR',
        'DE' => 'de-DE', 'AT' => 'de-DE', 'CH' => 'de-DE', 'LI' => 'de-DE',
        'IN' => 'hi-IN',
    ];

    /** @var array<string, string> */
    private const array GOOGLE_TRANSLATE_CODES = [
        'pt-BR' => 'pt',
        'en-US' => 'en',
        'es-ES' => 'es',
        'ja-JP' => 'ja',
        'zh-CN' => 'zh-CN',
        'ru-RU' => 'ru',
        'it-IT' => 'it',
        'fr-FR' => 'fr',
        'de-DE' => 'de',
        'hi-IN' => 'hi',
    ];

    public function normalize(?string $raw): ?string
    {
        $clean = str_replace('_', '-', trim((string) $raw));
        if ($clean === '') {
            return null;
        }

        $lower = strtolower($clean);
        foreach (self::SUPPORTED_LOCALES as $supported) {
            if (strtolower($supported) === $lower) {
                return $supported;
            }
        }

        $prefix = explode('-', $lower)[0] ?? '';

        return self::PREFIX_TO_LOCALE[$prefix] ?? null;
    }

    public function toCatalogLocale(string $uiLocale): string
    {
        $normalized = $this->normalize($uiLocale) ?? 'en-US';

        return $normalized === 'en-US' ? 'en' : $normalized;
    }

    public function toGoogleTranslateCode(string $uiLocale): string
    {
        $normalized = $this->normalize($uiLocale) ?? 'en-US';

        return self::GOOGLE_TRANSLATE_CODES[$normalized] ?? 'en';
    }

    public function resolveFromRequest(Request $request): string
    {
        $queryLang = $this->normalize((string) $request->query('lang', ''));
        if ($queryLang !== null) {
            return $queryLang;
        }

        $cookieLang = $this->normalize((string) $request->cookie('anirium_lang', ''));
        if ($cookieLang !== null) {
            return $cookieLang;
        }

        foreach (['CF-IPCountry', 'X-Country-Code', 'X-Vercel-IP-Country'] as $header) {
            $country = strtoupper(trim((string) $request->header($header, '')));
            if ($country !== '' && $country !== 'XX' && $country !== 'T1') {
                return self::COUNTRY_TO_LOCALE[$country] ?? 'en-US';
            }
        }

        $acceptLang = $this->resolveFromAcceptLanguage((string) $request->header('Accept-Language', ''));
        if ($acceptLang !== null) {
            return $acceptLang;
        }

        return 'en-US';
    }

    private function resolveFromAcceptLanguage(string $header): ?string
    {
        if (trim($header) === '') {
            return null;
        }

        $candidates = [];
        foreach (explode(',', $header) as $index => $part) {
            $segments = array_map('trim', explode(';', trim($part)));
            $tag = $segments[0] ?? '';
            if ($tag === '' || $tag === '*') {
                continue;
            }

            $quality = 1.0;
            foreach (array_slice($segments, 1) as $param) {
                if (preg_match('/^q=([0-9.]+)$/i', $param, $match) === 1) {
                    $quality = (float) $match[1];
                }
            }

            $candidates[] = ['tag' => $tag, 'q' => $quality, 'idx' => $index];
        }

        usort($candidates, static fn (array $a, array $b): int => $b['q'] <=> $a['q'] ?: $a['idx'] <=> $b['idx']);

        foreach ($candidates as $candidate) {
            $resolved = $this->normalize($candidate['tag']);
            if ($resolved !== null) {
                return $resolved;
            }
        }

        return null;
    }
}
