import { logServerFailure } from "./serverLog";
import axios, { AxiosRequestConfig } from "axios";
import { query, queryOne, ensurePostgresSchema } from "./postgres";

// Mapeador de Promise em andamento: Se múltiplas requisições simultâneas pedirem a mesma URL/corpo, apenas 1 chamada HTTP é disparada
const inFlightRequests = new Map<string, Promise<unknown>>();

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 600;

async function throttle() {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
}

interface FetchOptions {
  ttlSeconds?: number;
  forceRefresh?: boolean;
}

/**
 * Centralizador de requisições externas com:
 * 1. Cache persistente em PostgreSQL (sem polling, busca direta sob demanda)
 * 2. Deduplicação em voo (in-flight deduplication)
 * 3. Rate-limiter de segurança para evitar 429
 * 4. Fallback resiliente usando cache do banco
 */
export async function centralizedFetch<T>(
  url: string,
  config?: AxiosRequestConfig,
  options: FetchOptions = {}
): Promise<T> {
  await ensurePostgresSchema();
  const { ttlSeconds = 86400, forceRefresh = false } = options;
  const postDataStr = config?.data ? JSON.stringify(config.data) : "";
  const cacheKey = `${url}:${postDataStr}`;

  // 1. Verificação reativa direta no PostgreSQL
  if (!forceRefresh) {
    try {
      const row = await queryOne<{ data: string; expires_at: string | number }>(
        "SELECT data, expires_at FROM api_cache WHERE key = $1",
        [cacheKey]
      );

      if (row && Date.now() < Number(row.expires_at)) {
        return JSON.parse(row.data) as T;
      }
    } catch (err) {
      logServerFailure("catalog", err, "external-cache-read");
    }
  }

  // 2. Se a mesma requisição já estiver em voo, reutiliza a Promise (deduplicação)
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  // 3. Execução sob demanda
  const executePromise = (async () => {
    try {
      await throttle();

      let attempts = 0;
      const maxAttempts = 3;
      let lastErr: unknown;

      while (attempts < maxAttempts) {
        try {
          attempts++;
          const response = await axios({
            url,
            timeout: 10000,
            headers: {
              "User-Agent":
                "Animeflix/1.0 (Mozilla/5.0 Windows NT 10.0; Win64; x64) Chrome/120.0",
            },
            ...config,
          });

          // Salva no PostgreSQL
          try {
            const now = Date.now();
            const expires = now + ttlSeconds * 1000;
            await query(
              `INSERT INTO api_cache (key, data, created_at, expires_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT(key) DO UPDATE SET
                 data = EXCLUDED.data,
                 created_at = EXCLUDED.created_at,
                 expires_at = EXCLUDED.expires_at`,
              [cacheKey, JSON.stringify(response.data), now, expires]
            );
          } catch (dbErr) {
            logServerFailure("catalog", dbErr, "external-cache-write");
          }

          return response.data as T;
        } catch (err: unknown) {
          lastErr = err;
          if (axios.isAxiosError(err)) {
            const status = err.response?.status;
            if (status === 429 || status === 504 || status === 503) {
              const backoff = attempts * 1500;
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
          }
          break;
        }
      }

      // Se a chamada de rede falhar, busca cache expirado de forma reativa
      try {
        const row = await queryOne<{ data: string }>(
          "SELECT data FROM api_cache WHERE key = $1",
          [cacheKey]
        );
        if (row) {
          console.warn("[Centralizer] API externa indisponível; retornando cache canônico.");
          return JSON.parse(row.data) as T;
        }
      } catch {}

      throw lastErr;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, executePromise);
  return executePromise;
}
