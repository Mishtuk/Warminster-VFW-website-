import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';

// The server serves the site at the domain root, so BASE defaults to /. The GitHub Pages preview sets BASE=/Warminster-VFW-website- in its workflow.
const BASE = process.env.BASE ?? '/';
// Staff edits from the admin (src/lib/content.js). server.js sets VFW_CONTENT when it rebuilds; no file means the built-in defaults.
const CONTENT = process.env.VFW_CONTENT ? JSON.parse(readFileSync(process.env.VFW_CONTENT, 'utf8')) : {};

export default defineConfig({
  site: process.env.SITE ?? 'https://mishtuk.github.io',
  base: BASE,
  output: 'static',
  build: { inlineStylesheets: 'always' },
  // News photos from US government feeds are fetched at build time and self-hosted (the CSP only allows our own images).
  image: { remotePatterns: [{ protocol: 'https' }] },
  vite: { define: { __VFW_CONTENT__: JSON.stringify(CONTENT) } },
});
