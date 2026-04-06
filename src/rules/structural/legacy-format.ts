import { basename } from 'node:path';
import type { Issue, StructuralRule } from '../../types.js';

/**
 * Detects the legacy `.cursorrules` file format.
 * Cursor agent mode does not read this file — it silently ignores it.
 */
export const legacyFormat: StructuralRule = (_content: string, filePath: string): Issue[] => {
  if (basename(filePath) !== '.cursorrules') return [];

  return [
    {
      ruleId: 'legacy-format',
      severity: 'critical',
      message: '`.cursorrules` is a legacy format not read by Cursor agent mode',
      suggestion:
        'Migrate rules to `.cursor/rules/*.mdc` files with `alwaysApply: true` frontmatter',
    },
  ];
};
