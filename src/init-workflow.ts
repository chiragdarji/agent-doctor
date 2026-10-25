import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';

export type WorkflowVariant = 'basic' | 'sarif';

export interface InitWorkflowOptions {
  cwd?: string;
  variant?: WorkflowVariant;
  /** Overwrite without prompting */
  force?: boolean;
}

export interface InitWorkflowResult {
  filePath: string;
  existed: boolean;
}

const WORKFLOW_BASIC = `\
name: Agent Doctor

on:
  push:
    paths:
      - '**CLAUDE.md'
      - '**AGENTS.md'
      - '**GEMINI.md'
      - '.cursor/rules/**'
  pull_request:
    paths:
      - '**CLAUDE.md'
      - '**AGENTS.md'
      - '**GEMINI.md'
      - '.cursor/rules/**'

jobs:
  analyse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run agent-doctor
        run: npx --yes @chiragdarji/agent-doctor --all --structural-only --fail-on warning
`;

const WORKFLOW_SARIF = `\
name: Agent Doctor

on:
  push:
    paths:
      - '**CLAUDE.md'
      - '**AGENTS.md'
      - '**GEMINI.md'
      - '.cursor/rules/**'
  pull_request:
    paths:
      - '**CLAUDE.md'
      - '**AGENTS.md'
      - '**GEMINI.md'
      - '.cursor/rules/**'

jobs:
  analyse:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write   # required for SARIF upload

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run agent-doctor (fail on warnings)
        run: npx --yes @chiragdarji/agent-doctor --all --structural-only --fail-on warning

      - name: Generate SARIF report
        if: always()
        run: |
          npx --yes @chiragdarji/agent-doctor --all --structural-only --format sarif \\
            > agent-doctor.sarif

      - name: Upload SARIF to GitHub Code Scanning
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: agent-doctor.sarif
          category: agent-doctor
`;

function workflowContent(variant: WorkflowVariant): string {
  return variant === 'sarif' ? WORKFLOW_SARIF : WORKFLOW_BASIC;
}

/**
 * Generates a GitHub Actions workflow file for agent-doctor CI checks.
 *
 * @param options.variant  'basic' — run + fail | 'sarif' — run + fail + upload to Code Scanning
 * @param options.force    Overwrite an existing file without prompting
 */
export async function initWorkflow(options: InitWorkflowOptions = {}): Promise<InitWorkflowResult> {
  const cwd = options.cwd ?? process.cwd();
  const variant = options.variant ?? 'basic';
  const force = options.force ?? false;

  const workflowsDir = resolve(join(cwd, '.github', 'workflows'));
  const filePath = join(workflowsDir, 'agent-doctor.yml');
  const existed = existsSync(filePath);

  if (existed && !force) {
    const confirmed = await prompt(
      `  ${filePath} already exists. Overwrite? (y/N) `,
    );
    if (!confirmed) {
      throw new Error(`Aborted — ${filePath} already exists. Use --force to overwrite.`);
    }
  }

  mkdirSync(workflowsDir, { recursive: true });
  writeFileSync(filePath, workflowContent(variant), 'utf8');

  return { filePath, existed };
}

/** Reads a single yes/no answer from stdin. */
async function prompt(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
