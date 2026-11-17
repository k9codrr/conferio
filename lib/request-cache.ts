// Small in-process TTL caches for data that is read on almost every request (session,
// team roles, module access). The database is far from the app server, so each query
// costs a full network round trip; caching these for a few seconds removes 3-8 round
// trips from every API call and page navigation.
//
// Stored on globalThis so dev-mode hot reloads don't drop them. Writes that change the
// cached data call the invalidate helpers below; everything else expires on its own.

type Entry<T> = { at: number; value: T };

class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();
  constructor(private ttlMs: number, private max = 5000) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() - e.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T) {
    if (this.map.size >= this.max) this.map.clear();
    this.map.set(key, { at: Date.now(), value });
  }

  // Concurrent callers for the same key share one load.
  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = load()
      .then((v) => {
        this.set(key, v);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  delete(key: string) {
    this.map.delete(key);
  }

  deleteWhere(pred: (key: string, value: T) => boolean) {
    Array.from(this.map.entries()).forEach(([k, e]) => {
      if (pred(k, e.value)) this.map.delete(k);
    });
  }

  clear() {
    this.map.clear();
  }
}

type Caches = {
  sessions: TtlCache<unknown>;
  roles: TtlCache<unknown>;
  access: TtlCache<unknown>;
};

const g = globalThis as unknown as { __conferioCaches?: Caches };

export const caches: Caches =
  g.__conferioCaches ??
  (g.__conferioCaches = {
    sessions: new TtlCache(15_000), // sessionToken -> { session, user } | null
    roles: new TtlCache(15_000), // userId -> team roles
    access: new TtlCache(15_000), // `${userId}|${slug}` -> AccessResult
  });

export type { TtlCache };

/** Drop everything cached for one user (sign-out, suspension, admin flag, membership change). */
export function invalidateUser(userId: string) {
  caches.sessions.deleteWhere((_k, v) => (v as { user?: { id?: string } } | null)?.user?.id === userId);
  caches.roles.delete(userId);
  caches.access.deleteWhere((k) => k.startsWith(`${userId}|`));
}

/** Plans, workspace settings or global module switches changed: recompute access for everyone. */
export function invalidateAccess() {
  caches.access.clear();
  // Tell every open tab to re-read its module access (sidebar / gates update live).
  import('@/lib/sse')
    .then(({ publish }) => publish('platform:access', { at: Date.now() }))
    .catch(() => {});
}
