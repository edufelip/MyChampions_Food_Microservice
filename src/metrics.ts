/**
 * Minimal in-process counter registry for operational visibility.
 * Counters reset on process restart.
 */
const counters = new Map<string, number>();

export function incrementCounter(name: string, delta = 1): void {
  const current = counters.get(name) ?? 0;
  counters.set(name, current + delta);
}

export function getCounter(name: string): number {
  return counters.get(name) ?? 0;
}

export function getAllCounters(): Record<string, number> {
  const entries = [...counters.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return Object.fromEntries(entries);
}

export function resetCounters(): void {
  counters.clear();
}
