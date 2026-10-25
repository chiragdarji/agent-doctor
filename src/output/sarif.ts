import type { AnalysisResult, Issue, Severity } from '../types.js';

// SARIF 2.1.0 — https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: string };
  helpUri?: string;
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId: string };
    region?: { startLine: number; snippet?: { text: string } };
  };
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: SarifLocation[];
  fixes?: Array<{ description: { text: string } }>;
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
  artifacts: Array<{ location: { uri: string; uriBaseId: string } }>;
}

interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

/** Maps agent-doctor severity to SARIF level. */
function toSarifLevel(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'warning';
    case 'suggestion':
      return 'note';
  }
}

/** Collects all unique rules referenced across results. */
function collectRules(results: AnalysisResult[]): SarifRule[] {
  const seen = new Map<string, SarifRule>();
  for (const result of results) {
    for (const issue of result.issues) {
      if (seen.has(issue.ruleId)) continue;
      seen.set(issue.ruleId, {
        id: issue.ruleId,
        name: issue.ruleId
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(''),
        shortDescription: { text: issue.message },
        defaultConfiguration: { level: toSarifLevel(issue.severity) },
        helpUri: `https://github.com/chiragdarji/agent-doctor/blob/main/docs/rules.md#${issue.ruleId}`,
      });
    }
  }
  return Array.from(seen.values());
}

function toSarifResult(issue: Issue, filePath: string): SarifResult {
  const location: SarifLocation = {
    physicalLocation: {
      artifactLocation: { uri: filePath, uriBaseId: '%SRCROOT%' },
    },
  };
  if (issue.line !== undefined) {
    location.physicalLocation.region = {
      startLine: issue.line,
      ...(issue.context !== undefined ? { snippet: { text: issue.context } } : {}),
    };
  }

  return {
    ruleId: issue.ruleId,
    level: toSarifLevel(issue.severity),
    message: { text: issue.message },
    locations: [location],
    fixes: [{ description: { text: issue.suggestion } }],
  };
}

/**
 * Formats one or more AnalysisResults as a SARIF 2.1.0 JSON log.
 *
 * The output is suitable for upload to GitHub Code Scanning:
 *   gh code-scanning upload-results --sarif agent-doctor.sarif
 */
export function formatSarif(results: AnalysisResult[]): string {
  const rules = collectRules(results);

  const sarifResults: SarifResult[] = [];
  const artifactUris = new Set<string>();

  for (const result of results) {
    artifactUris.add(result.file);
    for (const issue of result.issues) {
      sarifResults.push(toSarifResult(issue, result.file));
    }
  }

  const run: SarifRun = {
    tool: {
      driver: {
        name: 'agent-doctor',
        version: '1.1.0',
        informationUri: 'https://github.com/chiragdarji/agent-doctor',
        rules,
      },
    },
    results: sarifResults,
    artifacts: Array.from(artifactUris).map((uri) => ({
      location: { uri, uriBaseId: '%SRCROOT%' },
    })),
  };

  const log: SarifLog = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [run],
  };

  return JSON.stringify(log, null, 2);
}
