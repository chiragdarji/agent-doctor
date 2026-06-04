import { resolve } from 'node:path';
import { logger } from './logger.js';
import type { PluginRule } from './types.js';

/**
 * Dynamically imports plugin modules and collects exported PluginRule functions.
 * A plugin module may use a default export (single rule) or named exports (multiple rules).
 * Invalid plugins and load errors are skipped with a warning — analysis continues regardless.
 *
 * @param pluginPaths  Paths from config.plugins. Relative paths (starting with ".") are
 *                     resolved from `cwd`; bare specifiers are treated as package names.
 * @param cwd          Working directory for resolving relative paths.
 */
export async function loadPlugins(pluginPaths: string[], cwd: string): Promise<PluginRule[]> {
  const rules: PluginRule[] = [];

  for (const pluginPath of pluginPaths) {
    const absPath = pluginPath.startsWith('.') ? resolve(cwd, pluginPath) : pluginPath;
    try {
      const mod = (await import(absPath)) as Record<string, unknown>;
      const collected = collectFunctions(mod);
      if (collected.length === 0) {
        logger.warn(`Plugin "${pluginPath}" exports no functions — skipped`);
        continue;
      }
      rules.push(...collected);
      logger.debug(`Loaded ${String(collected.length)} rule(s) from plugin "${pluginPath}"`);
    } catch (err) {
      logger.warn(`Failed to load plugin "${pluginPath}": ${String(err)}`);
    }
  }

  return rules;
}

function collectFunctions(mod: Record<string, unknown>): PluginRule[] {
  const fns: PluginRule[] = [];

  // Default export takes priority when it is a function.
  if (typeof mod['default'] === 'function') {
    fns.push(mod['default'] as PluginRule);
  }

  // All other named exports that are functions are treated as rules.
  for (const [key, val] of Object.entries(mod)) {
    if (key !== 'default' && typeof val === 'function') {
      fns.push(val as PluginRule);
    }
  }

  return fns;
}
