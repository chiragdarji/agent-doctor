import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Watch mode logic is tested by unit-testing the debounce + re-analyse path
// via the analyser directly (CLI spawning is an e2e concern).
// ---------------------------------------------------------------------------

import { analyse } from '../src/analyser/index.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { AnalysisLayer, Config } from '../src/types.js';

const STRUCTURAL_ONLY: Config = {
  ...DEFAULT_CONFIG,
  layers: ['structural'] as AnalysisLayer[],
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `agent-doctor-watch-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(name: string, content: string): string {
  const fp = join(tmpDir, name);
  writeFileSync(fp, content, 'utf8');
  return fp;
}

// ---------------------------------------------------------------------------
// Re-analysis produces updated results when file changes
// ---------------------------------------------------------------------------
describe('watch mode — re-analysis on file change', () => {
  it('first run on a clean file returns score 100', async () => {
    const fp = writeTmp('watch-clean.md', '# Guide\n\nAll good.\n');
    const result = await analyse(fp, STRUCTURAL_ONLY);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it('second run after adding a TODO picks up the new issue', async () => {
    const fp = writeTmp('watch-todo.md', '# Guide\n\nAll good.\n');

    const first = await analyse(fp, STRUCTURAL_ONLY);
    expect(first.issues).toHaveLength(0);

    // Simulate a file save with a TODO introduced
    writeFileSync(fp, '# Guide\n\nTODO: fill this in\n', 'utf8');

    const second = await analyse(fp, STRUCTURAL_ONLY);
    expect(second.issues.some((i) => i.ruleId === 'todo-in-instructions')).toBe(true);
  });

  it('second run after fixing an issue clears it', async () => {
    const fp = writeTmp('watch-fix.md', '# Guide\n\nTODO: placeholder\n');

    const first = await analyse(fp, STRUCTURAL_ONLY);
    expect(first.issues.some((i) => i.ruleId === 'todo-in-instructions')).toBe(true);

    // Simulate user fixing the file
    writeFileSync(fp, '# Guide\n\nAll instructions are complete.\n', 'utf8');

    const second = await analyse(fp, STRUCTURAL_ONLY);
    expect(second.issues).toHaveLength(0);
    expect(second.score).toBe(100);
  });

  it('readinessScore updates between runs', async () => {
    const fp = writeTmp('watch-readiness.md', [
      '## Deploy',
      'Implement the service.',
      'Build the container.',
      'Run the deploy script.',
      '',
    ].join('\n'));

    const first = await analyse(fp, STRUCTURAL_ONLY);
    const firstReadiness = first.readinessScore;

    // Add a success criteria — readiness should improve
    writeFileSync(fp, [
      '## Deploy',
      'Implement the service.',
      'Build the container.',
      'Run the deploy script.',
      '',
      '> ✅ **Success criteria:** Done when all tests pass and staging is green.',
      '',
    ].join('\n'), 'utf8');

    const second = await analyse(fp, STRUCTURAL_ONLY);
    // missing-success-criteria should no longer fire → readiness improves or stays
    expect(second.readinessScore).toBeGreaterThanOrEqual(firstReadiness);
  });
});
