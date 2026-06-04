#!/usr/bin/env node
/**
 * GitHub Actions entrypoint for agent-doctor.
 * Reads action inputs, runs the CLI, and sets action outputs.
 *
 * Compatible with `runs: using: node20` in action.yml.
 * Does NOT require the package to be installed — uses the bundled dist/cli.js.
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// GitHub Actions helpers
// ---------------------------------------------------------------------------

function getInput(name) {
  return process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`]?.trim() ?? '';
}

function setOutput(name, value) {
  const outputFile = process.env['GITHUB_OUTPUT'];
  if (outputFile) {
    writeFileSync(outputFile, `${name}=${String(value)}\n`, { flag: 'a' });
  } else {
    // Fallback for older Actions runners
    process.stdout.write(`::set-output name=${name}::${String(value)}\n`);
  }
}

function info(msg) {
  process.stdout.write(`${msg}\n`);
}

function error(msg) {
  process.stderr.write(`::error::${msg}\n`);
}

// ---------------------------------------------------------------------------
// Build CLI args from action inputs
// ---------------------------------------------------------------------------

const files = getInput('files');
const failOn = getInput('fail-on') || 'critical';
const structuralOnly = getInput('structural-only') === 'true';
const model = getInput('model');
const anthropicKey = getInput('anthropic-api-key') || process.env['ANTHROPIC_API_KEY'] || '';
const openaiKey = getInput('openai-api-key') || process.env['OPENAI_API_KEY'] || '';
const format = getInput('format') || 'json';

const cliPath = resolve(__dirname, 'dist', 'cli.js');

const args = ['--format', 'json', '--fail-on', failOn];

if (files.trim()) {
  // Multiple files: run once per file and collect results
} else {
  args.push('--all');
}

if (structuralOnly) args.push('--structural-only');
if (model) args.push('--model', model);

// Set API key env vars from action inputs (override env if explicitly provided)
const env = { ...process.env };
if (anthropicKey) env['ANTHROPIC_API_KEY'] = anthropicKey;
if (openaiKey) env['OPENAI_API_KEY'] = openaiKey;

// ---------------------------------------------------------------------------
// Run analysis
// ---------------------------------------------------------------------------

info('');
info('🩺 agent-doctor — Analysing instruction files…');
info('');

let exitCode = 0;
let jsonOutput = '';

try {
  const targets = files.trim() ? files.trim().split(/\s+/) : [];

  if (targets.length > 0) {
    // Run once per explicitly listed file
    const allResults = [];
    for (const target of targets) {
      try {
        const out = execFileSync(process.execPath, [cliPath, target, '--format', 'json', '--fail-on', failOn,
          ...(structuralOnly ? ['--structural-only'] : []),
          ...(model ? ['--model', model] : []),
        ], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const parsed = JSON.parse(out.trim());
        allResults.push(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err) {
        if (err.stdout) {
          try {
            const parsed = JSON.parse(err.stdout.trim());
            allResults.push(Array.isArray(parsed) ? parsed : [parsed]);
          } catch { /* ignore parse errors */ }
        }
        exitCode = 1;
      }
    }
    jsonOutput = JSON.stringify(allResults.flat(), null, 2);
  } else {
    // --all: discover and analyse all files
    try {
      jsonOutput = execFileSync(process.execPath, [cliPath, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      jsonOutput = err.stdout ?? '[]';
      exitCode = 1;
    }
  }
} catch (err) {
  error(`agent-doctor failed to run: ${String(err)}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Parse results and set outputs
// ---------------------------------------------------------------------------

let results = [];
try {
  const parsed = JSON.parse(jsonOutput.trim());
  results = Array.isArray(parsed) ? parsed : [parsed];
} catch {
  // Non-JSON output (e.g. text format) — skip output parsing
}

if (results.length > 0) {
  const first = results[0];
  const totalIssues = results.reduce((sum, r) => sum + (r.issues?.length ?? 0), 0);
  setOutput('score', first.score ?? 0);
  setOutput('grade', first.grade ?? 'F');
  setOutput('issues-count', totalIssues);
  setOutput('readiness-score', first.readinessScore ?? 0);

  // Print human-readable summary
  for (const result of results) {
    const issues = result.issues ?? [];
    const criticals = issues.filter(i => i.severity === 'critical').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const suggestions = issues.filter(i => i.severity === 'suggestion').length;
    info(`📄 ${result.file}`);
    info(`   Score: ${result.score}/100 (${result.grade}) · Readiness: ${result.readinessScore}/100`);
    info(`   Issues: ${criticals} critical · ${warnings} warnings · ${suggestions} suggestions`);
    info('');
  }
}

process.exit(exitCode);
