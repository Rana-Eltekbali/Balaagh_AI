import { type ReactNode, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DemoAccessDialog } from '@/components/demo-access-dialog';
import {
  IncidentClass,
  ApiError,
  Priority,
  type AnalysisResult,
  type AnalyticsSummary,
  type GetAnalyticsSummaryParams,
  type CountItem,
  type Report,
} from '@workspace/api-client-react';
import {
  getGetAnalyticsSummaryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetLocationsSummaryQueryKey,
  getGetReportQueryKey,
  getListReportsQueryKey,
  useAnalyzeReport,
  useCreateReport,
  useDeleteReport,
  useUpdateReport,
  useGetAnalyticsSummary,
  useGetDashboardSummary,
  useGetLocationsSummary,
  useGetReport,
  useListReports,
  useListReportEdits,
  getListReportEditsQueryKey,
} from '@workspace/api-client-react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  FileSearch,
  Download,
  Info,
  Landmark,
  LayoutDashboard,
  Loader2,
  MapPin,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';
import { downloadAnalytics } from '@/lib/analytics-export';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 3 },
    mutations: { retry: false },
  },
});

const incidentClasses = Object.values(IncidentClass);
const priorities = Object.values(Priority);

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
const formatDate = (date?: string) => date ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '—';
const priorityTone = (priority: string) => priority === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' : priority === 'High' ? 'bg-amber-50 text-amber-700 border-amber-200' : priority === 'Medium' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200';
const incidentShort = (value: string) => value.replace(' / ', ' · ');

function Button({ children, className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' }) {
  return <button {...props} className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))]', variant === 'primary' && 'bg-[hsl(var(--primary))] text-white hover:-translate-y-0.5 hover:bg-[hsl(221_61%_34%)] shadow-sm', variant === 'outline' && 'border border-[hsl(var(--border))] bg-white text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]', variant === 'ghost' && 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]', variant === 'danger' && 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100', className)}>{children}</button>;
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide', className)}>{children}</span>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-[hsl(var(--muted))]', className)} />;
}

function LoadingPanel({ label = 'Loading data...' }: { label?: string }) {
  return <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-8 text-center"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[hsl(var(--primary))]" /><p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p></div>;
}

function ErrorPanel({ onRetry, message = 'The data could not be loaded.' }: { onRetry?: () => void; message?: string }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50/70 p-8 text-center"><AlertCircle className="mx-auto mb-3 h-7 w-7 text-red-600" /><p className="font-semibold text-red-900">Failed to load data</p><p className="mt-1 text-sm text-red-700">{message}</p>{onRetry && <Button variant="outline" className="mt-4 border-red-200 bg-white" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Try again</Button>}</div>;
}

function EmptyPanel({ icon: Icon = ClipboardList, title, text, action }: { icon?: typeof ClipboardList; title: string; text: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-white p-10 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Icon className="h-5 w-5" /></div><h3 className="font-semibold text-[hsl(var(--foreground))]">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p>{action}</div>;
}

function StatCard({ label, value, note, icon: Icon, tone = 'blue' }: { label: string; value: string | number; note: string; icon: typeof BarChart3; tone?: 'blue' | 'red' | 'amber' | 'teal' }) {
  const tones = { blue: 'bg-blue-50 text-blue-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', teal: 'bg-teal-50 text-teal-700' };
  return <div className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 shadow-[0_8px_30px_hsl(220_30%_40%_/_0.04)]"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{label}</p><p className="mt-3 font-mono text-3xl font-medium tracking-tight text-[hsl(var(--foreground))]">{value}</p></div><div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-5 w-5" /></div></div><p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">{note}</p></div>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />{eyebrow}</p><h1 className="text-3xl font-semibold tracking-[-.03em] text-[hsl(var(--foreground))] sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p></div>{action}</div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const items = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/analyze', label: 'Analyze report', icon: Sparkles },
    { href: '/reports', label: 'Saved reports', icon: ClipboardList },
    { href: '/locations', label: 'Locations', icon: MapPin },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/about', label: 'About Project', icon: CircleHelp },
  ];
  return <div className="app-shell min-h-[100dvh] text-[hsl(var(--foreground))]"><aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-4 py-5 transition-transform duration-300 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}><div className="flex items-center gap-3 px-3"><div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"><ShieldCheck className="h-5 w-5" /><span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--accent))] ring-2 ring-[hsl(var(--sidebar))]" /></div><div><p className="text-base font-bold tracking-tight text-white">Balaagh <span className="text-[hsl(var(--sidebar-primary))]">AI</span></p><p className="text-[10px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.62)]">AI-Powered Command Center</p></div></div><div className="my-8 h-px bg-[hsl(var(--sidebar-border))]" /><nav className="space-y-1">{items.map(item => { const active = item.href === '/' ? location === '/' : location.startsWith(item.href); const Icon = item.icon; const cls = cn('group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors', active ? 'bg-[hsl(var(--sidebar-accent))] text-white' : 'text-[hsl(var(--sidebar-foreground)/.72)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white'); const iconCls = cn('h-[18px] w-[18px]', active ? 'text-[hsl(var(--sidebar-primary))]' : 'text-[hsl(var(--sidebar-foreground)/.62)]'); return (item as any).newTab ? <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)} className={cls}><Icon className={iconCls} />{item.label}</a> : <Link key={item.href} href={item.href} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMobileOpen(false)} className={cls}><Icon className={iconCls} />{item.label}</Link>; })}</nav><div className="mt-auto pt-4 border-t border-[hsl(var(--sidebar-border))]"><a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/submit`} target="_blank" rel="noopener noreferrer" data-testid="link-nav-public-intake" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[hsl(var(--sidebar-foreground)/.72)] transition-colors hover:bg-[hsl(var(--sidebar-accent))] hover:text-white"><Send className="h-[18px] w-[18px] text-[hsl(var(--sidebar-foreground)/.62)]" />قدم بلاغ</a></div></aside>{mobileOpen && <button aria-label="Close navigation" data-testid="button-close-nav" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[hsl(216_43%_18%/.35)] lg:hidden" /> }<main className="min-h-[100dvh] lg:pl-[260px]"><div className="mx-auto max-w-[1440px] p-5 sm:p-8">{children}</div></main></div>;
}

function useReportEdits() {
  return useListReportEdits({ query: { queryKey: getListReportEditsQueryKey(), refetchInterval: 5000 } });
}

const fieldLabel: Record<string, string> = {
  incidentClass: 'Incident class',
  priority: 'Priority',
  location: 'Location',
  peopleAtRisk: 'People at risk',
  requiredSupport: 'Required support',
  summary: 'Summary',
};

function Overview() {
  const dashboard = useGetDashboardSummary();
  const edits = useReportEdits();
  const data = dashboard.data;
  return <><PageTitle eyebrow="Situation overview" title="Situation Overview" description="Monitor, classify, and triage incoming Arabic crisis reports." action={<Link href="/analyze" data-testid="link-start-analysis" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New analysis</Link>} />{dashboard.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36" />)}</div> : dashboard.isError ? <ErrorPanel onRetry={() => dashboard.refetch()} /> : data ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total reports" value={data.totalReports} note="Total reports in the system" icon={ClipboardList} tone="blue" /><StatCard label="Critical reports" value={data.criticalReports} note="Requires immediate attention" icon={TriangleAlert} tone="red" /><StatCard label="High priority" value={data.highPriority} note="Across all locations" icon={AlertCircle} tone="amber" /><StatCard label="Reports today" value={data.reportsToday} note="Since midnight in the configured reporting timezone" icon={Clock3} tone="teal" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Recent reports</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Most recently received reports</p></div><Link href="/reports" data-testid="link-view-all-reports" className="text-xs font-bold text-[hsl(var(--primary))]">View all <ArrowUpRight className="ml-1 inline h-3 w-3" /></Link></div>{data.recentReports?.length ? <div className="space-y-1">{data.recentReports.slice(0, 6).map(report => <ReportRow key={report.id} report={report} />)}</div> : <EmptyPanel title="No reports saved yet" text="No reports have been saved yet. Submit a report for analysis to populate the queue." action={<Link href="/analyze" data-testid="link-empty-analyze" className="mt-4 inline-flex text-sm font-semibold text-[hsl(var(--primary))]">Analyze a report <ArrowUpRight className="ml-1 h-4 w-4" /></Link>} />}</section><section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-6"><h2 className="font-semibold">Priority mix</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Saved reports by review level</p><BarList items={data.byPriority || []} colors={['bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-slate-400']} /><h2 className="mt-8 font-semibold">Incident classes</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Distribution across saved reports</p><BarList items={data.byIncidentClass || []} colors={['bg-[hsl(var(--primary))]', 'bg-[hsl(var(--accent))]', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-400']} /></section></div>

{/* Edited reports section */}
<div className="mt-6">
  <div className="mb-4 flex items-center gap-2">
    <Pencil className="h-4 w-4 text-[hsl(var(--primary))]" />
    <h2 className="font-semibold">Edited reports</h2>
    <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--primary))]">{edits.data?.length ?? 0}</span>
    <p className="text-xs text-[hsl(var(--muted-foreground))]">— corrections made by analysts for model retraining</p>
  </div>
  {edits.isLoading ? <Skeleton className="h-24" /> : edits.isError ? <ErrorPanel onRetry={() => edits.refetch()} /> : !edits.data?.length ? (
    <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-white p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">No edits yet — open any report and click <strong>Edit</strong> to correct its fields.</div>
  ) : (
    <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-white">
      <table className="w-full min-w-[640px] text-left">
        <thead><tr className="border-b border-[hsl(var(--border))] text-[11px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
          <th className="px-4 py-3 font-bold">Report</th>
          <th className="px-4 py-3 font-bold">Field</th>
          <th className="px-4 py-3 font-bold">Before</th>
          <th className="px-4 py-3 font-bold">After</th>
          <th className="px-4 py-3 font-bold">Edited at</th>
        </tr></thead>
        <tbody>{edits.data.map((e, i) => (
          <tr key={i} className="border-b border-[hsl(var(--border)/.6)] last:border-0 hover:bg-[hsl(var(--muted)/.3)]">
            <td className="px-4 py-3"><Link href={`/reports/${e.reportId}`} className="block max-w-[220px]"><p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{incidentShort(e.incidentClass)}</p><p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]" dir="rtl">{e.originalText}</p></Link></td>
            <td className="px-4 py-3 text-sm font-medium">{fieldLabel[e.field] ?? e.field}</td>
            <td className="px-4 py-3"><span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 line-through">{e.field === 'peopleAtRisk' ? (e.before === 'true' ? 'At risk' : 'Not identified') : e.before}</span></td>
            <td className="px-4 py-3"><span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{e.field === 'peopleAtRisk' ? (e.after === 'true' ? 'At risk' : 'Not identified') : e.after}</span></td>
            <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{formatDate(e.editedAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )}
</div>

</> : null}</>;
}

function ReportRow({ report }: { report: Report }) {
  return <Link href={`/reports/${report.id}`} data-testid={`link-report-${report.id}`} className="group flex items-center justify-between gap-4 rounded-xl p-3 transition-colors hover:bg-[hsl(var(--muted)/.55)]"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><FileSearch className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{incidentShort(report.incidentClass)}</p><p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">{report.location || 'Location pending'} · {formatDate(report.createdAt)}</p></div></div><div className="flex shrink-0 items-center gap-3"><Badge className={priorityTone(report.priority)}>{report.priority}</Badge><ArrowUpRight className="hidden h-4 w-4 text-[hsl(var(--muted-foreground))] group-hover:block" /></div></Link>;
}

function BarList({ items, colors }: { items: CountItem[]; colors: string[] }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return <div className="mt-4 space-y-3">{items.slice(0, 6).map((item, index) => <div key={item.label}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate text-[hsl(var(--muted-foreground))]">{incidentShort(item.label)}</span><span className="font-mono font-medium">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className={cn('h-full rounded-full transition-all', colors[index % colors.length])} style={{ width: `${Math.max((item.count / max) * 100, 4)}%` }} /></div></div>)}</div>;
}

function Analyze() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalysisResult | undefined>();
  const analyze = useAnalyzeReport();
  const create = useCreateReport();
  const qc = useQueryClient();
  const submit = () => { if (text.trim().length >= 5) analyze.mutate({ data: { text: text.trim() } }, { onSuccess: (value) => { setResult(value); create.reset(); } }); };
  const save = () => { if (!result) return; create.mutate({ data: { originalText: text.trim(), ...result } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListReportsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetLocationsSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() }); } }); };
  return <><PageTitle eyebrow="Analysis workspace" title="Analyze Report" description="Submit an Arabic report for automated classification, then review all extracted fields before saving." /><div className="grid gap-6 xl:grid-cols-[.95fr_1.05fr]"><section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-xs text-[hsl(var(--primary))]">INPUT</p><h2 className="mt-1 text-lg font-semibold">Original Arabic report</h2></div></div><textarea dir="rtl" value={text} onChange={e => { setText(e.target.value); setResult(undefined); create.reset(); }} maxLength={5000} disabled={analyze.isPending || create.isPending} data-testid="textarea-report" placeholder="مثال: يوجد حريق في منزل بجنزور وهناك طفلان داخل البيت" className="arabic-copy min-h-[300px] w-full resize-y rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] p-5 text-base text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--accent))] focus:ring-4 focus:ring-[hsl(var(--accent)/.12)]" /><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-[hsl(var(--muted-foreground))]">{text.length} characters</span><Button onClick={submit} disabled={text.trim().length < 5 || analyze.isPending || create.isPending} data-testid="button-analyze-report">{analyze.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Structuring report</> : <><Sparkles className="h-4 w-4" /> Analyze report</>}</Button></div>{analyze.isError && <div className="mt-4"><ErrorPanel message="The analysis service did not respond. Your original text is still here." onRetry={submit} /></div>}</section><section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-xs text-[hsl(var(--primary))]">STRUCTURED OUTPUT</p><h2 className="mt-1 text-lg font-semibold">Structured result</h2></div>{result && <Badge className="border-[hsl(var(--accent)/.35)] bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Check className="mr-1 h-3 w-3" />Analysis complete</Badge>}</div>{result ? <ResultCard result={result} onSave={save} saving={create.isPending} saved={create.isSuccess} /> : <div className="grid min-h-[300px] place-items-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] p-8 text-center"><div><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Sparkles className="h-5 w-5" /></div><h3 className="font-semibold">Awaiting report submission</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[hsl(var(--muted-foreground))]">Classification results will populate here after a report is submitted.</p></div></div>}</section></div>{create.isError && <ErrorPanel message="The report could not be saved. Analyze again if the analysis has expired." onRetry={save} />}</>;
}

function ResultCard({ result, onSave, saving, saved }: { result: AnalysisResult; onSave: () => void; saving: boolean; saved: boolean }) {
  const fields = [['Incident class', result.incidentClass], ['Priority', result.priority], ['Location', result.location || 'Not identified'], ['Required support', result.requiredSupport || 'Not identified']];
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{label}</p><p className={cn('mt-2 text-sm font-semibold', label === 'Priority' && 'text-[hsl(var(--primary))]')}>{label === 'Priority' ? <Badge className={priorityTone(value)}>{value}</Badge> : value}</p></div>)}</div><div className="rounded-xl border border-[hsl(var(--border))] p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">People at risk</p><p className="mt-2 text-sm font-semibold">{result.peopleAtRisk ? 'Potentially identified' : 'Not identified'}</p></div><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.35)] p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">AI summary</p><p className="mt-2 text-sm leading-6">{result.summary}</p></div><Button onClick={onSave} disabled={saving || saved} className="w-full" data-testid="button-save-analysis">{saved ? <><Check className="h-4 w-4" /> Saved</> : saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><ClipboardList className="h-4 w-4" /> Save report</>}</Button></div>;
}


function Reports() {
  const locationSummary = useGetLocationsSummary();
  const locationOptions = locationSummary.data?.locations.map(row => row.location) ?? [];
  const [search, setSearch] = useState('');
  const [incident, setIncident] = useState('');
  const [priority, setPriority] = useState('');
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState('date');
  const reports = useListReports({
    search: search || undefined,
    incidentClass: incident ? incident as typeof incidentClasses[number] : undefined,
    priority: priority ? priority as typeof priorities[number] : undefined,
    location: location || undefined,
    sort: sort as 'date' | 'priority' | 'incidentClass',
  });
  const [showFilters, setShowFilters] = useState(false);
  const deleteReport = useDeleteReport();
  const qc = useQueryClient();
  const clear = () => { setSearch(''); setIncident(''); setPriority(''); setLocation(''); };
  const remove = (id: number) => { if (window.confirm('Permanently delete this report? This action cannot be undone.')) deleteReport.mutate({ id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListReportsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetLocationsSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() }); } }); };
  return <><PageTitle eyebrow="Review queue" title="Saved reports" description="Search and filter the full report archive by class, priority, or location." action={<Link href="/analyze" data-testid="link-new-report" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New analysis</Link>} /><section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-4 sm:p-6"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-reports" placeholder="Search location, class, or summary..." className="h-11 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] pl-10 pr-3 text-sm outline-none focus:border-[hsl(var(--accent))]" /></div><Button variant="outline" onClick={() => setShowFilters(!showFilters)} data-testid="button-toggle-filters"><SlidersHorizontal className="h-4 w-4" /> Filters <ChevronDown className={cn('h-4 w-4 transition-transform', showFilters && 'rotate-180')} /></Button><select value={sort} onChange={e => setSort(e.target.value)} data-testid="select-sort-reports" className="h-11 rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm font-medium outline-none"><option value="date">Newest first</option><option value="priority">Priority</option><option value="incidentClass">Incident class</option></select></div>{showFilters && <div className="mt-4 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-4 sm:flex-row sm:flex-wrap"><select value={incident} onChange={e => setIncident(e.target.value)} data-testid="select-filter-incident" className="h-10 flex-1 min-w-[160px] rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm"><option value="">All incident classes</option>{incidentClasses.map(value => <option key={value} value={value}>{value}</option>)}</select><select value={priority} onChange={e => setPriority(e.target.value)} data-testid="select-filter-priority" className="h-10 flex-1 min-w-[130px] rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm"><option value="">All priorities</option>{priorities.map(value => <option key={value} value={value}>{value}</option>)}</select><select value={location} onChange={e => setLocation(e.target.value)} data-testid="select-filter-location" className="h-10 flex-1 min-w-[130px] rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm"><option value="">All locations</option>{locationOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><Button variant="ghost" onClick={clear} data-testid="button-clear-filters"><X className="h-4 w-4" /> Clear</Button></div>}<div className="mt-5">{reports.isLoading ? <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}</div> : reports.isError ? <ErrorPanel onRetry={() => reports.refetch()} /> : reports.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-[hsl(var(--border))] text-[11px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]"><th className="px-3 py-3 font-bold">Report</th><th className="px-3 py-3 font-bold">Location</th><th className="px-3 py-3 font-bold">Priority</th><th className="px-3 py-3 font-bold">People at Risk</th><th className="px-3 py-3 font-bold">Required Support</th><th className="px-3 py-3 font-bold">Created</th><th className="px-3 py-3" /></tr></thead><tbody>{reports.data.map(report => <tr key={report.id} className="group border-b border-[hsl(var(--border)/.7)] last:border-0 hover:bg-[hsl(var(--muted)/.35)]"><td className="px-3 py-4"><Link href={`/reports/${report.id}`} data-testid={`link-table-report-${report.id}`} className="block"><p className="max-w-[250px] truncate text-sm font-semibold text-[hsl(var(--foreground))]">{incidentShort(report.incidentClass)}</p><p className="mt-1 max-w-[280px] truncate text-xs text-[hsl(var(--muted-foreground))]">{report.summary}</p></Link></td><td className="px-3 py-4 text-sm">{report.location || '—'}</td><td className="px-3 py-4"><Badge className={priorityTone(report.priority)}>{report.priority}</Badge></td><td className="px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">{report.peopleAtRisk ? <Badge className="border-red-200 bg-red-50 text-red-700">At risk</Badge> : <span className="text-[hsl(var(--muted-foreground))]">—</span>}</td><td className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">{incidentShort(report.requiredSupport) || '—'}</td><td className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">{formatDate(report.createdAt)}</td><td className="px-3 py-4 text-right"><button onClick={() => remove(report.id)} disabled={deleteReport.isPending} data-testid={`button-delete-report-${report.id}`} aria-label={`Delete report ${report.id}`} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-0 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div> : <EmptyPanel icon={Search} title="No reports match your filters" text="Try a broader search or clear the filters to see the full review queue." action={<Button variant="ghost" onClick={clear} className="mt-4" data-testid="button-empty-clear">Clear filters</Button>} />}</div></section></>;
}

function ReportDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const report = useGetReport(id, { query: { queryKey: getGetReportQueryKey(id), enabled: Number.isFinite(id) } });
  const remove = useDeleteReport();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const deleteThis = () => { if (window.confirm('Permanently delete this report? This action cannot be undone.')) remove.mutate({ id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListReportsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetLocationsSummaryQueryKey() }); qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() }); setLocation('/reports'); } }); };
  return <>{report.isLoading ? <LoadingPanel label="Loading report detail" /> : report.isError || !report.data ? <ErrorPanel message="This report could not be found." onRetry={() => report.refetch()} /> : <><div className="mb-7 flex items-center justify-between gap-3"><Link href="/reports" data-testid="link-back-reports" className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><ArrowLeft className="h-4 w-4" /> Back to reports</Link><Button variant="danger" onClick={deleteThis} disabled={remove.isPending} data-testid="button-delete-detail">{remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete</Button></div><div className="mb-7"><p className="mb-2 font-mono text-xs text-[hsl(var(--primary))]">REPORT / {String(id).padStart(4, '0')}</p><h1 className="text-3xl font-semibold tracking-[-.03em]">Report detail</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Received {formatDate(report.data.createdAt)} · Processed in {report.data.analysisTime || '—'}</p></div><DetailContent report={report.data} /></>}</>;
}

function DetailContent({ report }: { report: Report }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...report });
  const update = useUpdateReport();
  const qc = useQueryClient();

  const save = () => {
    update.mutate(
      { id: report.id, data: { incidentClass: draft.incidentClass, priority: draft.priority, location: draft.location, peopleAtRisk: draft.peopleAtRisk, requiredSupport: draft.requiredSupport, summary: draft.summary } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetReportQueryKey(report.id) });
          qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetLocationsSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getListReportEditsQueryKey() });
          setEditing(false);
        },
      },
    );
  };

  const cancel = () => { setDraft({ ...report }); setEditing(false); };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold">Original report</h2>
          
        </div>
        <div dir="rtl" className="arabic-copy rounded-xl bg-[hsl(var(--background))] p-5 text-[15px] leading-8">{report.originalText}</div>

      </section>

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold">Structured analysis</h2>
          <div className="flex items-center gap-2">
            {!editing && <Badge className={priorityTone(report.priority)}>{report.priority}</Badge>}
            {editing
              ? <><Button variant="ghost" onClick={cancel} className="h-8 px-3 text-xs">Cancel</Button><Button onClick={save} disabled={update.isPending} className="h-8 px-3 text-xs">{update.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</> : <><Check className="h-3 w-3" /> Save changes</>}</Button></>
              : <Button variant="outline" onClick={() => { setDraft({ ...report }); setEditing(true); }} className="h-8 px-3 text-xs"><Pencil className="h-3 w-3" /> Edit</Button>
            }
          </div>
        </div>

        {update.isError && <ErrorPanel message="Changes could not be saved." onRetry={save} />}
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Incident class</label>
              <select value={draft.incidentClass} onChange={e => setDraft(d => ({ ...d, incidentClass: e.target.value as Report['incidentClass'] }))} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--accent))]">
                {Object.values(IncidentClass).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Priority</label>
              <select value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value as Report['priority'] }))} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--accent))]">
                {Object.values(Priority).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Location</label>
              <input value={draft.location} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--accent))]" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">People at risk</label>
              <select value={draft.peopleAtRisk ? 'yes' : 'no'} onChange={e => setDraft(d => ({ ...d, peopleAtRisk: e.target.value === 'yes' }))} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--accent))]">
                <option value="yes">Potentially identified</option>
                <option value="no">Not identified</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Required support</label>
              <input value={draft.requiredSupport} onChange={e => setDraft(d => ({ ...d, requiredSupport: e.target.value }))} className="h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--accent))]" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Summary</label>
              <textarea value={draft.summary} onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))} rows={3} className="arabic-copy w-full rounded-lg border border-[hsl(var(--input))] bg-white p-3 text-sm outline-none focus:border-[hsl(var(--accent))]" dir="rtl" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <KeyValue label="Incident class" value={report.incidentClass} />
            <KeyValue label="Location" value={report.location || 'Not identified'} />
            <KeyValue label="Required support" value={report.requiredSupport || 'Not identified'} />
            <KeyValue label="People at risk" value={report.peopleAtRisk ? 'Potentially identified' : 'Not identified'} />
            <div className="border-t border-[hsl(var(--border))] pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Summary</p>
              <p className="mt-2 text-sm leading-6">{report.summary}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border)/.7)] pb-3"><span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span><span className="text-right text-sm font-semibold">{value}</span></div>; }

// Coordinates for common Libyan cities
const LIBYA_CITY_COORDS: Record<string, [number, number]> = {
  'طرابلس': [32.9003, 13.1803],
  'Tripoli': [32.9003, 13.1803],
  'بنغازي': [32.1194, 20.0868],
  'Benghazi': [32.1194, 20.0868],
  'مصراتة': [32.3754, 15.0925],
  'Misrata': [32.3754, 15.0925],
  'الزاوية': [32.7573, 12.7277],
  'Zawiya': [32.7573, 12.7277],
  'البيضاء': [32.7637, 21.7554],
  'Al Bayda': [32.7637, 21.7554],
  'سبها': [27.0377, 14.4283],
  'Sabha': [27.0377, 14.4283],
  'الزنتان': [31.9266, 12.1177],
  'Zintan': [31.9266, 12.1177],
  'غريان': [32.1728, 13.0203],
  'Gharyan': [32.1728, 13.0203],
  'درنة': [32.7635, 22.6376],
  'Derna': [32.7635, 22.6376],
  'أجدابيا': [30.7554, 20.2263],
  'Ajdabiya': [30.7554, 20.2263],
  'الخمس': [32.6500, 14.2619],
  'Khoms': [32.6500, 14.2619],
  'ترهونة': [32.4350, 13.6344],
  'Tarhuna': [32.4350, 13.6344],
  'يفرن': [32.0630, 12.5269],
  'Yefren': [32.0630, 12.5269],
  'زليتن': [32.4674, 14.5688],
  'Zliten': [32.4674, 14.5688],
  'بني وليد': [31.7523, 13.9875],
  'Bani Walid': [31.7523, 13.9875],
  'جنزور': [32.9014, 13.0297],
  'Janzur': [32.9014, 13.0297],
  'صبراتة': [32.7932, 12.4877],
  'Sabratha': [32.7932, 12.4877],
  'الكفرة': [24.1826, 23.3087],
  'Kufra': [24.1826, 23.3087],
  'مرزق': [25.9155, 13.8980],
  'Murzuq': [25.9155, 13.8980],
  'غدامس': [30.1307, 9.4977],
  'Ghadames': [30.1307, 9.4977],
  'توبرق': [31.9431, 24.0680],
  'Tobruk': [31.9431, 24.0680],
  'سرت': [31.2089, 16.5887],
  'Sirte': [31.2089, 16.5887],
};

function resolveCoords(name: string): [number, number] | null {
  // exact match
  if (LIBYA_CITY_COORDS[name]) return LIBYA_CITY_COORDS[name];
  // partial match
  const key = Object.keys(LIBYA_CITY_COORDS).find(k =>
    name.includes(k) || k.includes(name)
  );
  return key ? LIBYA_CITY_COORDS[key] : null;
}

function Locations() {
  const locations = useGetLocationsSummary();
  const rows = locations.data?.locations || [];
  const [selected, setSelected] = useState<string | null>(null);

  const mapped = rows.map(r => ({ ...r, coords: resolveCoords(r.location) }));
  const onMap = mapped.filter(r => r.coords !== null);
  const offMap = mapped.filter(r => r.coords === null);
  const maxReports = Math.max(...rows.map(r => r.reports), 1);

  const selectedRow = rows.find(r => r.location === selected);

  return (
    <>
      <PageTitle
        eyebrow="Geographic lens"
        title="Reporting locations"
        description="A location-level view of where reports are being received in saved reports."
      />
      {locations.isLoading ? (
        <LoadingPanel label="Loading location summary" />
      ) : locations.isError ? (
        <ErrorPanel onRetry={() => locations.refetch()} />
      ) : rows.length ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          {/* MAP */}
          <section className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-white">
            <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-5 py-3">
              <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" />
              <span className="font-semibold text-sm">Libya – reporting map</span>
              <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{onMap.length} of {rows.length} locations plotted</span>
            </div>
            <div style={{ height: '520px' }}>
              <MapContainer
                center={[27.0, 17.0]}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {onMap.map(row => {
                  const isSel = selected === row.location;
                  const radius = 6 + Math.round((row.reports / maxReports) * 18);
                  const color = row.criticalReports > 0 ? '#ef4444' : '#6366f1';
                  return (
                    <CircleMarker
                      key={row.location}
                      center={row.coords as [number, number]}
                      radius={radius}
                      pathOptions={{
                        color: isSel ? '#1e1b4b' : color,
                        fillColor: color,
                        fillOpacity: isSel ? 0.95 : 0.7,
                        weight: isSel ? 3 : 1.5,
                      }}
                      eventHandlers={{ click: () => setSelected(isSel ? null : row.location) }}
                    >
                      <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.95}>
                        <div className="text-xs font-semibold">{row.location}</div>
                        <div className="text-xs">{row.reports} reports · {row.criticalReports} critical</div>
                      </LeafletTooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
            {/* legend */}
            <div className="flex items-center gap-4 border-t border-[hsl(var(--border))] px-5 py-2.5 text-xs text-[hsl(var(--muted-foreground))]">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-indigo-500 opacity-70" />Normal</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-red-500 opacity-70" />Has critical reports</span>
              <span className="flex items-center gap-1.5 ml-auto">Circle size ∝ report count</span>
            </div>
          </section>

          {/* SIDEBAR */}
          <aside className="flex flex-col gap-3">
            {/* selected detail card */}
            {selectedRow && (
              <div className="rounded-2xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--secondary)/.4)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{selectedRow.location}</h3>
                  <button onClick={() => setSelected(null)} className="text-[hsl(var(--muted-foreground))] hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white p-3 text-center border border-[hsl(var(--border))]">
                    <p className="font-mono text-xl font-medium">{selectedRow.reports}</p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Reports</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 text-center border border-[hsl(var(--border))]">
                    <p className="font-mono text-xl font-medium text-red-600">{selectedRow.criticalReports}</p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Critical</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 text-center border border-[hsl(var(--border))]">
                    <p className="font-mono text-xl font-medium text-[hsl(var(--primary))]">{selectedRow.peopleAtRisk}</p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">At risk</p>
                  </div>
                </div>
              </div>
            )}

            {/* all locations list */}
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
                <Landmark className="h-4 w-4 text-[hsl(var(--primary))]" />
                <span className="text-sm font-semibold">All locations</span>
                <Badge className="ml-auto border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] text-[hsl(var(--muted-foreground))]">{rows.length}</Badge>
              </div>
              <div className="divide-y divide-[hsl(var(--border))] max-h-[400px] overflow-y-auto">
                {rows.map((row, i) => (
                  <button
                    key={row.location}
                    data-testid={`card-location-${i}`}
                    onClick={() => setSelected(selected === row.location ? null : row.location)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-[hsl(var(--muted)/.4)]',
                      selected === row.location && 'bg-[hsl(var(--secondary)/.5)]'
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--primary))]',
                      resolveCoords(row.location) ? 'bg-[hsl(var(--secondary))]' : 'bg-amber-50'
                    )}>
                      <MapPin className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.location}</p>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{row.reports} reports</p>
                    </div>
                    {row.criticalReports > 0 && (
                      <Badge className="border-red-200 bg-red-50 text-red-700 shrink-0">{row.criticalReports}</Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* unplotted notice */}
            {offMap.length > 0 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] px-1">
                <Info className="inline h-3 w-3 mr-1" />
                {offMap.length} location{offMap.length > 1 ? 's' : ''} not plotted on map (coordinates unknown).
              </p>
            )}
          </aside>
        </div>
      ) : (
        <EmptyPanel icon={MapPin} title="No locations to show" text="Location summaries will appear after reports are saved." />
      )}
    </>
  );
}

type AnalyticsFilters = {
  incidentClass: NonNullable<GetAnalyticsSummaryParams['incidentClass']> | '';
  priority: NonNullable<GetAnalyticsSummaryParams['priority']> | '';
  location: string;
  peopleAtRisk: NonNullable<GetAnalyticsSummaryParams['peopleAtRisk']> | '';
  dateFrom: string;
  dateTo: string;
};

const emptyAnalyticsFilters: AnalyticsFilters = {
  incidentClass: '', priority: '', location: '', peopleAtRisk: '', dateFrom: '', dateTo: '',
};

function Analytics() {
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyAnalyticsFilters);
  const [appliedFilters, setAppliedFilters] = useState<GetAnalyticsSummaryParams>({});
  const analytics = useGetAnalyticsSummary(appliedFilters);
  const locations = useGetLocationsSummary();
  const data = analytics.data;
  const hasFilters = Object.keys(appliedFilters).length > 0;
  const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
  const max = data ? Math.max(...data.byLocation.map(i => i.count), 1) : 1;
  const controlClass = 'h-11 w-full rounded-lg border border-[hsl(var(--input))] bg-white px-3 text-sm outline-none focus:border-[hsl(var(--accent))]';
  const labelClass = 'mb-1.5 block text-xs font-semibold text-[hsl(var(--muted-foreground))]';
  const canExport = Boolean(data && !analytics.isFetching && !analytics.isError);

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidDates) return;
    setAppliedFilters({
      ...(filters.incidentClass && { incidentClass: filters.incidentClass }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.location && { location: filters.location }),
      ...(filters.peopleAtRisk && { peopleAtRisk: filters.peopleAtRisk }),
      ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
      ...(filters.dateTo && { dateTo: filters.dateTo }),
    });
  };
  const clearFilters = () => {
    setFilters(emptyAnalyticsFilters);
    setAppliedFilters({});
  };

  return <>
    <PageTitle eyebrow="Pattern review" title="Analytics" description="Explore classification and distribution patterns across the report archive." action={
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!canExport} onClick={() => data && downloadAnalytics(data, 'csv')} data-testid="button-export-analytics-csv"><Download className="h-4 w-4" /> Export CSV</Button>
        <Button variant="outline" disabled={!canExport} onClick={() => data && downloadAnalytics(data, 'json')} data-testid="button-export-analytics-json"><Download className="h-4 w-4" /> Export JSON</Button>
      </div>
    } />
    <form onSubmit={applyFilters} className="mb-6 rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3"><h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4" /> Filters</h2>{hasFilters && <Badge>Filtered view</Badge>}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label><span className={labelClass}>Incident class</span><select className={controlClass} value={filters.incidentClass} onChange={event => setFilters({ ...filters, incidentClass: event.target.value as AnalyticsFilters['incidentClass'] })} data-testid="analytics-filter-incident"><option value="">All incident classes</option>{incidentClasses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span className={labelClass}>Priority</span><select className={controlClass} value={filters.priority} onChange={event => setFilters({ ...filters, priority: event.target.value as AnalyticsFilters['priority'] })} data-testid="analytics-filter-priority"><option value="">All priorities</option>{priorities.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span className={labelClass}>Location</span><select className={controlClass} value={filters.location} onChange={event => setFilters({ ...filters, location: event.target.value })} data-testid="analytics-filter-location"><option value="">All locations</option>{(locations.data?.locations ?? []).map(item => <option key={item.location} value={item.location}>{item.location}</option>)}</select></label>
        <label><span className={labelClass}>People at risk</span><select className={controlClass} value={filters.peopleAtRisk} onChange={event => setFilters({ ...filters, peopleAtRisk: event.target.value as AnalyticsFilters['peopleAtRisk'] })} data-testid="analytics-filter-risk"><option value="">All</option><option value="true">Yes</option><option value="false">No</option></select></label>
        <label><span className={labelClass}>Date from</span><input type="date" className={controlClass} value={filters.dateFrom} max={filters.dateTo || undefined} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} data-testid="analytics-filter-date-from" /></label>
        <label><span className={labelClass}>Date to</span><input type="date" className={controlClass} value={filters.dateTo} min={filters.dateFrom || undefined} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} data-testid="analytics-filter-date-to" /></label>
      </div>
      <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Dates include the selected days in the reporting timezone. Exports use the applied filters.</p>
      {invalidDates && <p role="alert" className="mt-2 text-sm text-red-700">Date from must be on or before date to.</p>}
      {locations.isError && <p role="alert" className="mt-2 text-sm text-red-700">Location options could not be loaded. <button type="button" className="underline" onClick={() => locations.refetch()}>Retry locations</button></p>}
      <div className="mt-4 flex flex-wrap gap-2"><Button type="submit" disabled={invalidDates} data-testid="button-apply-analytics-filters"><SlidersHorizontal className="h-4 w-4" /> Apply filters</Button><Button type="button" variant="ghost" onClick={clearFilters} data-testid="button-clear-analytics-filters"><X className="h-4 w-4" /> Clear filters</Button></div>
    </form>
    {analytics.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64" />)}</div> : analytics.isError ? <ErrorPanel onRetry={() => analytics.refetch()} /> : data ? <>
      {data.totalFiltered === 0 && <p role="status" className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">No reports match the applied filters.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="People at risk" value={data.peopleAtRisk} note="Reports indicating potential risk" icon={TriangleAlert} tone="red" /><StatCard label="Incident classes" value={data.byIncidentClass.length} note="Classes represented in data" icon={BarChart3} tone="blue" /><StatCard label="Locations" value={data.byLocation.length} note="Areas represented in data" icon={MapPin} tone="teal" /><StatCard label={hasFilters ? 'Filtered reports' : 'Total reports'} value={data.totalFiltered} note={hasFilters ? 'Reports matching the applied filters' : 'Reports in current dataset'} icon={ClipboardList} tone="amber" /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><ChartPanel title="Incident distribution" subtitle="Count by exact incident class"><BarList items={data.byIncidentClass} colors={['bg-[hsl(var(--primary))]', 'bg-[hsl(var(--accent))]', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-400']} /></ChartPanel><ChartPanel title="Priority distribution" subtitle="Review levels in saved reports"><BarList items={data.byPriority} colors={['bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-slate-400']} /></ChartPanel></div>
      <div className="mt-6"><ChartPanel title="Reports by location" subtitle={hasFilters ? 'Reports matching the applied filters' : 'Current saved dataset'}><div className="mt-5 space-y-4">{data.byLocation.map(item => <div key={item.label} className="flex items-center gap-3"><span className="w-28 truncate text-xs text-[hsl(var(--muted-foreground))]">{item.label}</span><div className="h-8 flex-1 overflow-hidden rounded-md bg-[hsl(var(--muted))]"><div className="flex h-full items-center rounded-md bg-[hsl(var(--primary))] px-2 text-xs font-bold text-white" style={{ width: `${Math.max(8, item.count / max * 100)}%` }}>{item.count}</div></div></div>)}</div></ChartPanel></div>
      <Evaluation data={data.evaluation} />
    </> : null}
  </>;
}


function ChartPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) { return <section className="rounded-2xl border border-[hsl(var(--border))] bg-white p-5 sm:p-6"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>{children}</section>; }

function Evaluation({ data }: { data: AnalyticsSummary['evaluation'] }) {
  if (!data) return <div className="mt-6"><EmptyPanel icon={BarChart3} title="Evaluation metrics not available" text="Genuine model evaluation metrics have not been configured." /></div>;
  const metrics = [['Accuracy', data.accuracy], ['Precision', data.precision], ['Recall', data.recall], ['Macro F1', data.macroF1]];
  return <section className="mt-6 rounded-2xl border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--secondary)/.38)] p-5 sm:p-7"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" /><p className="font-mono text-xs font-medium uppercase tracking-[.15em] text-[hsl(var(--primary))]">Model Evaluation</p></div><h2 className="mt-2 text-xl font-semibold">Evaluation metrics</h2><p className="mt-1 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">Model evaluation metrics for the current classification configuration. Results reflect the current dataset and should be interpreted alongside qualitative review.</p></div><Badge className="w-fit border-[hsl(var(--accent)/.35)] bg-white text-[hsl(var(--primary))]"><CircleHelp className="mr-1 h-3 w-3" /> Current dataset</Badge></div><div className="mt-6 grid gap-3 sm:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-[hsl(var(--accent)/.22)] bg-white/70 p-4"><p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p><p className="mt-2 font-mono text-2xl font-medium text-[hsl(var(--primary))]">{typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : value}</p></div>)}</div><div className="mt-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Confusion matrix</p><div className="mt-3 flex max-w-full overflow-x-auto"><div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(data.confusionMatrix?.[0]?.length || 1, 1)}, minmax(36px, 1fr))` }}>{(data.confusionMatrix || []).flatMap((row, ri) => row.map((value, ci) => <div key={`${ri}-${ci}`} className="flex h-9 items-center justify-center rounded bg-[hsl(var(--primary)/.1)] font-mono text-xs" style={{ opacity: Math.max(.35, Math.min(1, value / 10)) }}>{value}</div>))}</div></div></div></section>;
}

function About() {
  return (
    <div className="-mx-5 -mt-8 min-h-[calc(100dvh-72px)] px-5 py-10 sm:-mx-8 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-4xl">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
          <ShieldCheck className="h-4 w-4" /> Balaagh AI / About
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-6xl">About Balaagh AI</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[hsl(var(--muted-foreground))]">
          Balaagh AI is a university capstone prototype for turning unstructured Arabic reports in the Libyan context into a reviewable set of signals.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <AboutCard number="01" title="Purpose" text="Help analysts move from a long Arabic report to a consistent structured record without losing the original wording." />
          <AboutCard number="02" title="AI approach" text="AraBERT classifies incident category and priority. MARBERT extracts Libyan locations. A unified multi-task MARBERT model handles all three tasks jointly." />
          <AboutCard number="03" title="Operational scope" text="Balaagh AI is a classification and review tool, not emergency dispatch software. All outputs require human verification before operational action." />
        </div>
        <div className="mt-7 rounded-2xl border border-[hsl(var(--border))] bg-white/80 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">How the analysis is structured</h2>
              <p className="mt-2 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
                Arabic reports are processed by trained category, priority, and location models. Analysts review the resulting fields and can correct saved records. Required support starts empty and can be supplied during review.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-[hsl(var(--accent)/.35)] bg-white/80 p-6 sm:p-8">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">A note on responsible use</h2>
              <p className="mt-2 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
                The classifications and evaluation outputs shown in this interface are AI-generated and require verification. They do not replace local expertise, source verification, safety protocols, or decisions by qualified responders.
              </p>
            </div>
          </div>
        </div>
        <Link href="/" data-testid="link-about-home" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
          <ArrowLeft className="h-4 w-4" /> Return to dashboard
        </Link>
      </div>
    </div>
  );
}

function AboutCard({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-white/80 p-5">
      <p className="font-mono text-xs text-[hsl(var(--primary))]">{number}</p>
      <h2 className="mt-10 font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{text}</p>
    </div>
  );
}

function PublicSubmit() {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const analyze = useAnalyzeReport();
  const create = useCreateReport();
  const qc = useQueryClient();
  const busy = analyze.isPending || create.isPending;
  const quickExamples: string[] = [];
  const submit = () => {
    const originalText = text.trim();
    if (!originalText || busy) return;
    analyze.mutate({ data: { text: originalText } }, {
      onSuccess: (result) => create.mutate(
        { data: { originalText, ...result } },
        {
          onSuccess: () => {
            setText('');
            setSubmitted(true);
            qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
            qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
            qc.invalidateQueries({ queryKey: getGetLocationsSummaryQueryKey() });
            qc.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() });
          },
        },
      ),
    });
  };

  return <div dir="rtl" className="relative min-h-[100dvh] overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
    <div className="pointer-events-none absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-[hsl(var(--secondary)/.7)] blur-3xl" />
    <div className="pointer-events-none absolute -bottom-52 -left-32 h-[520px] w-[520px] rounded-full bg-[hsl(var(--accent)/.08)] blur-3xl" />

    <main className="relative mx-auto max-w-[1180px] px-5 py-6 sm:px-8 sm:py-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-[.82fr_1.18fr]">
        <section className="order-2 overflow-hidden rounded-[2rem] bg-[hsl(var(--sidebar))] p-7 text-white shadow-[0_24px_70px_hsl(216_43%_18%_/_0.22)] sm:p-9 lg:order-1">
          <div className="flex items-center gap-3"><div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"><ShieldCheck className="h-5 w-5" /><span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--accent))] ring-2 ring-[hsl(var(--sidebar))]" /></div><div><p className="text-base font-bold tracking-tight text-white">Balaagh <span className="text-[hsl(var(--sidebar-primary))]">AI</span></p></div></div>
          <h2 className="mt-16 max-w-sm text-3xl font-semibold leading-[1.2] tracking-[-.03em] sm:text-4xl">بلاغك يوصل بصورة أوضح.</h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-[hsl(var(--sidebar-foreground)/.68)]">اكتب ما حدث كما وصلتك المعلومة. النظام يحافظ على النص الأصلي ويجهزه للمراجعة داخل فريق Balaagh AI.</p>
          <div className="mt-10 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary)/.16)] text-[hsl(var(--sidebar-primary))] font-mono text-xs">01</span><div><p className="text-sm font-semibold">استلام البلاغ</p><p className="mt-1 text-xs text-[hsl(var(--sidebar-foreground)/.55)]">يتم حفظ النص كما كتبته</p></div></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary)/.16)] text-[hsl(var(--sidebar-primary))] font-mono text-xs">02</span><div><p className="text-sm font-semibold">مراجعة البلاغ</p><p className="mt-1 text-xs text-[hsl(var(--sidebar-foreground)/.55)]">يظهر للفريق في قائمة المراجعة</p></div></div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary)/.16)] text-[hsl(var(--sidebar-primary))] font-mono text-xs">03</span><div><p className="text-sm font-semibold">تنظيم المعلومات</p><p className="mt-1 text-xs text-[hsl(var(--sidebar-foreground)/.55)]">تُرتب الإشارات للمراجعة البشرية</p></div></div>
          </div>

        </section>
        <section className="order-1 rounded-[2rem] border border-[hsl(var(--border))] bg-white p-6 shadow-[0_24px_70px_hsl(220_30%_40%_/_0.08)] sm:p-10 lg:order-2">
          <div className="mb-8"><h1 className="text-4xl font-semibold tracking-[-.045em] sm:text-5xl">قدم بلاغ</h1><p className="mt-4 max-w-xl text-base leading-7 text-[hsl(var(--muted-foreground))]">شارك تفاصيل البلاغ كما وصلتك، حتى تصل المعلومة بصورة أوضح إلى فريق المراجعة.</p></div>
          {submitted ? <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Check className="h-6 w-6" /></div><h2 className="mt-5 text-xl font-semibold">تم استلام البلاغ</h2><p className="mt-2 text-sm leading-7 text-emerald-900/75">شكراً لمساهمتك. تم حفظ البلاغ للمراجعة داخل نظام Balaagh AI.</p><button type="button" onClick={() => setSubmitted(false)} className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">إرسال بلاغ آخر</button></div> : <><label htmlFor="public-report" className="mb-3 block text-sm font-semibold">تفاصيل البلاغ</label><textarea id="public-report" dir="rtl" value={text} onChange={e => { setText(e.target.value); setSubmitted(false); }} maxLength={5000} disabled={busy} data-testid="textarea-public-report" placeholder="اكتب البلاغ بالعربية..." className={cn("arabic-copy min-h-[230px] w-full resize-y rounded-2xl border bg-[hsl(var(--background))] p-5 text-base leading-8 outline-none transition focus:ring-4", /[a-zA-Z]/.test(text) ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "border-[hsl(var(--input))] focus:border-[hsl(var(--accent))] focus:ring-[hsl(var(--accent)/.12)]")} /><div className="mt-3 flex items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]"><span>{text.length} حرف</span><span>يُقبل النص العربي فقط</span></div>{text.length > 0 && /[a-zA-Z]/.test(text) && <p className="mt-2 text-sm text-red-600">يُرجى الكتابة بالعربية فقط.</p>}<Button onClick={submit} disabled={text.trim().length < 5 || busy || /[a-zA-Z]/.test(text)} className="mt-7 min-h-12 w-full rounded-xl" data-testid="button-submit-public-report">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري حفظ البلاغ</> : <><Send className="h-4 w-4" /> إرسال البلاغ للمراجعة</>}</Button><p className="mt-4 text-center text-xs leading-6 text-[hsl(var(--muted-foreground))]">لا تكتب كلمات المرور أو البيانات الشخصية الحساسة.</p>{(analyze.isError || create.isError) && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر إرسال البلاغ حالياً. حاول مرة أخرى بعد قليل.</div>}</>}
        </section>
      </div>
      <div className="mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.24)] bg-white/70 p-4 text-xs leading-6 text-[hsl(var(--muted-foreground))]"><Info className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" /><p>هذه الصفحة مخصصة لتسجيل البلاغات للمراجعة. إرسال البلاغ لا يعني إرسال خدمة طوارئ أو اتخاذ إجراء ميداني تلقائي.</p></div>
    </main>
  </div>;
}

function AnalystRoutes() {
  return <Shell><Switch><Route path="/" component={Overview} /><Route path="/analyze" component={Analyze} /><Route path="/reports" component={Reports} /><Route path="/reports/:id" component={ReportDetail} /><Route path="/locations" component={Locations} /><Route path="/analytics" component={Analytics} /><Route path="/about" component={About} /><Route component={NotFound} /></Switch></Shell>;
}

function Router() {
  return <Switch><Route path="/submit" component={PublicSubmit} /><Route component={AnalystRoutes} /></Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><DemoAccessDialog /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
