// Page-view / screen-time tracking → RouteViewSession rows.
// Feeds the admin "Live activity", module page-view stats and team screen-time
// analytics. One open session per tab; heartbeats every 30 s keep it "online".
import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

const MIN_TRACK_MS = 3000;
const HEARTBEAT_MS = 30_000;
const EXCLUDED = ['/auth', '/login', '/register', '/api', '/_next', '/404', '/500', '/public', '/share', '/clipShare', '/invite', '/invitations', '/redirecting'];

function teamSlugFrom(query: Record<string, any>): string | undefined {
  const s = query.slug ?? query.teamSlug;
  return typeof s === 'string' ? s : undefined;
}

export function useScreenTime() {
  const router = useRouter();
  const { status } = useSession();
  const sessionId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const beat = useRef<ReturnType<typeof setInterval> | null>(null);

  const shouldTrack = (path: string) => !EXCLUDED.some((p) => path === p || path.startsWith(p + '/'));

  const end = useCallback((useBeacon = false) => {
    const id = sessionId.current;
    if (beat.current) clearInterval(beat.current);
    beat.current = null;
    sessionId.current = null;
    if (!id) return;
    const short = Date.now() - startedAt.current < MIN_TRACK_MS;
    const body = JSON.stringify({ sessionId: id, discard: short });
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/screen-time/end', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/screen-time/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  }, []);

  const start = useCallback(async () => {
    if (status !== 'authenticated' || document.hidden) return;
    const route = router.pathname;
    if (!route || !shouldTrack(route)) return;
    end();
    const startedFor = router.asPath;
    try {
      const res = await fetch('/api/screen-time/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, path: router.asPath.split('?')[0], teamSlug: teamSlugFrom(router.query) }),
      });
      if (!res.ok) return;
      const { sessionId: id } = await res.json();
      if (router.asPath !== startedFor) {
        // navigated away while the request was in flight
        sessionId.current = id;
        end();
        return;
      }
      sessionId.current = id;
      startedAt.current = Date.now();
      beat.current = setInterval(() => {
        if (!sessionId.current || document.hidden) return;
        fetch('/api/screen-time/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId.current }),
        }).then((r) => { if (r.status === 404) start(); }).catch(() => {});
      }, HEARTBEAT_MS);
    } catch {
      /* tracking is best-effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router.pathname, router.asPath, end]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    start();
    const onVisibility = () => (document.hidden ? end() : start());
    const onUnload = () => end(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
      end();
    };
  }, [status, router.pathname, start, end]);
}
