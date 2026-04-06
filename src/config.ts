import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Config } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { logger } from './logger.js';

/**
 * Loads .agentdoctor.json from the given directory and deep-merges it with DEFAULT_CONFIG.
 * Returns DEFAULT_CONFIG unchanged if no config file exists.
 */
export function loadConfig(cwd: string = process.cwd()): Config {
  const configPath = resolve(cwd, '.agentdoctor.json');

  try {
    const raw = readFileSync(configPath, 'utf8');
    const partial = JSON.parse(raw) as Partial<Config>;
    logger.debug(`Loaded config from ${configPath}`);
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      // Deep merge rules so partial overrides don't wipe the whole map
      rules: { ...DEFAULT_CONFIG.rules, ...(partial.rules ?? {}) },
    };
  } catch (err) {
    const isNotFound =
      err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';

    if (!isNotFound) {
      logger.warn(`Failed to read .agentdoctor.json: ${String(err)}`);
    }

    return { ...DEFAULT_CONFIG };
  }
}
