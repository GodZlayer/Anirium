<?php

namespace App\Support;

class IpNetworkFingerprint
{
    /**
     * Normalizes a client IP into a stable network fingerprint:
     * - IPv6 addresses are masked to their /64 prefix so privacy/SLAAC interface
     *   rotations on the same device/router still map to the same IPv6 subnet.
     * - IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) are normalized to IPv4.
     * - IPv4 addresses are normalized as ipv4:<ip>.
     */
    public static function fromIp(?string $ip): ?string
    {
        $raw = trim((string) $ip);
        if ($raw === '') {
            return null;
        }

        $packed = @inet_pton($raw);
        if ($packed === false) {
            return null;
        }

        if (strlen($packed) === 16) {
            // Check for IPv4-mapped IPv6 (::ffff:0:0/96)
            if (substr($packed, 0, 12) === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff") {
                $ipv4 = @inet_ntop(substr($packed, 12, 4));

                return $ipv4 !== false ? 'ipv4:'.$ipv4 : null;
            }

            // Mask IPv6 to /64 prefix (keep first 8 bytes, zero last 8 bytes)
            $prefix = substr($packed, 0, 8).str_repeat("\x00", 8);
            $normalized = @inet_ntop($prefix);

            return $normalized !== false ? 'ipv6:'.$normalized.'/64' : null;
        }

        $ipv4 = @inet_ntop($packed);

        return $ipv4 !== false ? 'ipv4:'.$ipv4 : null;
    }

    public static function isIpv6(?string $ip): bool
    {
        $fingerprint = self::fromIp($ip);

        return $fingerprint !== null && str_starts_with($fingerprint, 'ipv6:');
    }
}
