import { useAvatarUrl } from '@/lib/avatar';

/** Gradient ring + photo (signed URL from the private bucket) or the first letter of the name. */
export default function ShellAvatar({ name, path, size }: { name?: string | null; path?: string | null; size?: number }) {
  const url = useAvatarUrl(path);
  const initial = (name ?? 'Δ').trim().slice(0, 1).toUpperCase() || 'Δ';
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className="shell-avatar" style={style}>
      <span aria-hidden="true" style={size && size > 60 ? { fontSize: Math.round(size * 0.3) } : undefined}>
        {url ? <img src={url} alt="" /> : initial}
      </span>
    </span>
  );
}
