/** Pull a tag out of a scanned QR, a deep link, or a wedge-scanner string. */
export function parseScan(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 200) return null;

  const fromPath = tagFromPath(value);
  if (fromPath) return fromPath;

  try {
    const url = new URL(value);
    const tag = tagFromPath(url.pathname);
    if (tag) return tag;
    return null;
  } catch {
    // Not a URL. A tag may contain letters, numbers, and simple separators.
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) return null;
  return value;
}

function tagFromPath(pathname: string): string | null {
  const match = pathname.match(/\/a\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    const tag = decodeURIComponent(match[1]).trim();
    if (!tag || tag.length > 64) return null;
    return tag;
  } catch {
    return null;
  }
}

export function assetHref(tagId: string): string {
  return `/a/${encodeURIComponent(tagId)}`;
}

export function absoluteAssetUrl(origin: string, tagId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${assetHref(tagId)}`;
}
