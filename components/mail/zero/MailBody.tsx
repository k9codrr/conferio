'use client';

import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useTheme } from 'next-themes';

/**
 * Renders an email body the way the Zero mail client does: sanitised HTML inside a
 * shadow root, so the email's own CSS can't leak into the app (and vice versa).
 * Rich HTML emails (their own backgrounds/colours) sit on a light "paper" card in dark
 * mode so they stay readable; plain emails inherit the app text colour.
 */
export function MailBody({ html, plain }: { html: string; plain?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<ShadowRoot | null>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const { clean, rich } = useMemo(() => {
    const source = html?.trim()
      ? html
      : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${(plain || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`;
    const sanitized =
      typeof window === 'undefined'
        ? ''
        : DOMPurify.sanitize(source, {
            WHOLE_DOCUMENT: false,
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick'],
          });
    const isRich = /<table|bgcolor=|background(-color)?\s*:|color\s*:\s*#/i.test(sanitized);
    return { clean: sanitized, rich: isRich };
  }, [html, plain]);

  useEffect(() => {
    if (!hostRef.current) return;
    if (!rootRef.current) rootRef.current = hostRef.current.attachShadow({ mode: 'open' });
    const root = rootRef.current;
    const paper = dark && rich;
    root.innerHTML = `
      <style>
        :host { display:block; }
        .mail { font-family: inherit; font-size: 14px; line-height: 1.6; word-break: break-word;
          color: ${paper ? '#111' : dark ? '#E5E5E5' : '#111'};
          ${paper ? 'background:#fff;border-radius:12px;padding:16px;' : ''} overflow-x:auto; }
        .mail img { max-width: 100%; height: auto; }
        .mail a { color: #006FFE; }
        .mail table { max-width: 100%; }
        .mail blockquote { border-left: 2px solid ${dark && !paper ? '#3F3F46' : '#E4E4E7'}; margin: 8px 0; padding-left: 12px; color: #8C8C8C; }
      </style>
      <div class="mail">${clean}</div>`;
    // open links in a new tab, never inside the app
    root.querySelectorAll('a[href]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [clean, rich, dark]);

  return <div ref={hostRef} className="w-full" />;
}
