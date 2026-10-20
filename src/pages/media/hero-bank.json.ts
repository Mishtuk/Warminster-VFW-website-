import type { APIRoute } from 'astro';
import { bank } from '../../lib/hero-bank';

// The whole hero photo bank, fetched by the carousel after the page has loaded (keeps it out of the home HTML).
export const GET: APIRoute = () => new Response(JSON.stringify(bank()), { headers: { 'Content-Type': 'application/json' } });
