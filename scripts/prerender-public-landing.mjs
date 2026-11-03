/**
 * Build-time HTML prerender for the public Hlektrismos landing page.
 *
 * Uses the real LandingPage React component (not a duplicated HTML template),
 * so headings, service copy, contact details and section structure stay in sync.
 * The snapshot contains public-facing copy only; no database reads or credential
 * values are performed or serialized here.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = process.cwd();
const distDir = resolve(root, 'dist');
const indexPath = resolve(distDir, 'index.html');
const assetsDir = resolve(distDir, 'assets');

const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  mode: 'production',
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { default: LandingPage } = await server.ssrLoadModule('/src/pages/LandingPage.tsx');
  const markup = renderToStaticMarkup(React.createElement(LandingPage));

  const requiredContent = [
    '<main id="top">',
    'id="lp-hero-title"',
    'id="comparison"',
    'id="how-it-works"',
    'id="services"',
    'id="advisor"',
    'id="contact"',
    'ΣΥΓΚΡΙΣΗ ΤΙΜΟΛΟΓΙΩΝ',
    'Ζήτησε να σε καλέσουμε',
    'Πρόσβαση προσωπικού',
  ];
  const missing = requiredContent.filter((marker) => !markup.includes(marker));
  if (missing.length) {
    throw new Error(`Landing page prerender is incomplete. Missing: ${missing.join(', ')}`);
  }
  if (markup.length < 10000) {
    throw new Error(`Landing page prerender is unexpectedly small (${markup.length} characters).`);
  }

  // Keep this HTML output free of server credentials and private integration values.
  const forbidden = [
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /GEMINI_API_KEY/i,
    /RESEND_API_KEY/i,
    /INFOBIP_API_KEY/i,
    /VAPI_API_KEY/i,
    /TWILIO_AUTH_TOKEN/i,
    /sb_secret_[A-Za-z0-9_-]{12,}/i,
    /Bearer\\s+[A-Za-z0-9._-]{30,}/i,
    /sk-[A-Za-z0-9_-]{20,}/i,
  ];
  const exposedMarker = forbidden.find((pattern) => pattern.test(markup));
  if (exposedMarker) {
    throw new Error(`A private credential marker was found in the public landing HTML: ${exposedMarker}`);
  }

  const cssFiles = (await readdir(assetsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'));
  const landingStyles = [];
  for (const file of cssFiles) {
    const css = await readFile(join(assetsDir, file.name), 'utf8');
    if (css.includes('.lp-hero') && css.includes('.lp-contact')) {
      landingStyles.push(`/assets/${file.name}`);
    }
  }
  if (landingStyles.length === 0) {
    throw new Error('Could not find the compiled landing-page stylesheet; refusing to ship unstyled prerendered HTML.');
  }

  const companyStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Hlektrismos.gr',
    legalName: 'HLEKTRISMOS.GR ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε.',
    url: 'https://hlektrismos.gr/',
    telephone: '+30 210 22 55 000',
    email: 'info@hlektrismos.gr',
    description: 'Προσωπική καθοδήγηση και λύσεις για ρεύμα, φυσικό αέριο, φωτοβολταϊκά και ηλεκτροκίνηση.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Ζαλοκώστα 8',
      addressLocality: 'Αθήνα',
      postalCode: '10671',
      addressCountry: 'GR',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Ελλάδα',
    },
    serviceType: ['Σύγκριση τιμολογίων ενέργειας', 'Φυσικό αέριο', 'Φωτοβολταϊκά', 'Ηλεκτροκίνηση'],
  };

  const styles = landingStyles
    .map((href) => `<link rel="stylesheet" href="${href}" data-landing-prerender-style />`)
    .join('\n    ');
  const jsonLd = JSON.stringify(companyStructuredData)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  let html = await readFile(indexPath, 'utf8');
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('Expected the Vite root mount point in dist/index.html; refusing to overwrite unexpected output.');
  }
  html = html.replace('<html lang="el">', '<html lang="el" class="has-prerender">');
  html = html.replace(
    '</head>',
    `    ${styles}
    <script type="application/ld+json">${jsonLd}</script>
    <style id="landing-prerender-style">
      #seo-prerender { display: block; }
      html.has-prerender #root { visibility: hidden; }
      html:not(.has-prerender) #seo-prerender { display: none; }
    </style>
    <script>if (window.location.hash.startsWith('#/')) document.documentElement.classList.remove('has-prerender');</script>
  </head>`,
  );
  html = html.replace(
    '<div id="root"></div>',
    `<div id="seo-prerender" data-prerendered="public-landing">${markup}</div>
    <div id="root"></div>`,
  );

  await writeFile(indexPath, html, 'utf8');
  console.log(`Prerendered Hlektrismos public landing HTML (${markup.length.toLocaleString('en-US')} characters, ${landingStyles.length} stylesheet(s)).`);
} finally {
  await server.close();
}
