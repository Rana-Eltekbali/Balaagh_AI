import type { AnalyticsSummary } from '@workspace/api-client-react';

function csvCell(value: string | number): string {
  const text = String(value);
  // Quoting alone does not prevent spreadsheet formulas in report-derived labels.
  const safe = /^[\t\r\n]|^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function analyticsCsv(data: AnalyticsSummary): string {
  const rows: Array<Array<string | number>> = [['section', 'label', 'count']];
  for (const [section, items] of [
    ['incidentClass', data.byIncidentClass],
    ['priority', data.byPriority],
    ['location', data.byLocation],
    ['support', data.bySupport],
  ] as const) {
    rows.push(...items.map(item => [section, item.label, item.count]));
  }
  rows.push(['summary', 'peopleAtRisk', data.peopleAtRisk]);
  rows.push(['summary', 'totalFiltered', data.totalFiltered]);
  // UTF-8 BOM preserves Arabic labels in spreadsheet applications.
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadAnalytics(data: AnalyticsSummary, format: 'csv' | 'json'): void {
  const contents = format === 'csv' ? analyticsCsv(data) : JSON.stringify(data, null, 2);
  const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `balaagh-analytics.${format}`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
