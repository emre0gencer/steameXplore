// Per-host serialized request queue with a minimum gap between consecutive runs
// AND a host-wide circuit breaker. Prevents bursts that trip Steam's edge throttle
// (rwgrsn:-2 / 401 / 429), and — once tripped — stops every subsequent queued task
// from hitting the throttled host until the cooldown elapses.
//
// Usage:
//   const res = await withHostQueue('steamcommunity.com', 1500, () => fetch(url, opts));
//   if (res.status === 429) markHostThrottled('steamcommunity.com', 120_000);
//
// All callers naming the same host share one queue; tasks run sequentially with
// at least `minGapMs` between the start of one task and the start of the next.

import { CooldownError } from './errors';

interface HostQueue {
  chain: Promise<unknown>;
  lastRun: number;
}

const queues = new Map<string, HostQueue>();
const throttledUntil = new Map<string, number>();

// Returns remaining cooldown in seconds, or null if not throttled.
export function isHostThrottled(host: string): number | null {
  const until = throttledUntil.get(host);
  if (until === undefined) return null;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    throttledUntil.delete(host);
    return null;
  }
  return Math.ceil(remaining / 1000);
}

// Open the circuit for `cooldownMs`. Subsequent withHostQueue calls short-circuit
// with a CooldownError until the timer expires.
export function markHostThrottled(host: string, cooldownMs: number): void {
  const newUntil = Date.now() + cooldownMs;
  const existing = throttledUntil.get(host) ?? 0;
  // Don't shorten an existing longer cooldown.
  if (newUntil > existing) throttledUntil.set(host, newUntil);
}

export async function withHostQueue<T>(
  host: string,
  minGapMs: number,
  fn: () => Promise<T>
): Promise<T> {
  // Fast-fail before queuing if the circuit is open.
  const wait = isHostThrottled(host);
  if (wait !== null) {
    throw new CooldownError(wait, `Host ${host} is throttled — backing off ${wait}s`);
  }

  let q = queues.get(host);
  if (!q) {
    q = { chain: Promise.resolve(), lastRun: 0 };
    queues.set(host, q);
  }
  const captured = q;

  const run = async (): Promise<T> => {
    // Re-check at the head of the queue: a prior task in this batch may have
    // tripped the breaker while we were waiting our turn.
    const waitAtRun = isHostThrottled(host);
    if (waitAtRun !== null) {
      throw new CooldownError(waitAtRun, `Host ${host} is throttled — backing off ${waitAtRun}s`);
    }
    const gapWait = minGapMs - (Date.now() - captured.lastRun);
    if (gapWait > 0) await new Promise((r) => setTimeout(r, gapWait));
    captured.lastRun = Date.now();
    return fn();
  };

  // Chain regardless of prior success/failure so one error doesn't break the queue.
  const next = captured.chain.then(run, run);
  captured.chain = next.catch(() => undefined);
  return next;
}
