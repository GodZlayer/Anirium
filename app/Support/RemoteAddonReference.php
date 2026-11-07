<?php

namespace App\Support;

class RemoteAddonReference
{
    /** @return array{id: string, kind: string, manifestUrl: string}|null */
    public static function fromUrl(string $input): ?array
    {
        $url = preg_replace('/^stremio:\/\//i', 'https://', trim($input));
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
}
