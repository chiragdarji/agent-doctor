import type { AnalysisResult, Issue, Severity } from '../types.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'suggestion'];

const GRADE_COLOR: Record<string, string> = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#f59e0b',
  D: '#f97316',
  F: '#ef4444',
};

const SEV_COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  suggestion: '#3b82f6',
};

const SEV_LABEL: Record<Severity, string> = {
  critical: '🔴 Critical',
  warning: '⚠️ Warning',
  suggestion: '💡 Suggestion',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBar(value: number): string {
  const pct = Math.round(value);
  const color = pct >= 85 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return `<div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${color}"></div><span class="bar-val">${pct}</span></div>`;
}

function renderIssue(issue: Issue, idx: number): string {
  const color = SEV_COLOR[issue.severity];
  const label = SEV_LABEL[issue.severity];
  return `
    <details class="issue" id="issue-${idx}">
      <summary>
        <span class="badge" style="background:${color}">${label}</span>
        <span class="rule-id">${esc(issue.ruleId)}</span>
        ${issue.line !== undefined ? `<span class="line-num">line ${issue.line}</span>` : ''}
        <span class="msg">${esc(issue.message)}</span>
      </summary>
      <div class="issue-body">
        ${issue.context ? `<pre class="ctx">${esc(issue.context)}</pre>` : ''}
        <p class="suggestion"><strong>Suggestion:</strong> ${esc(issue.suggestion)}</p>
      </div>
    </details>`;
}

function renderResult(result: AnalysisResult): string {
  const gradeColor = GRADE_COLOR[result.grade] ?? '#6b7280';
  const critical = result.issues.filter((i) => i.severity === 'critical');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  const suggestions = result.issues.filter((i) => i.severity === 'suggestion');

  const issueHtml = result.issues.length === 0
    ? `<p class="no-issues">✅ No issues found</p>`
    : SEVERITY_ORDER.flatMap((sev) =>
        result.issues
          .filter((i) => i.severity === sev)
          .map((issue, idx) => renderIssue(issue, idx)),
      ).join('');

  const dims = result.readinessDimensions;

  return `
  <section class="file-card">
    <div class="file-header">
      <span class="file-path">${esc(result.file)}</span>
      <span class="grade" style="color:${gradeColor}">${result.grade}</span>
      <span class="score">${result.score} / 100</span>
    </div>

    <div class="summary-row">
      ${critical.length > 0 ? `<span class="chip chip-critical">${critical.length} critical</span>` : ''}
      ${warnings.length > 0 ? `<span class="chip chip-warning">${warnings.length} warning</span>` : ''}
      ${suggestions.length > 0 ? `<span class="chip chip-suggestion">${suggestions.length} suggestion</span>` : ''}
      ${result.issues.length === 0 ? `<span class="chip chip-pass">All clear</span>` : ''}
      <span class="chip chip-tokens">${result.tokenCount} tokens</span>
    </div>

    <div class="readiness">
      <h3>Agent Readiness <span class="readiness-score">${result.readinessScore} / 100</span></h3>
      <table class="dims">
        <tr><th>Observable</th><td>${renderBar(dims.observable)}</td></tr>
        <tr><th>Bounded</th><td>${renderBar(dims.bounded)}</td></tr>
        <tr><th>Reversible</th><td>${renderBar(dims.reversible)}</td></tr>
        <tr><th>Tooled</th><td>${renderBar(dims.tooled)}</td></tr>
        <tr><th>Documented</th><td>${renderBar(dims.documented)}</td></tr>
      </table>
    </div>

    <div class="issues">
      <h3>Issues (${result.issues.length})</h3>
      ${issueHtml}
    </div>
  </section>`;
}

/**
 * Generates a self-contained HTML health report for one or more analysis results.
 * The output is a complete HTML document with inline CSS and no external dependencies.
 */
export function formatHtml(results: AnalysisResult[]): string {
  const totalIssues = results.flatMap((r) => r.issues).length;
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Doctor Report</title>
<style>
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --accent: #38bdf8;
    --radius: 8px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #0284c7;
    }
  }
  :root[data-theme="light"] {
    --bg: #f8fafc;
    --surface: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
    --accent: #0284c7;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; line-height: 1.6; padding: 16px; }
  a { color: var(--accent); }

  header { display: flex; align-items: center; gap: 16px; padding: 20px 0 24px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  header h1 { font-size: 22px; }
  .meta { color: var(--muted); font-size: 12px; }
  .theme-btn { margin-left: auto; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 4px 10px; border-radius: var(--radius); cursor: pointer; font-size: 12px; }

  .overall { display: flex; gap: 16px; margin: 20px 0; flex-wrap: wrap; }
  .stat-tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; min-width: 120px; text-align: center; }
  .stat-tile .val { font-size: 32px; font-weight: 700; }
  .stat-tile .lbl { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }

  .file-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 20px; overflow: hidden; }
  .file-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--bg); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .file-path { font-family: monospace; font-size: 13px; flex: 1; word-break: break-all; }
  .grade { font-size: 28px; font-weight: 800; }
  .score { color: var(--muted); font-size: 13px; }

  .summary-row { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 20px; border-bottom: 1px solid var(--border); }
  .chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .chip-critical { background: #450a0a; color: #fca5a5; }
  .chip-warning { background: #451a03; color: #fcd34d; }
  .chip-suggestion { background: #172554; color: #93c5fd; }
  .chip-pass { background: #052e16; color: #86efac; }
  .chip-tokens { background: var(--border); color: var(--muted); }

  .readiness, .issues { padding: 16px 20px; }
  .readiness { border-bottom: 1px solid var(--border); }
  .readiness h3, .issues h3 { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
  .readiness-score { font-size: 15px; color: var(--text); font-weight: 700; }

  table.dims { width: 100%; border-collapse: collapse; }
  table.dims th { text-align: left; font-weight: 500; color: var(--muted); padding: 3px 0; width: 100px; font-size: 12px; }
  table.dims td { padding: 3px 0 3px 8px; }
  .bar-wrap { display: flex; align-items: center; gap: 8px; }
  .bar { height: 8px; border-radius: 4px; min-width: 2px; transition: width .3s; }
  .bar-val { font-size: 11px; color: var(--muted); width: 24px; }

  .no-issues { color: #86efac; font-size: 13px; padding: 8px 0; }

  details.issue { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; overflow: hidden; }
  details.issue summary { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; cursor: pointer; list-style: none; flex-wrap: wrap; }
  details.issue summary::-webkit-details-marker { display: none; }
  details.issue summary:hover { background: var(--bg); }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 4px; color: #fff; font-weight: 600; white-space: nowrap; }
  .rule-id { font-family: monospace; font-size: 12px; color: var(--accent); white-space: nowrap; }
  .line-num { font-family: monospace; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .msg { font-size: 13px; flex: 1; }
  .issue-body { padding: 10px 14px; border-top: 1px solid var(--border); background: var(--bg); }
  .ctx { font-family: monospace; font-size: 12px; background: var(--surface); padding: 8px 12px; border-radius: 4px; overflow-x: auto; margin-bottom: 8px; white-space: pre-wrap; word-break: break-all; }
  .suggestion { font-size: 13px; color: var(--muted); }

  footer { color: var(--muted); font-size: 11px; text-align: center; padding: 20px 0 8px; border-top: 1px solid var(--border); margin-top: 20px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>🩺 Agent Doctor Report</h1>
    <p class="meta">Generated ${esc(generatedAt)} · ${results.length} file${results.length !== 1 ? 's' : ''} · ${totalIssues} total issue${totalIssues !== 1 ? 's' : ''}</p>
  </div>
  <button class="theme-btn" onclick="toggleTheme()">Toggle theme</button>
</header>

<div class="overall">
  <div class="stat-tile">
    <div class="val">${avgScore}</div>
    <div class="lbl">Avg score</div>
  </div>
  <div class="stat-tile">
    <div class="val">${results.filter((r) => r.issues.filter((i) => i.severity === 'critical').length > 0).length}</div>
    <div class="lbl">Files with criticals</div>
  </div>
  <div class="stat-tile">
    <div class="val">${totalIssues}</div>
    <div class="lbl">Total issues</div>
  </div>
  <div class="stat-tile">
    <div class="val">${results.filter((r) => r.issues.length === 0).length}</div>
    <div class="lbl">Clean files</div>
  </div>
</div>

${results.map(renderResult).join('')}

<footer>
  Generated by <a href="https://github.com/chiragdarji/agent-doctor">@chiragdarji/agent-doctor</a>
</footer>

<script>
function toggleTheme() {
  var r = document.documentElement;
  var t = r.getAttribute('data-theme');
  r.setAttribute('data-theme', t === 'light' ? 'dark' : 'light');
  try { localStorage.setItem('agent-doctor-theme', r.getAttribute('data-theme')); } catch(e) {}
}
try {
  var saved = localStorage.getItem('agent-doctor-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
} catch(e) {}
</script>
</body>
</html>`;
}
