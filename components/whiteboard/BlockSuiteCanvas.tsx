'use client'

// Whiteboard room with realtime collaboration.
//  • Edits stream between everyone in the room (Yjs updates over /api/rooms/:id/sync + SSE)
//  • Joiners pull live state from peers, so nothing is lost before the 5s autosave
//  • Presence avatars, room chat, and role-based access (manage / edit / view)
//  • Access changes apply live (editors become view-only instantly, removed users are locked out)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Eye, Lock, MessageSquare, Pencil, Send, Shield, Users, X } from 'lucide-react'
import LazyLoader from '../loader/lazyloader'
import { useSSE } from 'hooks/useSSE'
import { cn } from '@/lib/utils'

interface Props {
  roomId: string
}

type Access = 'manage' | 'edit' | 'view' | 'none'
interface Peer { userId: string; clientId: string; name: string; image?: string | null; color: string; access: string; lastSeen?: number }
interface ChatMsg { id: string; userId: string; name: string; color: string; text: string; at: number }
interface WbHandle {
  (): void
  applyRemoteUpdate?: (b64: string) => void
  getState?: () => string
  setReadonly?: (ro: boolean) => void
  saveNow?: () => void
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.type = 'module'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

const initials = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default function BlockSuiteCanvas({ roomId }: Props) {
  const { data: session } = useSession()
  const myUserId = (session?.user as any)?.id as string | undefined
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<WbHandle | null>(null)
  const clientId = useMemo(() => Math.random().toString(36).slice(2) + Date.now().toString(36), [])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [access, setAccess] = useState<Access>('view')
  const accessRef = useRef<Access>('view')
  const [peers, setPeers] = useState<Record<string, Peer>>({})
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [accessOpen, setAccessOpen] = useState(false)

  // Collect peer states while joining
  const peerWaiter = useRef<{ states: string[]; done: (() => void) | null } | null>(null)

  const post = useCallback(
    (body: Record<string, any>, keepalive = false) =>
      fetch(`/api/rooms/${roomId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, ...body }),
        keepalive,
      }),
    [roomId, clientId]
  )

  // ── Outgoing edits: batch every 60 ms ────────────────────────────────────
  const outbox = useRef<string[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useCallback(() => {
    flushTimer.current = null
    if (!outbox.current.length) return
    const updates = outbox.current.splice(0)
    post({ kind: 'update', updates }).then((r) => {
      if (r.status === 403) applyAccess('view')
    }).catch(() => {
      // network blip: re-queue so collaborators still get the edit
      outbox.current.unshift(...updates)
      if (!flushTimer.current) flushTimer.current = setTimeout(flush, 1000)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post])
  const queueUpdate = useCallback((b64: string) => {
    if (accessRef.current !== 'edit' && accessRef.current !== 'manage') return
    outbox.current.push(b64)
    if (!flushTimer.current) flushTimer.current = setTimeout(flush, 60)
  }, [flush])

  const applyAccess = useCallback((a: Access) => {
    accessRef.current = a
    setAccess(a)
    if (a === 'none') {
      setStatus('denied')
      return
    }
    handleRef.current?.setReadonly?.(a === 'view')
  }, [])

  // ── Init editor ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user || !containerRef.current) return
    let cancelled = false

    const init = async () => {
      try {
        setStatus('loading')
        const tokenRes = await fetch(`/api/rooms/${roomId}/token`)
        if (tokenRes.status === 403) {
          setStatus('denied')
          return
        }
        if (!tokenRes.ok) throw new Error('Failed to get token')
        const { token, access: a } = await tokenRes.json()
        const myAccess: Access = a || 'edit'
        accessRef.current = myAccess
        setAccess(myAccess)

        // Join info: who's here + recent chat
        fetch(`/api/rooms/${roomId}/sync`).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (!d || cancelled) return
          setPeers(Object.fromEntries((d.participants as Peer[]).filter((p) => p.clientId !== clientId).map((p) => [p.clientId, p])))
          setChat(d.chat ?? [])
        }).catch(() => {})

        await loadScript('/whiteboard/conferio-whiteboard.js')
        let retries = 50
        while (!(window as any).ConferioWhiteboard && retries > 0) {
          await new Promise((r) => setTimeout(r, 100))
          retries--
        }
        const { initWhiteboard } = (window as any).ConferioWhiteboard ?? {}
        if (!initWhiteboard) throw new Error('Whiteboard library not loaded')
        if (cancelled) return

        const handle: WbHandle = await initWhiteboard({
          container: containerRef.current!,
          boardId: roomId,
          token,
          theme: 'dark',
          readonly: myAccess === 'view',
          apiUrl: process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
          onLoad: async () => {
            try {
              const res = await fetch(`/api/rooms/${roomId}/snapshot`)
              if (!res.ok) return null
              return (await res.json()).snapshot
            } catch {
              return null
            }
          },
          // Ask anyone already in the room for their live state (covers edits
          // made in the last few seconds that aren't in the saved snapshot yet).
          waitForPeers: () =>
            new Promise<string[]>((resolve) => {
              const waiter = { states: [] as string[], done: null as (() => void) | null }
              peerWaiter.current = waiter
              const finish = () => {
                peerWaiter.current = null
                resolve(waiter.states)
              }
              waiter.done = () => setTimeout(finish, 250) // allow a few more replies
              post({ kind: 'sync-req' }).catch(() => {})
              setTimeout(finish, 1200)
            }),
          onUpdate: queueUpdate,
          onSave: async (snapshot: string) => {
            if (accessRef.current !== 'edit' && accessRef.current !== 'manage') return
            try {
              await fetch(`/api/rooms/${roomId}/snapshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshot }),
              })
            } catch (e) {
              console.error('[whiteboard] save error:', e)
            }
          },
        })
        if (cancelled) {
          handle()
          return
        }
        handleRef.current = handle
        setStatus('ready')
        post({ kind: 'presence' }).catch(() => {})
      } catch (err: any) {
        console.error('[whiteboard] init error:', err)
        setErrorMsg(err?.message || 'Failed to initialize')
        setStatus('error')
      }
    }

    init()
    const heartbeat = setInterval(() => post({ kind: 'presence' }).catch(() => {}), 15_000)
    const onUnload = () => {
      handleRef.current?.saveNow?.()
      post({ kind: 'leave' }, true).catch(() => {})
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      cancelled = true
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', onUnload)
      if (flushTimer.current) {
        clearTimeout(flushTimer.current)
        flush()
      }
      handleRef.current?.saveNow?.()
      post({ kind: 'leave' }, true).catch(() => {})
      handleRef.current?.()
      handleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUserId])

  // ── Incoming realtime events ─────────────────────────────────────────────
  useSSE((evt) => {
    if (evt.type === 'sse:reconnected') {
      post({ kind: 'sync-req' }).catch(() => {})
      return
    }
    if (evt.type !== 'whiteboard' || evt.roomId !== roomId) return
    const from: Peer | undefined = evt.from
    if (from?.clientId === clientId) return

    switch (evt.kind) {
      case 'update':
        (evt.updates as string[]).forEach((u) => handleRef.current?.applyRemoteUpdate?.(u))
        break
      case 'sync-req':
        if (from) setPeers((p) => ({ ...p, [from.clientId]: from }))
        if (handleRef.current?.getState && (accessRef.current === 'edit' || accessRef.current === 'manage')) {
          post({ kind: 'sync-resp', to: from?.clientId, state: handleRef.current.getState() }).catch(() => {})
        }
        break
      case 'sync-resp':
        if (evt.to !== clientId) break
        if (peerWaiter.current) {
          peerWaiter.current.states.push(evt.state)
          peerWaiter.current.done?.()
        } else {
          handleRef.current?.applyRemoteUpdate?.(evt.state) // late reply / reconnect resync
        }
        break
      case 'presence':
        if (from) setPeers((p) => ({ ...p, [from.clientId]: { ...from, lastSeen: Date.now() } }))
        break
      case 'leave':
        if (from) setPeers((p) => {
          const n = { ...p }
          delete n[from.clientId]
          return n
        })
        break
      case 'chat':
        setChat((c) => [...c.slice(-99), evt.message])
        if (!chatOpen) setUnread((u) => u + 1)
        break
      case 'permissions':
        fetch(`/api/rooms/${roomId}/access`).then((r) => {
          if (r.status === 403) return applyAccess('none')
          return r.json().then((d) => applyAccess(d.access))
        }).catch(() => {})
        break
    }
  })

  // Drop peers that stopped heart-beating
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - 45_000
      setPeers((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => (v.lastSeen ?? Date.now()) > cutoff)))
    }, 15_000)
    return () => clearInterval(t)
  }, [])

  const people = useMemo(() => {
    const byUser = new Map<string, Peer>()
    Object.values(peers).forEach((p) => { if (p.userId !== myUserId) byUser.set(p.userId, p) })
    return Array.from(byUser.values())
  }, [peers, myUserId])

  return (
    <div className="absolute inset-0 z-50 bg-black">
      <div ref={containerRef} className="absolute inset-0">
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            <LazyLoader />
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            <p className="text-red-400">{errorMsg}</p>
          </div>
        )}
        {status === 'denied' && (
          <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-2 bg-black/90">
            <Lock className="size-8 text-zinc-500" />
            <p className="text-zinc-200">You don&apos;t have access to this whiteboard</p>
            <p className="text-sm text-zinc-500">Ask a team owner, admin or the board&apos;s creator for access.</p>
          </div>
        )}
      </div>

      {status === 'ready' && (
        <div className="pointer-events-none absolute right-3 top-3 z-[60] flex items-center gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/90 py-1 pl-1.5 pr-1 shadow-lg backdrop-blur">
            <div className="flex -space-x-2">
              {people.slice(0, 5).map((p) => (
                <div key={p.userId} title={`${p.name} · ${p.access}`}
                  className="flex size-7 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white ring-2 ring-zinc-900"
                  style={{ background: p.color }}>
                  {p.image ? <img src={p.image} alt="" className="size-full object-cover" /> : initials(p.name)}
                </div>
              ))}
              {people.length > 5 && (
                <div className="flex size-7 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-white ring-2 ring-zinc-900">+{people.length - 5}</div>
              )}
            </div>
            <span className="flex items-center gap-1 px-1 text-[11px] text-zinc-400">
              <Users className="size-3" />{people.length + 1} here
            </span>
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              access === 'view' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400')}>
              {access === 'view' ? <><Eye className="size-3" />View only</> : <><Pencil className="size-3" />{access === 'manage' ? 'Can manage' : 'Can edit'}</>}
            </span>
            <button type="button" onClick={() => { setChatOpen((o) => !o); setUnread(0) }}
              className="relative flex size-7 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10" title="Room chat">
              <MessageSquare className="size-4" />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white">{unread}</span>}
            </button>
            {access === 'manage' && (
              <button type="button" onClick={() => setAccessOpen(true)}
                className="flex size-7 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10" title="Who can access">
                <Shield className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {chatOpen && status === 'ready' && (
        <RoomChat roomId={roomId} messages={chat} myUserId={myUserId} onSend={(text) => post({ kind: 'chat', text })}
          onClose={() => setChatOpen(false)} />
      )}
      {accessOpen && <AccessDialog roomId={roomId} onClose={() => setAccessOpen(false)} />}
    </div>
  )
}

// ─── Chat panel ──────────────────────────────────────────────────────────────

function RoomChat({ messages, myUserId, onSend, onClose }: {
  roomId: string; messages: ChatMsg[]; myUserId?: string; onSend: (text: string) => Promise<Response>; onClose: () => void
}) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  const send = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    onSend(t).catch(() => setText(t))
  }
  return (
    <div className="absolute bottom-3 right-3 top-14 z-[60] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-sm font-medium text-zinc-100">Room chat</p>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X className="size-4" /></button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {!messages.length && <p className="pt-8 text-center text-xs text-zinc-500">Say hi to everyone on this board 👋</p>}
        {messages.map((m) => {
          const mine = m.userId === myUserId
          return (
            <div key={m.id} className={cn('flex flex-col', mine && 'items-end')}>
              {!mine && <span className="mb-0.5 text-[10px] font-medium" style={{ color: m.color }}>{m.name}</span>}
              <span className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-xs',
                mine ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-100')}>{m.text}</span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 p-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Message everyone…" className="h-8 flex-1 rounded-md bg-zinc-800 px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500" />
        <button type="button" onClick={send} className="flex size-8 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-500">
          <Send className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Access dialog (owners / admins / room creator) ─────────────────────────

type Level = 'edit' | 'view' | 'none'
interface MemberRow { id: string; name: string | null; email: string; image: string | null; role: string; override: Level | null; effective: Access }

function AccessDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [roles, setRoles] = useState<Record<string, Level>>({})
  const [members, setMembers] = useState<MemberRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/rooms/${roomId}/access`)
    const d = await r.json()
    if (!r.ok) return setError(d.error || 'Failed to load')
    setRoles(d.permissions.roles)
    setMembers(d.members)
  }, [roomId])
  useEffect(() => { load() }, [load])

  const save = async (body: any) => {
    setSaving(true); setError(null)
    try {
      const r = await fetch(`/api/rooms/${roomId}/access`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Save failed')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const Select = ({ value, onChange, allowInherit }: { value: Level | null; onChange: (v: Level | null) => void; allowInherit?: boolean }) => (
    <select value={value ?? ''} disabled={saving} onChange={(e) => onChange((e.target.value || null) as Level | null)}
      className="h-7 rounded-md border border-white/10 bg-zinc-800 px-1.5 text-xs text-zinc-100">
      {allowInherit && <option value="">Role default</option>}
      <option value="edit">Can edit</option>
      <option value="view">View only</option>
      <option value="none">No access</option>
    </select>
  )

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[80vh] w-[480px] max-w-[95vw] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Who can access this whiteboard</p>
            <p className="text-[11px] text-zinc-500">Owners, admins and the creator can always manage. Changes apply live.</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X className="size-4" /></button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">By role</p>
            {(['MANAGER', 'MEMBER', 'INTERN', 'CLIENT'] as const).map((r) => (
              <div key={r} className="flex items-center justify-between">
                <span className="text-xs capitalize text-zinc-300">{r.toLowerCase()}s</span>
                <Select value={roles[r] ?? 'view'} onChange={(v) => v && save({ roles: { [r]: v } })} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">People</p>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-[10px] text-white">
                  {m.image ? <img src={m.image} alt="" className="size-full object-cover" /> : initials(m.name || m.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-zinc-100">{m.name || m.email}</p>
                  <p className="text-[10px] text-zinc-500">{m.role.toLowerCase()} · {m.effective}</p>
                </div>
                {m.effective === 'manage' ? (
                  <span className="text-[11px] text-zinc-500">Manages</span>
                ) : (
                  <Select allowInherit value={m.override} onChange={(v) => save({ users: { [m.id]: v } })} />
                )}
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
