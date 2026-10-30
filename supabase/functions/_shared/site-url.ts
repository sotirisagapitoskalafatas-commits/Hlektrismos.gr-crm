// The CRM address that e-mailed Auth links (invitation, password recovery) must open.
// There is deliberately NO default: hlektrismos.gr is the public WordPress site, not the CRM, so a missing or wrong value
// must stop the e-mail from being sent rather than send people to the wrong site.
// Accepts only a bare https origin (no path, query, fragment, credentials or port), e.g. https://hlektrismos-crm.vercel.app

export function crmSiteUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v)) return null;
  const host = v.slice("https://".length).toLowerCase();
  // never the public website, whatever it is spelled like
  if (host === "hlektrismos.gr" || host === "www.hlektrismos.gr") return null;
  return v;
}
