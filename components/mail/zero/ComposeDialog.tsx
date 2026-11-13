'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { X } from './icons';
import { SendButton } from './ThreadView';
import { postAction, toHtmlBody } from './lib';

export interface ComposeDraft {
  to?: string[];
  subject?: string;
  body?: string;
}

interface ComposeDialogProps {
  open: boolean;
  draft?: ComposeDraft | null;
  onClose: () => void;
  onSent: () => void;
}

export function ComposeDialog({ open, draft, onClose, onSent }: ComposeDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="compose-backdrop"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/20 dark:bg-black/40"
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-0 z-[61] flex items-center justify-center p-4">
            <motion.div
              key="compose-panel"
              role="dialog"
              aria-modal="true"
              aria-label="New email"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="pointer-events-auto flex h-[600px] max-h-[92vh] w-[750px] max-w-[96vw] flex-col overflow-hidden rounded-2xl border border-[#E7E7E7] bg-[#FAFAFA] shadow-2xl dark:border-[#252525] dark:bg-[#141414]"
            >
              <Composer draft={draft} onClose={onClose} onSent={onSent} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function Composer({ draft, onClose, onSent }: { draft?: ComposeDraft | null; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState<string[]>(draft?.to ?? []);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    if (!to.length) return setError('Add at least one recipient');
    if (!subject.trim()) return setError('Add a subject');
    if (!body.trim()) return setError('Write a message first');
    setSending(true);
    setError(null);
    try {
      const payload = {
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        emailBody: toHtmlBody(body),
      };
      await postAction({ action: 'send', ...payload });
      toast.success('Email sent');
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void send();
        }
      }}
    >
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg bg-[#F0F0F0] px-2 py-1 transition-colors hover:bg-gray-200 dark:bg-[#1A1A1A] dark:hover:bg-[#404040]"
        >
          <X className="mt-0.5 h-3.5 w-3.5 fill-[#6D6D6D] dark:fill-[#929292]" />
          <span className="text-sm font-medium text-[#6D6D6D] dark:text-white">Esc</span>
        </button>
        <span className="text-sm font-medium text-[#8C8C8C]">New email</span>
      </div>

      <div className="mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E7E7E7] dark:border-[#252525] dark:bg-[#1A1A1A]">
        {/* Recipients */}
        <div className="shrink-0 border-b border-[#E7E7E7] pb-2 dark:border-[#252525]">
          <div className="flex items-start justify-between gap-2 px-3 pt-3">
            <RecipientField label="To" values={to} onChange={setTo} autoFocus={!draft?.to?.length} />
            <div className="flex shrink-0 gap-1 pt-0.5">
              {!showCc && <FieldToggle onClick={() => setShowCc(true)}>Cc</FieldToggle>}
              {!showBcc && <FieldToggle onClick={() => setShowBcc(true)}>Bcc</FieldToggle>}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {(showCc || showBcc) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-col gap-2 overflow-hidden pt-2"
              >
                {showCc && (
                  <div className="px-3">
                    <RecipientField label="Cc" values={cc} onChange={setCc} autoFocus />
                  </div>
                )}
                {showBcc && (
                  <div className="px-3">
                    <RecipientField label="Bcc" values={bcc} onChange={setBcc} autoFocus={!showCc} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Subject */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[#E7E7E7] p-3 dark:border-[#252525]">
          <p className="text-sm font-medium text-[#8C8C8C]">Subject:</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="h-5 w-full bg-transparent text-sm text-black outline-none placeholder:text-[#797979] dark:text-white/90"
          />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FFFFFF] px-3 py-3 dark:bg-[#202020]">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus={!!draft?.to?.length}
            placeholder="Start writing your email here"
            className="h-full min-h-[200px] w-full resize-none bg-transparent text-sm leading-relaxed text-black outline-none placeholder:text-[#797979] dark:text-white/90"
          />
        </div>

        {error && (
          <div className="bg-[#FDE4E9] px-3 py-1.5 text-xs text-[#F43F5E] dark:bg-[#411D23]">{error}</div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 bg-[#FFFFFF] px-3 py-3 dark:bg-[#202020]">
          <div className="flex items-center gap-2">
            <SendButton onClick={send} sending={sending} />
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[#8C8C8C] transition-colors hover:text-black dark:hover:text-white">
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldToggle({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm px-1 py-0.5 text-sm font-medium text-[#8C8C8C] transition-colors hover:bg-gray-50 hover:text-[#A8A8A8] dark:hover:bg-[#404040]"
    >
      {children}
    </button>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function RecipientField({
  label,
  values,
  onChange,
  autoFocus,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (EMAIL_RE.test(p) && !next.includes(p)) next.push(p);
    onChange(next);
    setInput('');
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onClick={() => ref.current?.focus()}>
      <p className="text-sm font-medium text-[#8C8C8C]">{label}:</p>
      {values.map((v) => (
        <motion.span
          key={v}
          layout
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1 rounded-full border border-[#E7E7E7] px-2 py-0.5 text-sm text-black dark:border-[#2B2B2B] dark:text-white/90"
        >
          {v}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(values.filter((x) => x !== v));
            }}
            className="rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-2.5 w-2.5 fill-[#9A9A9A]" />
          </button>
        </motion.span>
      ))}
      <input
        ref={ref}
        value={input}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;\s]$/.test(v)) commit(v);
          else setInput(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit(input);
          } else if (e.key === 'Backspace' && !input && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => commit(input)}
        placeholder={values.length ? '' : 'Enter email'}
        className="h-6 min-w-[120px] flex-1 bg-transparent text-sm text-black outline-none placeholder:text-[#797979] dark:text-white/90"
      />
    </div>
  );
}
