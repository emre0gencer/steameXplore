// Shared error types used across services (cache, httpQueue) and routes.

// Thrown when a cached factory recently failed (negative-cache) or the per-host
// circuit breaker is open. Carries the remaining backoff so the HTTP layer can
// emit a proper Retry-After header.
export class CooldownError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message?: string) {
    super(message ?? `Recently failed — backing off ${retryAfterSeconds}s`);
    this.name = 'CooldownError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
