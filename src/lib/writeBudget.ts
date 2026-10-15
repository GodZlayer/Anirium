import { queryOne } from "./postgres";

const limits: Record<string, number> = Object.freeze({ save_progress: 120, save_entity_status: 30, add_comment: 10, update_profile: 30, toggle_bookmark: 60, toggle_addon: 30, install_manifest: 10, uninstall_addon: 30, register_manifest: 10 });
export class WriteBudgetExceeded extends Error {
  constructor(public readonly retryAfter: number) { super("write_rate_limited"); }
}

export async function purgeExpiredWriteBudgets(limit = 25): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid budget cleanup size");
  const row = await queryOne<{ removed: number }>(`
    WITH expired AS (
      SELECT user_id, action FROM user_write_budget
      WHERE window_start < FLOOR(EXTRACT(EPOCH FROM statement_timestamp()) / 60)::bigint - 1440
      ORDER BY window_start, user_id, action LIMIT $1 FOR UPDATE SKIP LOCKED
    ), removed AS (
      DELETE FROM user_write_budget budget USING expired
      WHERE budget.user_id = expired.user_id AND budget.action = expired.action
      RETURNING 1
    ) SELECT COUNT(*)::integer AS removed FROM removed`, [limit]);
  if (!row) throw new Error("Write budget cleanup unavailable");
  return Number(row.removed);
}

export async function requireUserWriteBudget(owner: string, action: string) {
  if (!owner || !Object.hasOwn(limits, action)) throw new Error("Invalid write budget identity");
  const limit = limits[action];
  // Database clock and unique row serialize reservations across Core instances.
  // Counters saturate; neither forged forwarded headers nor rotating cookies
  // create new buckets for the same authenticated account.
  const row = await queryOne<{ hits: number; retry_after: number }>(`
    INSERT INTO user_write_budget(user_id, action, window_start, hits)
    VALUES ($1, $2, FLOOR(EXTRACT(EPOCH FROM statement_timestamp()) / 60)::bigint, 1)
    ON CONFLICT (user_id, action) DO UPDATE SET
      hits = CASE WHEN EXCLUDED.window_start > user_write_budget.window_start THEN 1
             ELSE LEAST(user_write_budget.hits + 1, $3 + 1) END,
      window_start = GREATEST(user_write_budget.window_start, EXCLUDED.window_start)
    RETURNING hits, GREATEST(1, CEIL((window_start + 1) * 60 - EXTRACT(EPOCH FROM statement_timestamp())))::integer AS retry_after`,
    [owner, action, limit]);
  if (!row) throw new Error("Write budget unavailable");
  if (Number(row.hits) > limit) throw new WriteBudgetExceeded(Number(row.retry_after));
  // Separate autocommit statement: never hold cleanup locks while reserving a
  // different account's bucket. Bounded opportunistic retention, not a timer.
  if (Number(row.hits) === 1) await purgeExpiredWriteBudgets();
}
