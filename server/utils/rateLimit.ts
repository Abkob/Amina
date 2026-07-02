import type { Request, Response, NextFunction } from 'express';

interface WindowState {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowState>();

/**
 * Simple sliding-window in-memory rate limiter.
 * @param maxPerWindow  Max requests allowed in windowMs
 * @param windowMs      Window duration in milliseconds
 * @param key           Identifies the rate limit bucket (e.g. 'ai-chat')
 */
export function rateLimit(maxPerWindow: number, windowMs: number, key: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const state = windows.get(key);
    if (!state || now >= state.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    state.count++;
    if (state.count > maxPerWindow) {
      const retryAfter = Math.ceil((state.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests',
        retry_after_seconds: retryAfter,
      });
    }
    next();
  };
}
