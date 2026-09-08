/*
# Create business search results table

1. New Tables
- `business_searches` stores business finder queries and their results.
- `id` unique identifier.
- `created_at` when the search was run.
- `query` the location or search term entered by the user.
- `status` pending, running, completed, or failed.
- `result` jsonb array of found businesses with name, phone, email, address, website, category, lat, lon.
- `error` safe error message on failure.
- `duration_ms` elapsed processing time.

2. Security
- Row Level Security enabled.
- Single-tenant dashboard without sign-in: anon and authenticated share access.
- Four separate CRUD policies provided.

3. Important Notes
- The result column uses jsonb to store an array of business objects.
- This table is intentionally shared because the dashboard has no accounts.
*/

CREATE TABLE IF NOT EXISTS public.business_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  query text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result jsonb,
  error text,
  duration_ms integer
);

ALTER TABLE public.business_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business searches can be read" ON public.business_searches;
CREATE POLICY "Business searches can be read" ON public.business_searches FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Business searches can be created" ON public.business_searches;
CREATE POLICY "Business searches can be created" ON public.business_searches FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Business searches can be updated" ON public.business_searches;
CREATE POLICY "Business searches can be updated" ON public.business_searches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Business searches can be deleted" ON public.business_searches;
CREATE POLICY "Business searches can be deleted" ON public.business_searches FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS business_searches_created_at_idx ON public.business_searches (created_at DESC);
