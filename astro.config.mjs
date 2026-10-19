import { defineConfig } from 'astro/config';

// The server serves the site at the domain root, so BASE defaults to /. The GitHub Pages preview sets BASE=/Warminster-VFW-website- in its workflow.
const BASE = process.env.BASE ?? '/';

export default defineConfig({
  site: process.env.SITE ?? 'https://mishtuk.github.io',
  base: BASE,
  output: 'static',
  build: { inlineStylesheets: 'always' },
});
