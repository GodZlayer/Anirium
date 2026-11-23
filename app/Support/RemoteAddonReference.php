<?php

namespace App\Support;

class RemoteAddonReference
{
    /** @return array{id: string, kind: string, manifestUrl: string}|null */
    public static function fromUrl(string $input): ?array
    {
        $url = self::unwrapWebStremioInstallUrl(trim($input));
        $url = preg_replace('/^stremio:\/\//i', 'https://', $url);
        if (strlen($url) > 2048 || preg_match('/[\s\x00-\x1f\x7f\\\\]/', $url)) {
            return null;
        }
        $parts = parse_url($url);
        if (! is_array($parts) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
            return null;
        }
        $scheme = strtolower($parts['scheme'] ?? '');
        if (! in_array($scheme, ['http', 'https'], true)) {
            return null;
        }
        $host = strtolower($parts['host']);
        $port = $parts['port'] ?? null;
        $authority = $host.($port && ! (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) ? ':'.$port : '');
        $canonical = $scheme.'://'.$authority.($parts['path'] ?? '').(isset($parts['query']) ? '?'.$parts['query'] : '');

        return ['id' => 'remote-'.substr(hash('sha256', $canonical), 0, 32), 'kind' => 'remote-manifest', 'manifestUrl' => $canonical];
    }

    private static function unwrapWebStremioInstallUrl(string $input): string
    {
        if (strlen($input) > 4096 || preg_match('/[\s\x00-\x1f\x7f\\\\]/', $input)) {
            return $input;
        }
        $parts = parse_url($input);
        if (! is_array($parts)) {
            return $input;
        }
        $scheme = strtolower($parts['scheme'] ?? '');
        $host = strtolower($parts['host'] ?? '');
        $path = $parts['path'] ?? '';
        $fragment = $parts['fragment'] ?? '';
        if (! in_array($scheme, ['http', 'https'], true) || $host !== 'web.stremio.com' || ($path !== '' && $path !== '/')) {
            return $input;
        }
        if (! str_starts_with($fragment, '/addons?')) {
            return $input;
        }
        $queryStr = substr($fragment, strlen('/addons?'));
        parse_str($queryStr, $queryParams);
        $addon = is_string($queryParams['addon'] ?? null) ? trim($queryParams['addon']) : '';
        if ($addon === '') {
            return $input;
        }

        return $addon;
    }
}
