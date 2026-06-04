import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics.js';
import { AgentDoctorCodeActionProvider, applyFix } from './code-actions.js';

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('agent-doctor');
  const provider = new DiagnosticsProvider(collection);

  // Analyse files that are already open when the extension activates
  for (const doc of vscode.workspace.textDocuments) {
    void provider.analyse(doc);
  }

  context.subscriptions.push(
    collection,
    // Structural analysis on open + save (zero API cost)
    vscode.workspace.onDidOpenTextDocument((doc) => void provider.analyse(doc)),
    vscode.workspace.onDidSaveTextDocument((doc) => void provider.analyse(doc)),
    // Clear stale diagnostics when a file is closed
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    // Quick-fix provider for auto-fixable structural rules
    vscode.languages.registerCodeActionsProvider(
      [
        { language: 'markdown' },
        { pattern: '**/*.mdc' },
      ],
      new AgentDoctorCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    // Commands
    vscode.commands.registerCommand('agentDoctor.runFullAnalysis', () =>
      void provider.runFullAnalysis(),
    ),
    vscode.commands.registerCommand('agentDoctor.runStructuralAnalysis', () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc) void provider.analyse(doc);
    }),
    vscode.commands.registerCommand(
      'agentDoctor.applyFix',
      (uri: vscode.Uri, ruleId: string, line: number) =>
        void applyFix(uri, ruleId, line),
    ),
  );
}

export function deactivate(): void {}
