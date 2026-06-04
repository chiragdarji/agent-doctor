import chalk from 'chalk';
import { Command } from 'commander';
import { resolve, relative, dirname, join, basename, extname } from 'node:path';
import { existsSync, watch as fsWatch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { analyse, analyseAll, analyseCrossFile } from './analyser/index.js';
import { parseFile } from './parser/index.js';
import { loadConfig } from './config.js';
import { discoverFiles, discoverOrgFiles } from './discovery.js';
import { applyFixes } from './fixer.js';
import { initFile } from './init.js';
import {
  formatResult,
  formatResults,
  formatResultJson,
  formatResultsJson,
} from './output/formatter.js';
import { formatReadinessReport } from './output/readiness-reporter.js';
import { formatOrgReport, formatOrgReportJson } from './output/org-reporter.js';
import { runHistory } from './analyser/history.js';
import { formatHistory, formatHistoryJson } from './output/history-reporter.js';
import { formatCompare, formatCompareJson } from './output/compare-reporter.js';
import type { AnalysisResult, Severity } from './types.js';
import type { InitType } from './init.js';

const program = new Command();

declare const __CLI_VERSION__: string;

program
  .name('agent-doctor')
  .description('Semantic health check for AI agent instruction files')
  .version(__CLI_VERSION__);

program
  .argument('[file]', 'Path to the instruction file to analyse')
  .option('--all', 'Discover and analyse all instruction files in the project')
  .option('--fail-on <severity>', 'Exit with code 1 if any issue meets this severity', 'critical')
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--structural-only', 'Skip semantic layer (no API key required)')
  .option(
    '--model <id>',
    'Override LLM model (e.g. gpt-4o uses OPENAI_API_KEY; claude-* uses ANTHROPIC_API_KEY)',
  )
  .option('--fix', 'Auto-fix structural issues in-place (todo-in-instructions, unclosed-code-block, empty-section, missing-success-criteria)')
  .option('--dry-run', 'Preview --fix changes without writing to disk')
  .option('--watch', 'Re-run analysis on every file save — Ctrl+C to stop (single file only)')
  .option('--init', 'Scaffold a new agent instruction file template in the current directory')
  .option('--type <type>', 'Template type for --init: claude | cursor | agents', 'claude')
  .option('--force', 'Overwrite existing files without prompting (use with --init)')
  .option('--readiness-report', 'Print a detailed per-dimension readiness breakdown instead of the standard issue list')
  .option('--history [n]', 'Show score trend for the last n git commits (default: 10)')
  .option('--org [dir]', 'Org-level health dashboard — recursively discovers all instruction files under dir (default: cwd)')
  .option('--compare <ref>', 'Compare current file against a git ref (HEAD~1) or another file path')
  .option('--mcp', 'Start MCP server mode (v0.2)')
  .action(async (file: string | undefined, opts: {
    all?: boolean;
    failOn: string;
    format: string;
    structuralOnly?: boolean;
    model?: string;
    fix?: boolean;
    dryRun?: boolean;
    watch?: boolean;
    init?: boolean;
    type: string;
    force?: boolean;
    readinessReport?: boolean;
    history?: string | boolean;
    org?: string | boolean;
    compare?: string;
    mcp?: boolean;
  }) => {
    if (opts.init) {
      const VALID_TYPES: InitType[] = ['claude', 'cursor', 'agents'];
      const cwd = process.cwd();
      let initType: InitType;
      if (VALID_TYPES.includes(opts.type as InitType)) {
        initType = opts.type as InitType;
      } else {
        process.stderr.write(`Unknown --type "${opts.type}" — valid values: claude | cursor | agents. Defaulting to claude.\n`);
        initType = 'claude';
      }

      try {
        const result = await initFile({ type: initType, cwd, force: opts.force ?? false });
        const verb = result.existed ? 'Overwrote' : 'Created';
        const relPath = relative(cwd, result.filePath);
        process.stdout.write(`✅  ${verb} ${result.filePath}\n`);
        process.stdout.write(`    Run \`npx @chiragdarji/agent-doctor ${relPath}\` to validate.\n`);
      } catch (err) {
        process.stderr.write(`${String(err)}\n`);
        process.exit(1);
      }
      return;
    }

    if (opts.mcp) {
      // Spawn the MCP server entry point from the same dist directory
      const mcpEntry = join(dirname(fileURLToPath(import.meta.url)), 'mcp-server.js');
      const child = spawn(process.execPath, [mcpEntry], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
      return;
    }

    if (opts.compare !== undefined) {
      if (file === undefined) {
        process.stderr.write(chalk.red('Error: --compare requires a file argument\n'));
        process.exit(2);
      }
      const cwd = process.cwd();
      const absFile = resolve(cwd, file);
      const config = loadConfig(cwd);
      if (opts.model !== undefined && opts.model.length > 0) config.model = opts.model;

      // Determine if the ref is an existing file path or a git ref
      const isFilePath = existsSync(opts.compare);

      let beforeResult: AnalysisResult;
      let beforeLabel: string;

      if (isFilePath) {
        // Compare two files
        const compareConfig = { ...config, layers: ['structural'] as typeof config.layers };
        try {
          beforeResult = await analyse(resolve(cwd, opts.compare), compareConfig);
        } catch (err) {
          process.stderr.write(`Error analysing ${opts.compare}: ${String(err)}\n`);
          process.exit(2);
        }
        beforeLabel = opts.compare;
      } else {
        // Compare against a git ref — use git show to get the historical content
        const { execFileSync } = await import('node:child_process');
        const fileDir = dirname(absFile);

        let gitRoot: string;
        try {
          gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
            encoding: 'utf8',
            cwd: fileDir,
          }).trim();
        } catch {
          process.stderr.write('Error: --compare with a git ref requires a git repository\n');
          process.exit(2);
        }

        const gitRelPath = relative(gitRoot, absFile);
        let rawContent: string;
        try {
          rawContent = execFileSync('git', ['show', `${opts.compare}:${gitRelPath}`], {
            encoding: 'utf8',
            cwd: gitRoot,
          });
        } catch {
          process.stderr.write(`Error: could not read "${opts.compare}:${gitRelPath}" from git. Check that the ref is valid.\n`);
          process.exit(2);
        }

        // Parse and analyse the historical content in-memory (structural only)
        const { parseMarkdownContent, parseMdcContent } = await import('./parser/index.js');
        const { runStructuralAnalysis } = await import('./analyser/structural.js');
        const { calculateScore, calculateGrade, computeReadiness } = await import('./analyser/index.js');

        const isMdc = extname(file).toLowerCase() === '.mdc';
        const structuralConfig = { ...config, layers: ['structural'] as typeof config.layers };

        const parsed = isMdc
          ? parseMdcContent(file, rawContent)
          : parseMarkdownContent(file, rawContent);
        const issues = runStructuralAnalysis(parsed, structuralConfig, []);
        const score = calculateScore(issues);
        const { readinessScore, readinessDimensions } = computeReadiness(issues);

        beforeResult = {
          file: absFile,
          score,
          grade: calculateGrade(score),
          issues,
          tokenCount: parsed.tokenCount,
          analysedAt: new Date().toISOString(),
          layers: ['structural'],
          readinessScore,
          readinessDimensions,
        };
        beforeLabel = opts.compare;
      }

      // Analyse the current (after) file — structural only for speed and symmetry
      const afterConfig = { ...config, layers: ['structural'] as typeof config.layers };
      let afterResult: AnalysisResult;
      try {
        afterResult = await analyse(absFile, afterConfig);
      } catch (err) {
        process.stderr.write(`Error analysing ${file}: ${String(err)}\n`);
        process.exit(2);
      }

      if (opts.format === 'json') {
        process.stdout.write(formatCompareJson(beforeResult, afterResult, beforeLabel, file) + '\n');
      } else {
        process.stdout.write(formatCompare(beforeResult, afterResult, beforeLabel, file) + '\n');
      }
      process.exit(0);
    }

    if (opts.history !== undefined) {
      if (file === undefined) {
        process.stderr.write('--history requires a file argument, e.g.: agent-doctor CLAUDE.md --history\n');
        process.exit(2);
      }
      const cwd = process.cwd();
      const n = typeof opts.history === 'string'
        ? Math.max(1, parseInt(opts.history, 10) || 10)
        : 10;
      const config = loadConfig(cwd);
      try {
        const filePath = resolve(cwd, file);
        const entries = await runHistory(filePath, config, n);
        if (opts.format === 'json') {
          process.stdout.write(formatHistoryJson(entries, filePath) + '\n');
        } else {
          process.stdout.write(formatHistory(entries, filePath) + '\n');
        }
      } catch (err) {
        process.stderr.write(`${String(err)}\n`);
        process.exit(2);
      }
      return;
    }

    if (opts.org !== undefined) {
      const cwd = process.cwd();
      const orgRoot = typeof opts.org === 'string' && opts.org.length > 0
        ? resolve(cwd, opts.org)
        : cwd;
      const config = loadConfig(cwd);
      if (opts.model !== undefined && opts.model.length > 0) config.model = opts.model;
      config.layers = ['structural'];
      if (opts.format !== 'json') {
        process.stderr.write(chalk.dim('ℹ  --org runs structural analysis only (no LLM cost)\n'));
      }
      const discovered = discoverOrgFiles(orgRoot);
      if (discovered.length === 0) {
        process.stdout.write(chalk.yellow('No agent instruction files found.\n'));
        process.exit(0);
      }
      try {
        const results = await analyseAll(discovered, config);
        if (opts.format === 'json') {
          process.stdout.write(formatOrgReportJson(results, orgRoot) + '\n');
        } else {
          process.stdout.write(formatOrgReport(results, orgRoot) + '\n');
        }
      } catch (err) {
        process.stderr.write(`Error during org analysis: ${String(err)}\n`);
        process.exit(2);
      }
      return;
    }

    const cwd = process.cwd();
    const config = loadConfig(cwd);

    if (opts.model !== undefined && opts.model.length > 0) {
      config.model = opts.model;
    }

    if (opts.structuralOnly) {
      config.layers = ['structural'];
    }

    const VALID_SEVERITIES: Severity[] = ['critical', 'warning', 'suggestion'];
    const failOn = VALID_SEVERITIES.includes(opts.failOn as Severity)
      ? (opts.failOn as Severity)
      : 'critical';
    config.failOn = failOn;

    let results: AnalysisResult[];

    if (opts.all) {
      const discovered = discoverFiles(cwd);
      if (discovered.length === 0) {
        process.stderr.write('No agent instruction files found in this project.\n');
        process.exit(0);
      }
      try {
        results = await analyseAll(discovered, config);
      } catch (err) {
        process.stderr.write(`Error during analysis: ${String(err)}\n`);
        process.exit(2);
      }
      // Cross-file conflict detection — semantic only, requires 2+ files
      if (discovered.length >= 2 && config.layers.includes('semantic')) {
        try {
          const fileContents = discovered.map((fp) => {
            const parsed = parseFile(fp);
            return { filePath: fp, content: parsed.content };
          });
          const crossResult = await analyseCrossFile(fileContents, config);
          if (crossResult !== null) results.push(crossResult);
        } catch (err) {
          process.stderr.write(`Cross-file analysis error: ${String(err)}\n`);
        }
      }
    } else if (file !== undefined) {
      const filePath = resolve(cwd, file);
      if (!existsSync(filePath)) {
        process.stderr.write(`File not found: ${filePath}\n`);
        process.exit(2);
      }
      try {
        results = [await analyse(filePath, config)];
      } catch (err) {
        process.stderr.write(`Error analysing ${file}: ${String(err)}\n`);
        process.exit(2);
      }
    } else {
      // No file and no --all: auto-detect a single well-known file
      const candidates = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules'];
      const found = candidates.find((c) => existsSync(resolve(cwd, c)));
      if (found === undefined) {
        program.help();
        process.exit(0);
      }
      try {
        results = [await analyse(resolve(cwd, found), config)];
      } catch (err) {
        process.stderr.write(`Error analysing ${found}: ${String(err)}\n`);
        process.exit(2);
      }
    }

    // Output
    if (opts.format === 'json') {
      process.stdout.write(
        (results.length === 1
          ? formatResultJson(results[0]!)
          : formatResultsJson(results)) + '\n',
      );
    } else if (opts.readinessReport) {
      process.stdout.write(formatReadinessReport(results) + '\n');
    } else {
      process.stdout.write(
        (results.length === 1 ? formatResult(results[0]!) : formatResults(results)) + '\n',
      );
    }

    // Watch mode — re-run analysis on file save (single file only, no --fix)
    if (opts.watch) {
      const watchTarget = results[0]?.file;
      if (!watchTarget) {
        process.stderr.write('--watch requires a single file target.\n');
        process.exit(2);
      }
      if (opts.all) {
        process.stderr.write('--watch cannot be combined with --all.\n');
        process.exit(2);
      }
      process.stdout.write(`\n👁  Watching ${basename(watchTarget)} for changes… (Ctrl+C to stop)\n`);

      let debounce: ReturnType<typeof setTimeout> | undefined;
      fsWatch(watchTarget, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          void (async () => {
            process.stdout.write(`\n${'─'.repeat(44)}\n`);
            process.stdout.write(`🔄  File changed, re-analysing…\n`);
            process.stdout.write(`${'─'.repeat(44)}\n`);
            try {
              const refreshed = await analyse(watchTarget, config);
              process.stdout.write(
                opts.format === 'json'
                  ? formatResultJson(refreshed) + '\n'
                  : opts.readinessReport
                    ? formatReadinessReport([refreshed]) + '\n'
                    : formatResult(refreshed) + '\n',
              );
            } catch (err) {
              process.stderr.write(`Error re-analysing: ${String(err)}\n`);
            }
          })();
        }, 300);
      });

      // Keep the process alive until Ctrl+C
      process.stdin.resume();
      return;
    }

    // Apply fixes if requested
    if (opts.fix) {
      for (const result of results) {
        try {
          const fixResult = await applyFixes(result.file, result.issues, { dryRun: opts.dryRun ?? false });
          if (opts.dryRun && fixResult.preview !== undefined) {
            process.stdout.write(`\n--- Dry-run preview: ${result.file} ---\n`);
            process.stdout.write(fixResult.preview);
            process.stdout.write(`\n--- End preview ---\n`);
          } else if (fixResult.fixed.length > 0) {
            process.stdout.write(`✅  Fixed: ${fixResult.fixed.join(', ')} in ${result.file}\n`);
          }
          if (fixResult.skipped.length > 0) {
            process.stdout.write(
              `⏭   Skipped (no auto-fix): ${fixResult.skipped.join(', ')}\n`,
            );
          }
          if (fixResult.fixed.length === 0 && fixResult.skipped.length === 0) {
            process.stdout.write(`✅  Nothing to fix in ${result.file}\n`);
          }
        } catch (err) {
          process.stderr.write(`Error applying fixes to ${result.file}: ${String(err)}\n`);
        }
      }
    }

    // Exit code
    const SEVERITY_ORDER: Severity[] = ['suggestion', 'warning', 'critical'];
    const failIdx = SEVERITY_ORDER.indexOf(failOn);
    const hasFailure = results.some((r) =>
      r.issues.some((i) => SEVERITY_ORDER.indexOf(i.severity) >= failIdx),
    );

    process.exit(hasFailure ? 1 : 0);
  });

program.parse();
