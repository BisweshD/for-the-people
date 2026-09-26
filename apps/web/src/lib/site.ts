/** The canonical origin for absolute URLs (metadata, share cards). Never indexed without the owner's go-ahead. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3100";
}

export const ELECTION_DAY = "2026-11-03";
