// Plugin with multiple named-export rules.
export function noFoo(content) {
  return content.includes('foo-marker')
    ? [{ ruleId: 'plugin-no-foo', severity: 'suggestion', message: 'Found foo-marker', suggestion: 'Remove it' }]
    : [];
}

export function noBar(content) {
  return content.includes('bar-marker')
    ? [{ ruleId: 'plugin-no-bar', severity: 'critical', message: 'Found bar-marker', suggestion: 'Remove it' }]
    : [];
}
