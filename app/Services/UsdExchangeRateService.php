<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class UsdExchangeRateService
{
    public const float MARKUP_MULTIPLIER = 1.03;

    private const string CACHE_KEY = 'anirium_plus:usd_brl_rate_v1';

    private const int CACHE_TTL_SECONDS = 1800;

    /**
     * Returns the live USD -> BRL exchange rate with the +3% markup applied.
     *
     * @return array{base_rate: float, markup_percent: float, effective_rate: float, source: string, updated_at: string}
     */
    public function getRate(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, function (): array {
            $fetched = $this->fetchFromAwesomeApi()
                ?? $this->fetchFromOpenErApi()
                ?? [
                    'rate' => max(1.0, (float) config('services.efi.usd_brl_rate', 5.80)),
                    'source' => 'fallback_config',
                ];

            $baseRate = round($fetched['rate'], 4);
            $effectiveRate = round($baseRate * self::MARKUP_MULTIPLIER, 4);

            return [
                'base_rate' => $baseRate,
                'markup_percent' => 3.0,
                'effective_rate' => $effectiveRate,
                'source' => $fetched['source'],
                'updated_at' => now()->toIso8601String(),
            ];
        });
    }

    /**
     * Converts a USD price to BRL using today's live USD rate + 3%.
     */
    public function convertUsdToBrl(float $usdAmount): float
    {
        $rate = $this->getRate();

        return round($usdAmount * $rate['effective_rate'], 2);
    }

    /**
     * @return array{rate: float, source: string}|null
     */
    private function fetchFromAwesomeApi(): ?array
    {
        try {
            $response = Http::timeout(5)
                ->acceptJson()
                ->get('https://economia.awesomeapi.com.br/json/last/USD-BRL');

            if (! $response->successful()) {
                return null;
            }

            $ask = (float) ($response->json('USDBRL.ask') ?? $response->json('USDBRL.bid') ?? 0);
            if ($ask >= 1.0 && $ask <= 20.0) {
                return ['rate' => $ask, 'source' => 'awesomeapi'];
            }
        } catch (Throwable) {
            return null;
        }

        return null;
    }

    /**
     * @return array{rate: float, source: string}|null
     */
    private function fetchFromOpenErApi(): ?array
    {
        try {
            $response = Http::timeout(5)
                ->acceptJson()
                ->get('https://open.er-api.com/v6/latest/USD');

            if (! $response->successful()) {
                return null;
            }

            $brl = (float) ($response->json('rates.BRL') ?? 0);
            if ($brl >= 1.0 && $brl <= 20.0) {
                return ['rate' => $brl, 'source' => 'open_er_api'];
            }
        } catch (Throwable) {
            return null;
        }

        return null;
    }
}
