import { cn } from '@/lib/utils';
import { avatarTint, initials, type MailAddress } from './lib';

export function MailAvatar({ address, className }: { address?: MailAddress; className?: string }) {
  const seed = address?.email || address?.name || '?';
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: avatarTint(seed) }}
      aria-hidden
    >
      {initials(address)}
    </div>
  );
}
