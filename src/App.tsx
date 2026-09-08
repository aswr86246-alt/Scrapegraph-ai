import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { NewScrapeJob, ScrapeJob } from './lib/types'
import {
  Activity, ArrowUpRight, BookOpen, Building2, Check, ChevronDown, Clock3, Copy, Download, ExternalLink,
  FileSearch, Globe2, History, LayoutDashboard, Link2, Loader2, Mail, Menu, MoreHorizontal, Phone,
  PanelLeftClose, PanelLeftOpen, Play, RefreshCw, Search, Sparkles, TerminalSquare,
  Trash2, X, Zap,
} from 'lucide-react'

type View = 'overview' | 'scrape' | 'businesses' | 'history'
type Mode = 'scrape' | 'extract'

type Business = {
  name: string
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  category: string | null
  lat: number | null
  lon: number | null
}

type BusinessSearchResult = {
  location: string
  radiusMeters: number
  totalFound: number
  withPhone: number
  withEmail: number
  businesses: Business[]
}

type ScrapeResult = {
  title?: string
  url?: string
  text?: string
  links?: Array<{ text: string; url: string }>
  characterCount?: number
  prompt?: string
  answer?: string
}

const exampleUrls = ['https://news.ycombinator.com', 'https://en.wikipedia.org/wiki/Web_scraping', 'https://scrapegraphai.com']

function formatDuration(ms: number | null) {
  if (ms === null) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
}

function App() {
  const [view, setView] = useState<View>('overview')
  const [mode, setMode] = useState<Mode>('extract')
  const [businesses, setBusinesses] = useState<BusinessSearchResult | null>(null)
  const [businessQuery, setBusinessQuery] = useState('Comrat, Moldova')
  const [businessRadius, setBusinessRadius] = useState(5000)
  const [isBusinessSearchRunning, setIsBusinessSearchRunning] = useState(false)
  const [businessError, setBusinessError] = useState('')
  const [url, setUrl] = useState('')
  const [prompt, setPrompt] = useState('Summarize the main points and list the most important facts.')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState<ScrapeJob[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')

  const completedJobs = useMemo(() => jobs.filter((job) => job.status === 'completed').length, [jobs])
  const averageDuration = useMemo(() => {
    const values = jobs.map((job) => job.duration_ms).filter((value): value is number => value !== null)
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
  }, [jobs])

  async function loadJobs() {
    const { data } = await supabase.from('scrape_jobs').select('*').order('created_at', { ascending: false }).limit(20)
    if (data) setJobs(data as ScrapeJob[])
  }

  useEffect(() => { void loadJobs() }, [])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  async function runScrape() {
    setError('')
    setResult(null)
    if (!url.trim()) { setError('Add a page URL to get started.'); return }
    try { new URL(url) } catch { setError('Enter a complete URL, including https://'); return }
    if (mode === 'extract' && !prompt.trim()) { setError('Tell us what you want to find on the page.'); return }

    setIsRunning(true)
    const started = Date.now()
    const pending: NewScrapeJob = { type: mode, url: url.trim(), prompt: mode === 'extract' ? prompt.trim() : null, status: 'running', result: null, error: null, duration_ms: null }
    const { data: job } = await supabase.from('scrape_jobs').insert(pending).select().maybeSingle()

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ url: url.trim(), prompt, type: mode }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.result) throw new Error(payload.error || 'The page could not be loaded.')
      const durationMs = payload.durationMs ?? Date.now() - started
      setResult(payload.result as ScrapeResult)
      if (job?.id) await supabase.from('scrape_jobs').update({ status: 'completed', result: payload.result, duration_ms: durationMs }).eq('id', job.id)
      notify('Page loaded successfully')
      await loadJobs()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Something went wrong while loading the page.'
      setError(message)
      if (job?.id) await supabase.from('scrape_jobs').update({ status: 'failed', error: 'Request failed', duration_ms: Date.now() - started }).eq('id', job.id)
      await loadJobs()
    } finally { setIsRunning(false) }
  }

  async function copyResult() {
    if (!result) return
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function clearHistory() {
    await supabase.from('scrape_jobs').delete().neq('id', '')
    setJobs([])
    notify('History cleared')
  }

  async function findBusinesses() {
    setBusinessError('')
    setBusinesses(null)
    if (!businessQuery.trim()) { setBusinessError('Enter a city or location.'); return }
    setIsBusinessSearchRunning(true)
    const started = Date.now()
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/find-businesses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ query: businessQuery.trim(), radius: businessRadius }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.result) throw new Error(payload.error || 'Search failed')
      setBusinesses(payload.result as BusinessSearchResult)
      await supabase.from('business_searches').insert({ query: businessQuery.trim(), status: 'completed', result: payload.result, duration_ms: payload.durationMs ?? Date.now() - started })
      notify(`Found ${payload.result.totalFound} businesses`)
    } catch (cause) {
      setBusinessError(cause instanceof Error ? cause.message : 'Could not complete the search.')
    } finally { setIsBusinessSearchRunning(false) }
  }

  function exportBusinesses() {
    if (!businesses?.businesses.length) return
    const headers = ['Name', 'Category', 'Phone', 'Email', 'Website', 'Address', 'Latitude', 'Longitude']
    const rows = businesses.businesses.map((business) => [business.name, business.category, business.phone, business.email, business.website, business.address, business.lat, business.lon].map((value) => `"${String(value ?? '').split('"').join('""')}"`).join(','))
    const blob = new Blob([[headers.join(','), ...rows].join('\\n')], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'businesses.csv'; anchor.click(); URL.revokeObjectURL(href)
  }

  function selectView(nextView: View) { setView(nextView); if (nextView === 'scrape') setResult(null) }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-gray-900">
      <aside className={`${sidebarOpen ? 'w-[248px]' : 'w-[76px]'} hidden shrink-0 border-r border-gray-200 bg-white transition-all duration-300 md:flex md:flex-col`}>
        <div className="flex h-[72px] items-center border-b border-gray-100 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm shadow-primary-200"><Zap size={19} fill="currentColor" /></div>
            {sidebarOpen && <div className="animate-fade-in"><p className="whitespace-nowrap text-[15px] font-bold tracking-tight">ScrapeGraph<span className="text-primary-600">AI</span></p><p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gray-400">Workspace</p></div>}
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-6">
          {([['overview', LayoutDashboard, 'Overview'], ['scrape', Sparkles, 'New scrape'], ['businesses', Search, 'Business finder'], ['history', History, 'History']] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => selectView(id)} className={`sidebar-item w-full ${view === id ? 'sidebar-item-active' : ''} ${!sidebarOpen ? 'justify-center px-2' : ''}`} title={!sidebarOpen ? label : undefined}><Icon size={18} />{sidebarOpen && <span>{label}</span>}</button>
          ))}
          {sidebarOpen && <div className="px-4 pb-2 pt-8 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Resources</div>}
          <a href="https://docs.scrapegraphai.com" target="_blank" rel="noreferrer" className={`sidebar-item ${!sidebarOpen ? 'justify-center px-2' : ''}`} title={!sidebarOpen ? 'Documentation' : undefined}><BookOpen size={18} />{sidebarOpen && <><span className="flex-1">Documentation</span><ExternalLink size={13} className="text-gray-400" /></>}</a>
          <a href="https://github.com/ScrapeGraphAI/Scrapegraph-ai" target="_blank" rel="noreferrer" className={`sidebar-item ${!sidebarOpen ? 'justify-center px-2' : ''}`} title={!sidebarOpen ? 'GitHub' : undefined}><TerminalSquare size={18} />{sidebarOpen && <><span className="flex-1">GitHub</span><ExternalLink size={13} className="text-gray-400" /></>}</a>
        </nav>
        <div className="border-t border-gray-100 p-3"><button onClick={() => setSidebarOpen(!sidebarOpen)} className={`btn-ghost w-full ${!sidebarOpen ? 'px-2' : 'justify-start'}`} title="Toggle sidebar">{sidebarOpen ? <><PanelLeftClose size={17} /><span>Collapse</span></> : <PanelLeftOpen size={17} />}</button></div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 md:px-8">
          <div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(!sidebarOpen)} className="btn-ghost md:hidden"><Menu size={20} /></button><div><p className="text-sm font-semibold text-gray-900">{view === 'overview' ? 'Overview' : view === 'scrape' ? 'New scrape' : 'Scrape history'}</p><p className="mt-0.5 text-xs text-gray-400">{view === 'overview' ? 'Your scraping workspace at a glance' : view === 'scrape' ? 'Turn any web page into useful data' : 'Review and revisit previous runs'}</p></div></div>
          <div className="flex items-center gap-3"><span className="hidden items-center gap-2 rounded-full border border-success-100 bg-success-50 px-3 py-1.5 text-xs font-medium text-success-700 sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" />System ready</span><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">SG</div></div>
        </header>

        <div className="flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-8 lg:py-10">
          {view === 'overview' && <Overview jobs={jobs} completedJobs={completedJobs} averageDuration={averageDuration} onStart={() => selectView('scrape')} onHistory={() => selectView('history')} />}
          {view === 'businesses' && <BusinessFinder query={businessQuery} setQuery={setBusinessQuery} radius={businessRadius} setRadius={setBusinessRadius} result={businesses} isRunning={isBusinessSearchRunning} error={businessError} onSearch={findBusinesses} onExport={exportBusinesses} />}
          {view === 'scrape' && <ScrapeView mode={mode} setMode={setMode} url={url} setUrl={setUrl} prompt={prompt} setPrompt={setPrompt} isRunning={isRunning} error={error} result={result} copied={copied} onRun={runScrape} onCopy={copyResult} onExample={(value) => setUrl(value)} />}
          {view === 'history' && <HistoryView jobs={jobs} onClear={clearHistory} onOpen={(job) => { setUrl(job.url ?? ''); setPrompt(job.prompt ?? prompt); setMode(job.type === 'extract' ? 'extract' : 'scrape'); setResult(job.result as ScrapeResult); selectView('scrape') }} />}
        </div></div>
      </main>
      {toast && <div className="fixed bottom-6 right-6 z-20 flex animate-slide-up items-center gap-2 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-xl"><Check size={16} className="text-success-400" />{toast}</div>}
    </div>
  )
}

function Overview({ jobs, completedJobs, averageDuration, onStart, onHistory }: { jobs: ScrapeJob[]; completedJobs: number; averageDuration: number; onStart: () => void; onHistory: () => void }) {
  return <div className="animate-fade-in space-y-8">
    <div className="relative overflow-hidden rounded-2xl bg-gray-950 px-7 py-8 text-white shadow-xl shadow-gray-200 md:px-10 md:py-10"><div className="relative z-10 max-w-xl"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-400/30 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-300"><Sparkles size={13} />Intelligent web data extraction</div><h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">Make the web work<br /><span className="text-primary-400">for you.</span></h1><p className="mt-4 max-w-md text-sm leading-6 text-gray-400">Extract clean, useful data from any website with a simple URL and a natural-language prompt.</p><button onClick={onStart} className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-primary-50"><Play size={15} fill="currentColor" />Start a new scrape<ArrowUpRight size={15} /></button></div><div className="absolute -right-20 -top-24 h-80 w-80 rounded-full border border-primary-500/20" /><div className="absolute -right-8 -top-12 h-56 w-56 rounded-full border border-accent-500/10" /><div className="absolute bottom-0 right-24 h-32 w-32 rounded-full bg-primary-600/20 blur-3xl" /><div className="absolute right-12 top-10 hidden h-40 w-52 rotate-[-10deg] rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl md:block"><div className="flex items-center gap-2 border-b border-white/10 pb-3"><div className="h-2 w-2 rounded-full bg-success-400" /><span className="text-[10px] text-gray-500">result.json</span></div><div className="space-y-2 pt-4 font-mono text-[10px]"><div><span className="text-primary-300">&#123;</span> <span className="text-accent-300">"title"</span><span className="text-gray-500">:</span> <span className="text-success-300">"Clean data"</span></div><div className="pl-3"><span className="text-accent-300">"items"</span><span className="text-gray-500">:</span> <span className="text-warning-300">[12]</span></div><div><span className="text-primary-300">&#125;</span></div></div></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><StatCard icon={<Activity size={18} />} label="Total runs" value={jobs.length.toString()} trend="All time" color="blue" /><StatCard icon={<Check size={18} />} label="Successful" value={completedJobs.toString()} trend={jobs.length ? `${Math.round((completedJobs / jobs.length) * 100)}% success rate` : 'Start your first run'} color="green" /><StatCard icon={<Clock3 size={18} />} label="Avg. response" value={averageDuration ? formatDuration(averageDuration) : '—'} trend="Across recent runs" color="amber" /></div>
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="text-sm font-semibold">Recent activity</h2><p className="mt-0.5 text-xs text-gray-400">Your latest scraping runs</p></div><button onClick={onHistory} className="text-xs font-medium text-primary-600 hover:text-primary-700">View all</button></div>{jobs.length === 0 ? <EmptyActivity onStart={onStart} /> : <div className="divide-y divide-gray-100">{jobs.slice(0, 5).map((job) => <JobRow key={job.id} job={job} />)}</div>}</div><div className="card p-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-600"><Globe2 size={18} /></div><div><h2 className="text-sm font-semibold">How it works</h2><p className="text-xs text-gray-400">Three steps to useful data</p></div></div><div className="mt-6 space-y-5">{[['01', 'Add a page', 'Paste any public website URL.'], ['02', 'Describe what you need', 'Ask in plain, everyday language.'], ['03', 'Get clean results', 'Review, copy, and use your data.']].map(([number, title, description]) => <div key={number} className="flex gap-3"><span className="font-mono text-xs font-medium text-primary-500">{number}</span><div><p className="text-sm font-medium text-gray-800">{title}</p><p className="mt-1 text-xs leading-5 text-gray-400">{description}</p></div></div>)}</div></div></div>
  </div>
}

function StatCard({ icon, label, value, trend, color }: { icon: React.ReactNode; label: string; value: string; trend: string; color: 'blue' | 'green' | 'amber' }) { const colors = { blue: 'bg-primary-50 text-primary-600', green: 'bg-success-50 text-success-600', amber: 'bg-warning-50 text-warning-600' }; return <div className="card p-5"><div className="flex items-start justify-between"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}>{icon}</div><MoreHorizontal size={17} className="text-gray-300" /></div><p className="mt-4 text-xs font-medium text-gray-400">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-400">{trend}</p></div> }
function EmptyActivity({ onStart }: { onStart: () => void }) { return <div className="flex flex-col items-center justify-center px-6 py-14 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-400"><Activity size={22} /></div><p className="text-sm font-medium text-gray-700">No activity yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-gray-400">Your completed scrapes will appear here.</p><button onClick={onStart} className="mt-4 text-xs font-semibold text-primary-600 hover:text-primary-700">Run your first scrape</button></div> }

function ScrapeView({ mode, setMode, url, setUrl, prompt, setPrompt, isRunning, error, result, copied, onRun, onCopy, onExample }: { mode: Mode; setMode: (mode: Mode) => void; url: string; setUrl: (url: string) => void; prompt: string; setPrompt: (prompt: string) => void; isRunning: boolean; error: string; result: ScrapeResult | null; copied: boolean; onRun: () => void; onCopy: () => void; onExample: (url: string) => void }) {
  return <div className="animate-fade-in"><div className="mb-8"><h1 className="text-2xl font-bold tracking-tight">Create a scrape</h1><p className="mt-2 text-sm text-gray-500">Tell us where to look and what you want to find.</p></div><div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><div className="card p-5 md:p-6"><div className="mb-6 flex rounded-lg bg-gray-100 p-1"><button onClick={() => setMode('extract')} className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition ${mode === 'extract' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Sparkles size={14} />Extract with AI</button><button onClick={() => setMode('scrape')} className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition ${mode === 'scrape' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><FileSearch size={14} />Read page</button></div><label className="mb-2 block text-xs font-semibold text-gray-700">Website URL</label><div className="relative"><Globe2 size={16} className="absolute left-3.5 top-3.5 text-gray-400" /><input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onRun() }} placeholder="https://example.com" className="input-field pl-10" /></div><div className="mt-3 flex flex-wrap gap-2">{exampleUrls.map((example) => <button key={example} onClick={() => onExample(example)} className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[10px] text-gray-500 transition hover:bg-primary-50 hover:text-primary-600"><Link2 size={11} />{new URL(example).hostname}</button>)}</div>{mode === 'extract' && <div className="mt-6"><div className="mb-2 flex items-center justify-between"><label className="block text-xs font-semibold text-gray-700">What should we find?</label><span className="text-[10px] text-gray-400">Natural language</span></div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} className="input-field resize-none leading-6" placeholder="e.g. List all products with their name and price..." /><div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400"><Sparkles size={11} className="text-primary-500" />Be specific for better results</div></div>}{error && <div className="mt-5 flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 px-3.5 py-3 text-xs leading-5 text-error-700"><X size={15} className="mt-0.5 shrink-0" />{error}</div>}<button onClick={onRun} disabled={isRunning} className="btn-primary mt-7 w-full py-3">{isRunning ? <><Loader2 size={17} className="animate-spin" />Loading page...</> : <><Play size={16} fill="currentColor" />{mode === 'extract' ? 'Extract data' : 'Read page'}<ArrowUpRight size={15} /></>}</button><p className="mt-4 text-center text-[10px] text-gray-400">Works with public pages • No account required</p></div><ResultPanel result={result} isRunning={isRunning} copied={copied} onCopy={onCopy} /></div></div>
}

function ResultPanel({ result, isRunning, copied, onCopy }: { result: ScrapeResult | null; isRunning: boolean; copied: boolean; onCopy: () => void }) { if (isRunning) return <div className="card flex min-h-[500px] flex-col items-center justify-center p-6 text-center"><div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600"><div className="absolute inset-0 animate-ping rounded-full bg-primary-100 opacity-60" /><Loader2 size={25} className="relative animate-spin" /></div><p className="text-sm font-semibold">Reading the page</p><p className="mt-2 max-w-xs text-xs leading-5 text-gray-400">Fetching content and preparing it for you...</p><div className="mt-7 h-1 w-36 overflow-hidden rounded-full bg-gray-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-primary-500" /></div></div>; if (!result) return <div className="card flex min-h-[500px] flex-col items-center justify-center p-6 text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-400"><FileSearch size={24} /></div><p className="text-sm font-semibold text-gray-700">Your results will appear here</p><p className="mt-2 max-w-xs text-xs leading-5 text-gray-400">Run a scrape to see page content, links, and extracted information.</p></div>; return <div className="card min-h-[500px] overflow-hidden"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600"><Check size={16} /></div><div className="min-w-0"><p className="text-sm font-semibold">Results ready</p><p className="truncate text-[10px] text-gray-400">{result.title || result.url || 'Page content'}</p></div></div><button onClick={onCopy} className="btn-ghost px-2.5 text-xs">{copied ? <Check size={14} className="text-success-600" /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button></div><div className="max-h-[550px] overflow-y-auto p-5">{result.answer && <div className="mb-5 rounded-lg border border-primary-100 bg-primary-50/60 p-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary-600">Summary</p><p className="text-sm leading-6 text-gray-700">{result.answer}</p></div>}<div className="mb-4 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Page content</span>{result.characterCount && <span className="font-mono text-[10px] text-gray-400">{result.characterCount.toLocaleString()} chars</span>}</div><pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-4 font-mono text-[11px] leading-5 text-gray-300">{result.text || JSON.stringify(result, null, 2)}</pre>{result.links && result.links.length > 0 && <div className="mt-6"><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Links found · {result.links.length}</p><div className="space-y-2">{result.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-xs text-gray-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"><Link2 size={13} className="shrink-0 text-gray-400" /><span className="truncate">{link.text}</span><ExternalLink size={12} className="ml-auto shrink-0 text-gray-400" /></a>)}</div></div>}</div></div> }

function BusinessFinder({ query, setQuery, radius, setRadius, result, isRunning, error, onSearch, onExport }: { query: string; setQuery: (value: string) => void; radius: number; setRadius: (value: number) => void; result: BusinessSearchResult | null; isRunning: boolean; error: string; onSearch: () => void; onExport: () => void }) {
  return <div className="animate-fade-in">
    <div className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700"><Search size={13} />Local business discovery</div><h1 className="text-2xl font-bold tracking-tight">Find businesses</h1><p className="mt-2 max-w-2xl text-sm text-gray-500">Search a city or area and collect public business names, phone numbers, emails, websites, and addresses.</p></div>
    <div className="card p-5 md:p-6"><div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end"><div><label className="mb-2 block text-xs font-semibold text-gray-700">City or location</label><div className="relative"><Globe2 size={16} className="absolute left-3.5 top-3.5 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSearch() }} className="input-field pl-10" placeholder="e.g. Comrat, Moldova" /></div></div><div><label className="mb-2 block text-xs font-semibold text-gray-700">Search radius</label><select value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="input-field"><option value={2000}>2 km</option><option value={5000}>5 km</option><option value={10000}>10 km</option><option value={25000}>25 km</option><option value={50000}>50 km</option></select></div><button onClick={onSearch} disabled={isRunning} className="btn-primary h-[43px]">{isRunning ? <><Loader2 size={16} className="animate-spin" />Searching...</> : <><Search size={16} />Find businesses</>}</button></div>{error && <div className="mt-5 flex items-start gap-2 rounded-lg border border-error-100 bg-error-50 px-3.5 py-3 text-xs leading-5 text-error-700"><X size={15} className="mt-0.5 shrink-0" />{error}</div>}<div className="mt-5 flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-3 text-xs leading-5 text-gray-500"><Activity size={15} className="mt-0.5 shrink-0 text-primary-500" />Results come from OpenStreetMap. Phone numbers and emails appear only when publicly listed by the business.</div></div>
    {isRunning && <div className="card mt-6 flex min-h-[240px] flex-col items-center justify-center text-center"><Loader2 size={28} className="animate-spin text-primary-600" /><p className="mt-4 text-sm font-semibold">Searching the area</p><p className="mt-2 text-xs text-gray-400">Finding businesses and collecting available contact details...</p></div>}
    {result && !isRunning && <div className="mt-6 space-y-5"><div className="grid gap-4 sm:grid-cols-4"><StatCard icon={<Globe2 size={18} />} label="Location" value={result.location.split(',')[0]} trend={`${result.radiusMeters / 1000} km radius`} color="blue" /><StatCard icon={<Building2 size={18} />} label="Businesses" value={String(result.totalFound)} trend="Found nearby" color="blue" /><StatCard icon={<Phone size={18} />} label="With phone" value={String(result.withPhone)} trend="Publicly listed" color="green" /><StatCard icon={<Mail size={18} />} label="With email" value={String(result.withEmail)} trend="Publicly listed" color="amber" /></div><div className="card overflow-hidden"><div className="flex flex-col justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold">Business results</h2><p className="mt-1 text-xs text-gray-400">{result.location}</p></div><button onClick={onExport} className="btn-secondary px-3 py-2 text-xs"><Download size={14} />Export CSV</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-400"><tr><th className="px-5 py-3">Business</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Website</th><th className="px-4 py-3">Address</th></tr></thead><tbody className="divide-y divide-gray-100">{result.businesses.map((business, index) => <tr key={`${business.name}-${index}`} className="transition hover:bg-gray-50"><td className="px-5 py-4"><p className="max-w-[190px] truncate text-xs font-semibold text-gray-800">{business.name}</p></td><td className="px-4 py-4"><span className="badge bg-gray-100 text-gray-600">{business.category || 'Business'}</span></td><td className="px-4 py-4 text-xs text-gray-600">{business.phone ? <a className="whitespace-nowrap text-primary-600 hover:underline" href={`tel:${business.phone}`}>{business.phone}</a> : <span className="text-gray-300">Not listed</span>}</td><td className="px-4 py-4 text-xs text-gray-600">{business.email ? <a className="text-primary-600 hover:underline" href={`mailto:${business.email}`}>{business.email}</a> : <span className="text-gray-300">Not listed</span>}</td><td className="px-4 py-4 text-xs">{business.website ? <a href={business.website} target="_blank" rel="noreferrer" className="inline-flex max-w-[150px] items-center gap-1 truncate text-primary-600 hover:underline"><ExternalLink size={12} />Website</a> : <span className="text-gray-300">Not listed</span>}</td><td className="max-w-[190px] truncate px-4 py-4 text-xs text-gray-500">{business.address || 'Not listed'}</td></tr>)}</tbody></table></div>{result.businesses.length === 0 && <div className="px-5 py-12 text-center text-sm text-gray-400">No named businesses found in this radius.</div>}</div></div>}
  </div>
}

function HistoryView({ jobs, onClear, onOpen }: { jobs: ScrapeJob[]; onClear: () => void; onOpen: (job: ScrapeJob) => void }) { const [filter, setFilter] = useState('all'); const shown = filter === 'all' ? jobs : jobs.filter((job) => job.type === filter); return <div className="animate-fade-in"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight">Scrape history</h1><p className="mt-2 text-sm text-gray-500">Everything you have explored in one place.</p></div>{jobs.length > 0 && <button onClick={onClear} className="btn-ghost self-start text-xs text-gray-500 hover:text-error-600 sm:self-auto"><Trash2 size={14} />Clear history</button>}</div><div className="card overflow-hidden"><div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-4"><div className="relative mr-auto min-w-[180px] flex-1"><Search size={14} className="absolute left-3 top-2.5 text-gray-400" /><input placeholder="Search history..." className="h-8 w-full rounded-md border border-gray-200 pl-8 text-xs outline-none focus:border-primary-400" /></div>{[['all', 'All runs'], ['extract', 'AI extracts'], ['scrape', 'Page reads']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${filter === id ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'}`}>{label}</button>)}</div>{shown.length === 0 ? <EmptyActivity onStart={() => undefined} /> : <div className="divide-y divide-gray-100">{shown.map((job) => <button key={job.id} onClick={() => onOpen(job)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-gray-50"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${job.type === 'extract' ? 'bg-primary-50 text-primary-600' : 'bg-accent-50 text-accent-600'}`}>{job.type === 'extract' ? <Sparkles size={17} /> : <FileSearch size={17} />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-gray-800">{job.prompt || job.url || 'Untitled scrape'}</p><span className={`badge shrink-0 ${job.status === 'completed' ? 'bg-success-50 text-success-700' : job.status === 'failed' ? 'bg-error-50 text-error-700' : 'bg-warning-50 text-warning-600'}`}>{job.status}</span></div><p className="mt-1 truncate text-xs text-gray-400">{job.url || 'No URL'} · {formatDate(job.created_at)}</p></div><div className="hidden items-center gap-6 text-right sm:flex"><div><p className="text-xs font-medium text-gray-600">{formatDuration(job.duration_ms)}</p><p className="mt-1 text-[10px] text-gray-400">duration</p></div><ArrowUpRight size={16} className="text-gray-300" /></div></button>)}</div>}</div></div> }
function JobRow({ job }: { job: ScrapeJob }) { return <div className="flex items-center gap-3 px-5 py-3.5"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${job.type === 'extract' ? 'bg-primary-50 text-primary-600' : 'bg-accent-50 text-accent-600'}`}>{job.type === 'extract' ? <Sparkles size={15} /> : <FileSearch size={15} />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-gray-700">{job.prompt || job.url}</p><p className="mt-1 text-[10px] text-gray-400">{formatDate(job.created_at)}</p></div><span className={`badge ${job.status === 'completed' ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>{job.status}</span></div> }

export default App
