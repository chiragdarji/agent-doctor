import {
  missingFrontmatter,
  missingAlwaysApply,
  legacyFormat,
  createTokenBudgetRule,
  emptySection,
  duplicateHeading,
  missingDescription,
  unclosedCodeBlock,
  conflictingFrontmatter,
  missingFileGlob,
  headingDepthSkip,
  negationHeavy,
  todoInInstructions,
  missingSuccessCriteria,
  hardcodedEnvironment,
  missingToolList,
  sensitiveData,
  missingAgentPersona,
  redundantInstructions,
  missingExamples,
  instructionOrdering,
} from '../rules/structural/index.js';
import { detectPlatform, applyPlatformOverrides } from './platform.js';
import type { Config, Issue, ParsedFile, PluginRule, StructuralRule } from '../types.js';

/**
 * Runs all structural rules (built-in + optional plugin rules) against a parsed file.
 * Rules disabled via `config.rules[ruleId] === 'off'` are filtered out.
 * Issues are enriched with platform-specific suggestions based on the file type.
 */
export function runStructuralAnalysis(
  parsed: ParsedFile,
  config: Config,
  pluginRules: PluginRule[] = [],
): Issue[] {
  const rules: StructuralRule[] = [
    // Format / frontmatter rules
    missingFrontmatter,
    missingAlwaysApply,
    missingDescription,
    conflictingFrontmatter,
    missingFileGlob,
    legacyFormat,
    // Content quality rules
    emptySection,
    duplicateHeading,
    headingDepthSkip,
    unclosedCodeBlock,
    negationHeavy,
    todoInInstructions,
    // Token budget
    createTokenBudgetRule(config.tokenBudgetWarning),
    // Agent readiness rules (Factory.ai + OpenAI Harness frameworks)
    missingSuccessCriteria,
    hardcodedEnvironment,
    missingToolList,
    // v1.0.0 rules
    sensitiveData,
    missingAgentPersona,
    redundantInstructions,
    missingExamples,
    instructionOrdering,
  ];

  // Pass rawContent so frontmatter-aware rules (missing-frontmatter, missing-always-apply)
  // can inspect the full file, while section-based rules parse from the raw text safely
  // (frontmatter lines don't match the heading regex so they're treated as preamble).
  const platform = detectPlatform(parsed.fileType);
  const rawIssues: Issue[] = [
    ...rules.flatMap((rule) => rule(parsed.rawContent, parsed.filePath)),
    ...pluginRules.flatMap((rule) => rule(parsed.rawContent, parsed.filePath)),
  ].filter((issue) => config.rules[issue.ruleId] !== 'off');

  return applyPlatformOverrides(rawIssues, platform);
}
