// Reusable, email-client-safe building blocks for the Hlektrismos / ATLAS CRM emails: table layout, inline CSS only, no script, no stylesheet link,
// no external image (there is no approved logo URL, so the brand is a text wordmark). Every function returns a string.
export const BRAND = { name: 'HLEKTRISMOS', product: 'ATLAS CRM', tagline: 'Ασφαλής διαχείριση επαγγελματικών δεδομένων.' };
const C = { navy: '#0b1f3a', blue: '#0066cc', bg: '#f3f6fb', card: '#ffffff', line: '#dfe6f1', text: '#243247', muted: '#64748b', warnBg: '#fff7e6', warnLine: '#f0c36d', warnText: '#7a4b00' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Plain text of a template string with the Go-template placeholders kept exactly as written. */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const header = () => `<tr><td style="background:${C.navy};padding:22px 32px;border-radius:16px 16px 0 0;">
<div style="font-family:${FONT};font-size:12px;letter-spacing:3px;color:#9db7e0;font-weight:600;">${BRAND.name}</div>
<div style="font-family:${FONT};font-size:22px;color:#ffffff;font-weight:700;margin-top:2px;">${BRAND.product}</div>
</td></tr>`;

export const footer = () => `<tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
<strong style="color:${C.navy};">${BRAND.name}</strong><br>${BRAND.product}<br>${BRAND.tagline}
</td></tr>`;

export const heading = (t) => `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:28px;color:${C.navy};font-weight:700;">${t}</h1>`;
export const paragraph = (t) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.text};">${t}</p>`;

/** The one primary action. `url` is used as given (a Supabase template variable such as {{ .ConfirmationURL }}), never rebuilt. */
export const button = (url, label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>
<td align="center" bgcolor="${C.blue}" style="border-radius:10px;"><a href="${url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background:${C.blue};">${label}</a></td>
</tr></table>`;

/** Label / value rows in a soft card. */
export const details = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${C.bg};border:1px solid ${C.line};border-radius:12px;">${
  rows.map(([k, v]) => `<tr><td style="padding:12px 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${k}<br><strong style="font-size:16px;color:${C.navy};word-break:break-all;">${v}</strong></td></tr>`).join('')}</table>`;

/** A large one-time code. */
export const code = (v) => `<div style="margin:4px 0 20px;padding:16px;text-align:center;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:30px;letter-spacing:8px;font-weight:700;color:${C.navy};background:${C.bg};border:1px solid ${C.line};border-radius:12px;">${v}</div>`;

export const notice = (t) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;background:${C.warnBg};border:1px solid ${C.warnLine};border-radius:12px;"><tr><td style="padding:12px 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.warnText};"><strong>Ασφάλεια:</strong> ${t}</td></tr></table>`;

/** The full document. `preheader` is the hidden preview line. */
export function layout({ title, preheader, body }) {
  return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border-radius:16px;box-shadow:0 6px 24px rgba(11,31,58,.10);">
${header()}
<tr><td style="padding:30px 32px 8px;">
${body}
</td></tr>
${footer()}
</table>
</td></tr></table>
</body>
</html>
`;
}
