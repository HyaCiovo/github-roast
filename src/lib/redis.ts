/**
 * Upstash Redis cache + rate limiting.
 *
 * Both are optional: if the env vars are absent (e.g. local dev), caching and
 * rate limiting silently no-op so the app still runs. Caching scan results by
 * username is the primary cost lever — popular accounts get scanned repeatedly
 * when a report is shared, and a cache hit avoids both GitHub API calls and an
 * LLM call.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { ScanResult } from "./types";

let redis: Redis | null = null;
let scanLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

const SCAN_TTL_SECONDS = 60 * 60 * 24; // 24h
const scanKey = (username: string) => `scan:${username.toLowerCase()}`;
const lockKey = (username: string) => `lock:scan:${username.toLowerCase()}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getCachedScan(username: string): Promise<ScanResult | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.get<ScanResult>(scanKey(username))) ?? null;
  } catch {
    return null;
  }
}

export async function setCachedScan(username: string, scan: ScanResult): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(scanKey(username), scan, { ex: SCAN_TTL_SECONDS });
  } catch {
    // best-effort cache; ignore failures
  }
}

/**
 * Single-flight a cold scan: when many requests hit the same username at once
 * (cache cold), only the first one calls GitHub; the rest wait for its result
 * via the cache. Prevents a thundering herd from burning the rate limit on
 * identical work. Falls back to producing directly when Redis is unconfigured
 * or the waiter times out.
 */
export async function coalesceScan(
  username: string,
  producer: () => Promise<ScanResult>,
): Promise<ScanResult> {
  const r = getRedis();
  if (!r) return producer();

  // Re-check cache (a producer may have just finished).
  const cached = await getCachedScan(username);
  if (cached) return cached;

  const key = lockKey(username);
  let acquired = false;
  try {
    acquired = (await r.set(key, "1", { nx: true, ex: 30 })) === "OK";
  } catch {
    return producer(); // Redis hiccup — don't block the scan.
  }

  if (acquired) {
    try {
      const result = await producer();
      await setCachedScan(username, result);
      return result;
    } finally {
      await r.del(key).catch(() => {});
    }
  }

  // Another request is producing — poll the cache for up to ~10s.
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const c = await getCachedScan(username);
    if (c) return c;
    const stillLocked = await r.get(key).catch(() => null);
    if (!stillLocked) break; // producer finished (possibly errored) — stop waiting
  }
  return producer(); // fallback: produce ourselves rather than starve.
}

/** Per-IP sliding-window limiter for scans. No-ops when Redis is unconfigured. */
export async function checkRateLimit(ip: string): Promise<{ success: boolean }> {
  const r = getRedis();
  if (!r) return { success: true };
  if (!scanLimiter) {
    scanLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      prefix: "rl:scan",
      analytics: false,
    });
  }
  try {
    const { success } = await scanLimiter.limit(ip);
    return { success };
  } catch {
    return { success: true };
  }
}
