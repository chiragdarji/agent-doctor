import * as vscode from 'vscode';
import { applyFixes } from '../../../src/fixer.js';
import type { RuleId } from '../../../src/types.js';

// Rules the fixer can handle automatically
const AUTO_FIXABLE = new Set([
  'todo-in-instructions',
  'unclosed-code-block',
  'empty-section',
  'missing-success-criteria',
  'sensitive-data',
  'missing-agent-persona',
  'hardcoded-environment',
]);

// ---------------------------------------------------------------------------
// Code action provider
// ---------------------------------------------------------------------------

export class AgentDoctorCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    doc: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    return context.diagnostics
      .filter((d) => d.source === 'agent-doctor' && AUTO_FIXABLE.has(String(d.code)))
      .map((d) => {
        const label = `Agent Doctor: Fix ${String(d.code)}`;
        const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
        action.command = {
          command: 'agentDoctor.applyFix',
          title: label,
          // line is 0-indexed in VS Code; Issue.line is 1-indexed
          arguments: [doc.uri, d.code, d.range.start.line + 1],
        };
        action.diagnostics = [d];
        action.isPreferred = d.severity === vscode.DiagnosticSeverity.Error;
        return action;
      });
  }
}

// ---------------------------------------------------------------------------
// Fix command handler
// ---------------------------------------------------------------------------

/**
 * Applies an auto-fix for `ruleId` at `line` using a dry-run preview,
 * then replaces the entire document via WorkspaceEdit for proper undo support.
 */
export async function applyFix(
  uri: vscode.Uri,
  ruleId: unknown,
  line: number,
): Promise<void> {
  const filePath = uri.fsPath;
  const issue = {
    ruleId: String(ruleId) as RuleId,
    severity: 'warning' as const,
    message: '',
    suggestion: '',
    line,
  };

  try {
    const result = await applyFixes(filePath, [issue], { dryRun: true });

    if (result.fixed.length === 0 || result.preview === undefined) {
      void vscode.window.showInformationMessage(
        `Agent Doctor: No automatic fix available for "${String(ruleId)}".`,
      );
      return;
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      doc.lineAt(doc.lineCount - 1).rangeIncludingLineBreak.end,
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, fullRange, result.preview);
    const ok = await vscode.workspace.applyEdit(edit);

    if (!ok) {
      void vscode.window.showErrorMessage('Agent Doctor: Could not apply the fix.');
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Agent Doctor: Fix failed — ${String(err)}`);
  }
}
