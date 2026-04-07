import { Command } from 'commander';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { analyse, analyseAll } from './analyser/index.js';
import { loadConfig } from './config.js';
import { discoverFiles } from './discovery.js';
import {
  formatResult,
  formatResults,
  formatResultJson,
  formatResultsJson,
} from './output/formatter.js';
import type { AnalysisResult, Severity } from './types.js';

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
  .option('--mcp', 'Start MCP server mode (v0.2)')
  .action(async (file: string | undefined, opts: {
    all?: boolean;
    failOn: string;
    format: string;
    structuralOnly?: boolean;
    model?: string;
    mcp?: boolean;
  }) => {
    if (opts.mcp) {
      // Spawn the MCP server entry point from the same dist directory
      const mcpEntry = join(dirname(fileURLToPath(import.meta.url)), 'mcp-server.js');
      const child = spawn(process.execPath, [mcpEntry], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
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
    } else {
      process.stdout.write(
        (results.length === 1 ? formatResult(results[0]!) : formatResults(results)) + '\n',
      );
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
