import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// ---------------------------------------------------------------------------
// Client-side analysis logic mirroring api-server/src/lib/report-analysis.ts
// Used in static mode (GitHub Pages) where there is no backend.
// ---------------------------------------------------------------------------
function staticAnalyzeText(text: string) {
  const normalized = text.toLowerCase();
  const hasAny = (terms: string[]) => terms.some((t) => normalized.includes(t));

  const locationMap: Array<[string, string]> = [
    ['جنزور', 'Janzour'], ['تاجوراء', 'Tajoura'], ['طرابلس', 'Tripoli'],
    ['مصراتة', 'Misrata'], ['بنغازي', 'Benghazi'], ['الزاوية', 'Zawiya'],
    ['غريان', 'Gharyan'], ['زليتن', 'Zliten'], ['سبها', 'Sabha'],
  ];

  const peopleAtRisk = hasAny(['طفل','أطفال','مصاب','إصابة','محاصر','عالق','إنقاذ','إسعاف','نجدة','شخص']);

  let incidentClass = 'Other';
  let priority = 'Low';
  let requiredSupport = 'None';

  if (hasAny(['حريق','انفجار','دخان','نار'])) {
    incidentClass = 'Fire / Explosion';
    priority = peopleAtRisk ? 'Critical' : 'High';
    requiredSupport = peopleAtRisk ? 'Firefighting / Rescue' : 'Firefighting';
  } else if (hasAny(['مطر','أمطار','فيضان','سيول','مياه','عاصفة','رياح'])) {
    incidentClass = 'Flood / Severe Weather';
    priority = hasAny(['فيضان','سيول','غرق']) ? 'High' : 'Medium';
    requiredSupport = hasAny(['طريق','شارع','مسكر','مغلق']) ? 'Traffic Management' : 'Rescue';
  } else if (hasAny(['كهرباء','مياه','صرف صحي','وقود','محطة','بنية تحتية'])) {
    incidentClass = 'Infrastructure / Utilities';
    priority = 'Medium';
    requiredSupport = 'None';
  } else if (hasAny(['حادث','طريق','مرور','سيارة','سيارات','ازدحام'])) {
    incidentClass = 'Road / Transportation';
    priority = peopleAtRisk ? 'High' : 'Medium';
    requiredSupport = peopleAtRisk ? 'Medical / Traffic Management' : 'Traffic Management';
  } else if (hasAny(['إصابة','مصاب','محاصر','عالق','إسعاف','إنقاذ','حالة صحية'])) {
    incidentClass = 'People at Risk / Medical';
    priority = 'High';
    requiredSupport = 'Medical / Rescue';
  }

  const location = locationMap.find(([ar]) => normalized.includes(ar))?.[1] ?? 'Unknown';
  const relevance = incidentClass === 'Other' ? 'Irrelevant' : 'Relevant';

  let summary = `بلاغ يتعلق بـ ${incidentClass.toLowerCase()} في ${location}.`;
  if (incidentClass === 'Fire / Explosion')
    summary = peopleAtRisk
      ? `بلاغ عن اندلاع حريق في ${location} مع وجود أشخاص معرضين للخطر، مما يتطلب استجابة عاجلة.`
      : `بلاغ عن حريق في ${location} يتطلب دعماً من فرق الإطفاء.`;
  else if (incidentClass === 'Flood / Severe Weather')
    summary = `بلاغ عن أحوال جوية ومياه متجمعة في ${location} قد تؤثر على حركة المرور.`;
  else if (incidentClass === 'Infrastructure / Utilities')
    summary = `بلاغ عن مشكلة في البنية التحتية أو الخدمات العامة في ${location}.`;
  else if (incidentClass === 'Road / Transportation')
    summary = `بلاغ عن حادث أو خطر مروري في ${location} يحتاج إلى متابعة وتنظيم حركة المرور.`;
  else if (incidentClass === 'People at Risk / Medical')
    summary = `بلاغ عن شخص يحتاج إلى مساعدة أو رعاية طبية في ${location}.`;

  return { incidentClass, priority, location, peopleAtRisk, requiredSupport, relevance, summary };
}
// ---------------------------------------------------------------------------

// In development the API runs at localhost:3001.
// In production (GitHub Pages static deploy) we serve data from /data/*.json
// because there is no server to run. A static mode flag is injected via
// VITE_STATIC_MODE=true when building for GitHub Pages.
const isStatic = import.meta.env.VITE_STATIC_MODE === 'true';

if (isStatic) {
  // Patch global fetch to intercept API calls and redirect them to static JSON files.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

    // Only intercept relative /api/* calls
    if (url.startsWith('/api/') || url.includes('/api/')) {
      const path = url.includes('/api/') ? url.substring(url.indexOf('/api/')) : url;

      // Map API routes → static JSON files
      let file: string | null = null;

      if (path === '/api/dashboard/summary')  file = `${base}/data/dashboard-summary.json`;
      else if (path === '/api/analytics/summary' || path.startsWith('/api/analytics/summary')) file = `${base}/data/analytics-summary.json`;
      else if (path === '/api/locations/summary') file = `${base}/data/locations-summary.json`;
      // POST /api/reports/analyze — MUST come before the generic /api/reports handler
      else if (path.startsWith('/api/reports/analyze')) {
        let text = '';
        try { text = JSON.parse(init?.body as string)?.text ?? ''; } catch { /* ignore */ }
        const result = staticAnalyzeText(text);
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      else if (path.match(/^\/api\/reports\/\d+$/)) {
        // Single report — fetch from reports.json and filter
        const id = Number(path.split('/').pop());
        const res = await originalFetch(`${base}/data/reports.json`, init);
        const rawAll = await res.json();
        const all = Array.isArray(rawAll) ? rawAll : (rawAll?.value ?? []);
        const report = all.find((r: { id: number }) => r.id === id);
        if (!report) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
        return new Response(JSON.stringify(report), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      else if (path === '/api/reports' || path.startsWith('/api/reports?')) {
        // List reports — fetch from reports.json and apply basic filters
        const fetchUrl = new URL(path, window.location.href);
        const params = fetchUrl.searchParams;
        const res = await originalFetch(`${base}/data/reports.json`, init);
        const raw = await res.json();
        // Support both array and { value: [...] } shapes
        let all: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw?.value ?? []);

        const search = params.get('search')?.toLowerCase();
        const incidentClass = params.get('incidentClass');
        const priority = params.get('priority');
        const location = params.get('location');
        const sort = params.get('sort') ?? 'date';

        if (search) all = all.filter(r => [r.originalText, r.summary, r.location].some(v => String(v).toLowerCase().includes(search)));
        if (incidentClass) all = all.filter(r => r.incidentClass === incidentClass);
        if (priority) all = all.filter(r => r.priority === priority);
        if (location) all = all.filter(r => String(r.location).toLowerCase() === location.toLowerCase());

        if (sort === 'priority') {
          const order = ['Critical', 'High', 'Medium', 'Low'];
          all.sort((a, b) => order.indexOf(String(a.priority)) - order.indexOf(String(b.priority)));
        } else if (sort === 'incidentClass') {
          all.sort((a, b) => String(a.incidentClass).localeCompare(String(b.incidentClass)));
        }

        return new Response(JSON.stringify(all), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // POST /api/reports — store the new report in sessionStorage so it persists within the tab
      else if (path === '/api/reports' && (!init?.method || init.method.toUpperCase() === 'POST')) {
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(init?.body as string); } catch { /* ignore */ }
        const now = new Date().toISOString();
        const id = Date.now();
        const report = { id, createdAt: now, analysisTime: '0ms', ...body };
        try {
          const existing = JSON.parse(sessionStorage.getItem('static_reports') ?? '[]');
          existing.unshift(report);
          sessionStorage.setItem('static_reports', JSON.stringify(existing));
        } catch { /* ignore */ }
        return new Response(JSON.stringify(report), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      // Other mutations (PATCH/DELETE) are no-ops in static mode
      else if (init?.method && ['POST', 'PATCH', 'DELETE'].includes(init.method.toUpperCase())) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (file) {
        // For analytics/summary with filters: fetch the full file then filter client-side
        if (path.startsWith('/api/analytics/summary?')) {
          const fetchUrl = new URL(path, window.location.href);
          const params = fetchUrl.searchParams;
          const res = await originalFetch(`${base}/data/reports.json`, init);
          const rawAll = await res.json();
          let all: Record<string, unknown>[] = Array.isArray(rawAll) ? rawAll : (rawAll?.value ?? []);

          const incidentClass = params.get('incidentClass');
          const priority = params.get('priority');
          const loc = params.get('location');
          const par = params.get('peopleAtRisk');
          const dateFrom = params.get('dateFrom');
          const dateTo = params.get('dateTo');

          if (incidentClass) all = all.filter(r => r.incidentClass === incidentClass);
          if (priority) all = all.filter(r => r.priority === priority);
          if (loc) all = all.filter(r => String(r.location).toLowerCase() === loc.toLowerCase());
          if (par === 'true') all = all.filter(r => r.peopleAtRisk === true);
          if (par === 'false') all = all.filter(r => r.peopleAtRisk === false);
          if (dateFrom) all = all.filter(r => new Date(String(r.createdAt)) >= new Date(dateFrom));
          if (dateTo) {
            const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
            all = all.filter(r => new Date(String(r.createdAt)) <= to);
          }

          const countBy = (items: string[]) => {
            const m = new Map<string, number>();
            for (const v of items) m.set(v, (m.get(v) ?? 0) + 1);
            return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
          };

          const summary = {
            byIncidentClass: countBy(all.map(r => String(r.incidentClass))),
            byPriority: countBy(all.map(r => String(r.priority))),
            byLocation: countBy(all.filter(r => r.location).map(r => String(r.location))),
            bySupport: countBy(all.filter(r => r.requiredSupport).map(r => String(r.requiredSupport))),
            peopleAtRisk: all.filter(r => r.peopleAtRisk === true).length,
            totalFiltered: all.length,
            evaluation: { accuracy: 0.86, precision: 0.82, recall: 0.79, macroF1: 0.8, confusionMatrix: [[8,1,0,0,0,0],[1,7,1,0,0,0],[0,1,8,0,0,0],[0,0,1,7,1,0],[0,0,0,1,8,0],[0,0,0,0,1,7]] },
          };
          return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return originalFetch(file, init);
      }
    }

    return originalFetch(input, init);
  };
} else {
  setBaseUrl(import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : ''));
}

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
