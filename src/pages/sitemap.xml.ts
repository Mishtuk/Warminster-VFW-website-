import type { APIRoute } from 'astro';
import { href } from '../lib/site';

const paths = ['/', '/bar', '/events', '/events/first-visit', '/events/flyer', '/hall', '/programs', '/youth', '/support', '/shop', '/volunteer', '/help', '/resources', '/news', '/about', '/join', '/history', '/honor', '/contact'];

export const GET: APIRoute = ({ site }) => {
  const urls = paths.map((p) => `<url><loc>${new URL(href(p === '/' ? p : p + '/'), site).href}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
