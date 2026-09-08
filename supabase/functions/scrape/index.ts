const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"]);

function isSafeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (blockedHosts.has(parsed.hostname.toLowerCase())) return false;
    if (/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\.|^169\.254\./.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function cleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

function extractLinks(html: string, baseUrl: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const pattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && links.length < 20) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      const text = cleanText(match[2]);
      if (text && /^https?:/.test(url)) links.push({ text: text.slice(0, 120), url });
    } catch { /* ignore malformed links */ }
  }
  return links;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const url = body?.url;
    const type = body?.type === 'extract' ? 'extract' : 'scrape';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!isSafeUrl(url)) {
      return new Response(JSON.stringify({ error: 'Please enter a valid public http or https URL.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const started = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': 'ScrapeGraphAI Dashboard/1.0' }, redirect: 'follow' });
    if (!response.ok) throw new Error('Target page did not respond successfully.');
    const html = (await response.text()).slice(0, 2_000_000);
    const title = extractTitle(html);
    const text = cleanText(html).slice(0, 20_000);
    const result = type === 'extract'
      ? { title, prompt, answer: `Page content loaded successfully. Use the extracted page text below to review the information requested: ${prompt || 'page summary'}.`, text, links: extractLinks(html, url) }
      : { title, url, text, links: extractLinks(html, url), characterCount: text.length };

    return new Response(JSON.stringify({ result, durationMs: Date.now() - started }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'We could not load that page. Check the URL and try again.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
