/*
# Create scrape jobs history table

1. New Tables
- `scrape_jobs` stores every scraping request made in the dashboard.
- `id` is the unique job identifier.
- `created_at` records when the request was submitted.
- `type` identifies scraping, extraction, or search.
- `url` stores the target page when applicable.
- `prompt` stores the user's extraction question.
- `status` tracks pending, running, completed, or failed work.
- `result` stores the returned JSON or text output.
- `error` stores a safe error message when a job fails.
- `duration_ms` stores the elapsed processing time.

2. Security
- Row Level Security is enabled.
- This is a single-tenant dashboard without sign-in, so anon and authenticated users can use the shared history.
- Four separate CRUD policies are provided for the dashboard client.

3. Important Notes
- The result column uses jsonb so both structured extraction and plain page results are supported.
- The table is intentionally shared because this dashboard does not include accounts.
*/

CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('scrape', 'extract', 'search')),
  url text,
  prompt text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result jsonb,
  error text,
  duration_ms integer
);

ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shared history can be read" ON public.scrape_jobs;
CREATE POLICY "Shared history can be read" ON public.scrape_jobs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Shared history can be created" ON public.scrape_jobs;
CREATE POLICY "Shared history can be created" ON public.scrape_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Shared history can be updated" ON public.scrape_jobs;
CREATE POLICY "Shared history can be updated" ON public.scrape_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shared history can be deleted" ON public.scrape_jobs;
CREATE POLICY "Shared history can be deleted" ON public.scrape_jobs FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS scrape_jobs_created_at_idx ON public.scrape_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS scrape_jobs_status_idx ON public.scrape_jobs (status);
