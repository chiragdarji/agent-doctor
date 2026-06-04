import * as vscode from 'vscode';
import { basename } from 'node:path';
import { parseFile } from '../../../src/parser/index.js';
import { runStructuralAnalysis } from '../../../src/analyser/structural.js';
import { analyseSemantics } from '../../../src/analyser/semantic.js';
import { loadConfig } from '../../../src/config.js';
import {
  createAnthropicClient,
  createOpenAIClient,
  inferProvider,
} from '../../../src/analyser/llm-client.js';
import type { Config, Issue } from '../../../src/types.js';
import type { LLMClient } from '../../../src/analyser/llm-client.js';

// ---------------------------------------------------------------------------
// File detection
// ---------------------------------------------------------------------------

const INSTRUCTION_FILENAME = /^(CLAUDE|AGENTS|GEMINI|copilot-instructions)\.md$/i;
const CURSOR_RULE_DIR = /[/\\]\.cursor[/\\]rules[/\\]/;

function isInstructionFile(doc: vscode.TextDocument): boolean {
  const name = basename(doc.fileName);
  return (
    INSTRUCTION_FILENAME.test(name) ||
    CURSOR_RULE_DIR.test(doc.fileName) ||
    doc.fileName.endsWith('.mdc')
  );
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

function toVscodeSeverity(
  sev: Issue['severity'],
  failOn: string,
): vscode.DiagnosticSeverity {
  const order = ['suggestion', 'warning', 'critical'];
  const failIdx = order.indexOf(failOn);
  const sevIdx = order.indexOf(sev);
  if (sevIdx >= failIdx) return vscode.DiagnosticSeverity.Error;
  if (sev === 'warning') return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

function issueToDiagnostic(
  issue: Issue,
  doc: vscode.TextDocument,
  failOn: string,
): vscode.Diagnostic {
  const lineIndex = Math.max(0, (issue.line ?? 1) - 1);
  const range =
    lineIndex < doc.lineCount
      ? doc.lineAt(lineIndex).range
      : new vscode.Range(0, 0, 0, 0);

  const diag = new vscode.Diagnostic(
    range,
    issue.message,
    toVscodeSeverity(issue.severity, failOn),
  );
  diag.source = 'agent-doctor';
  diag.code = issue.ruleId;
  if (issue.suggestion) {
    diag.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(doc.uri, range),
        `Fix: ${issue.suggestion}`,
      ),
    ];
  }
  return diag;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function resolveConfig(doc: vscode.TextDocument): Config {
  const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const cwd = wsFolder?.uri.fsPath ?? process.cwd();
  const config = loadConfig(cwd);

  const ext = vscode.workspace.getConfiguration('agentDoctor');
  const model = ext.get<string>('model');
  if (model) config.model = model;

  return config;
}

function resolveClient(config: Config): LLMClient | null {
  const ext = vscode.workspace.getConfiguration('agentDoctor');
  const anthropicKey =
    ext.get<string>('anthropicApiKey') || process.env['ANTHROPIC_API_KEY'] || '';
  const openaiKey =
    ext.get<string>('openaiApiKey') || process.env['OPENAI_API_KEY'] || '';

  const provider = config.provider ?? inferProvider(config.model);
  if (provider === 'openai') {
    return openaiKey ? createOpenAIClient(openaiKey) : null;
  }
  return anthropicKey ? createAnthropicClient(anthropicKey) : null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class DiagnosticsProvider {
  constructor(private collection: vscode.DiagnosticCollection) {}

  /** Runs structural analysis on save — zero API cost. */
  async analyse(doc: vscode.TextDocument): Promise<void> {
    const ext = vscode.workspace.getConfiguration('agentDoctor');
    if (!ext.get<boolean>('enableOnSave', true)) return;
    if (!isInstructionFile(doc)) return;

    const config = resolveConfig(doc);
    const failOn = ext.get<string>('failOnSeverity', 'critical');
    config.layers = ['structural'];

    try {
      const parsed = parseFile(doc.fileName);
      const issues = runStructuralAnalysis(parsed, config);
      this.collection.set(
        doc.uri,
        issues.map((i) => issueToDiagnostic(i, doc, failOn)),
      );
    } catch {
      this.collection.delete(doc.uri);
    }
  }

  /** Runs full structural + semantic analysis on demand from the command palette. */
  async runFullAnalysis(): Promise<void> {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !isInstructionFile(doc)) {
      void vscode.window.showWarningMessage(
        'Agent Doctor: Open an instruction file (CLAUDE.md, AGENTS.md, .mdc) first.',
      );
      return;
    }

    const config = resolveConfig(doc);
    const failOn =
      vscode.workspace.getConfiguration('agentDoctor').get<string>('failOnSeverity', 'critical');
    const client = resolveClient(config);

    if (!client) {
      const selected = await vscode.window.showWarningMessage(
        'Agent Doctor: No API key found for semantic analysis.',
        'Open Settings',
        'Run Structural Only',
      );
      if (selected === 'Open Settings') {
        void vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'agentDoctor.anthropicApiKey',
        );
        return;
      }
      // Fall through with structural-only
    }

    config.layers = client ? ['structural', 'semantic'] : ['structural'];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Agent Doctor: Analysing…',
        cancellable: false,
      },
      async () => {
        try {
          const parsed = parseFile(doc.fileName);
          const structuralIssues = runStructuralAnalysis(parsed, config);
          const semanticIssues =
            client !== null
              ? await analyseSemantics(parsed.content, doc.fileName, config, client)
              : [];
          const allIssues = [...structuralIssues, ...semanticIssues];
          this.collection.set(
            doc.uri,
            allIssues.map((i) => issueToDiagnostic(i, doc, failOn)),
          );
          void vscode.window.showInformationMessage(
            allIssues.length === 0
              ? 'Agent Doctor: ✓ No issues found.'
              : `Agent Doctor: ${allIssues.length} issue${allIssues.length !== 1 ? 's' : ''} found.`,
          );
        } catch (err) {
          void vscode.window.showErrorMessage(
            `Agent Doctor: Analysis failed — ${String(err)}`,
          );
        }
      },
    );
  }
}
