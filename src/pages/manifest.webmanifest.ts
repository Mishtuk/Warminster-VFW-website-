import type { APIRoute } from 'astro';
import { href, POST } from '../lib/site';

// Generated so start_url/scope/icons follow the BASE env switch.
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: POST.name,
      short_name: POST.short,
      start_url: href('/'),
      scope: href('/'),
      display: 'standalone',
      background_color: '#121921',
      theme_color: '#121921',
      icons: [
        { src: href('/brand/icon-192.png'), sizes: '192x192', type: 'image/png' },
        { src: href('/brand/icon-512.png'), sizes: '512x512', type: 'image/png' },
        { src: href('/brand/apple-touch-icon.png'), sizes: '180x180', type: 'image/png' },
        { src: href('/brand/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
