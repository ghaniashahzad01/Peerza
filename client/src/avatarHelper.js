/**
 * Resolves avatar URLs to full accessible URLs and generates fallback initials.
 */
export function getAvatarUrl(avatar) {
  if (!avatar || typeof avatar !== 'string') return null;
  const trimmed = avatar.trim();
  if (!trimmed) return null;

  // Blob previews or absolute external URLs
  if (/^(blob:|data:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  // Prepend backend origin if relative path
  const backendOrigin = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : 'http://localhost:5000';

  if (trimmed.startsWith('/')) {
    return `${backendOrigin}${trimmed}`;
  }
  return `${backendOrigin}/${trimmed}`;
}

export function getInitials(name = '') {
  if (!name || typeof name !== 'string') return 'PZ';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PZ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
