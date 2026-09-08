const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface Business {
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  category: string | null;
  lat: number | null;
  lon: number | null;
}

const BUSINESS_KEYS = new Set([
  "shop", "amenity", "tourism", "leisure", "office", "craft", "healthcare", "sport",
]);

function buildAddress(tags: Record<string, string>): string {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    tags["addr:postcode"],
    tags["addr:country"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function categoryFromTags(tags: Record<string, string>): string {
  for (const key of BUSINESS_KEYS) {
    if (tags[key]) {
      const value = tags[key];
      return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
    }
  }
  return null;
}

function extractBusinesses(elements: OsmElement[]): Business[] {
  const businesses: Business[] = [];
  for (const el of elements) {
    const tags = el.tags || {};
    if (!tags.name) continue;
    let isBusiness = false;
    for (const key of BUSINESS_KEYS) {
      if (tags[key]) { isBusiness = true; break; }
    }
    if (!isBusiness) continue;
    const coords = el.lat != null ? { lat: el.lat, lon: el.lon } : el.center;
    businesses.push({
      name: tags.name,
      phone: tags["phone"] || tags["contact:phone"] || null,
      email: tags["email"] || tags["contact:email"] || null,
      website: tags["website"] || tags["contact:website"] || tags["url"] || null,
      address: buildAddress(tags),
      category: categoryFromTags(tags),
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
    });
  }
  return businesses;
}

async function geocodeLocation(query: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const resp = await fetch(url, { headers: { "User-Agent": "ScrapeGraphAI-Dashboard/1.0" } });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), displayName: data[0].display_name };
}

async function queryOverpass(lat: number, lon: number, radiusMeters: number): Promise<OsmElement[]> {
  const query = `[out:json][timeout:25];
  (
    node["name"](around:${radiusMeters},${lat},${lon});
    way["name"](around:${radiusMeters},${lat},${lon});
  );
  out center 200;`;
  const resp = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": "ScrapeGraphAI-Dashboard/1.0" },
    body: query,
  });
  if (!resp.ok) throw new Error("Overpass API did not respond successfully.");
  const data = await resp.json();
  return (data.elements || []) as OsmElement[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const radius = typeof body?.radius === "number" ? Math.min(Math.max(body.radius, 500), 50000) : 5000;

    if (!query) {
      return new Response(JSON.stringify({ error: "Enter a city or location name." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const started = Date.now();
    const geo = await geocodeLocation(query);
    if (!geo) {
      return new Response(JSON.stringify({ error: `Could not find "${query}" on the map. Try a more specific name.` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const elements = await queryOverpass(geo.lat, geo.lon, radius);
    const businesses = extractBusinesses(elements);

    const withPhone = businesses.filter((b) => b.phone);
    const withEmail = businesses.filter((b) => b.email);

    const result = {
      location: geo.displayName,
      coordinates: { lat: geo.lat, lon: geo.lon },
      radiusMeters: radius,
      totalFound: businesses.length,
      withPhone: withPhone.length,
      withEmail: withEmail.length,
      businesses: businesses.sort((a, b) => {
        if (a.phone && !b.phone) return -1;
        if (!a.phone && b.phone) return 1;
        return a.name.localeCompare(b.name);
      }),
    };

    return new Response(JSON.stringify({ result, durationMs: Date.now() - started }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "The search service is busy. Please try again in a moment." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
