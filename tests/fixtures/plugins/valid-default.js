// Plugin with a single default-export rule.
// Flags any file that contains the word YOLO.
export default function noYolo(content) {
  if (content.includes('YOLO')) {
    return [
      {
        ruleId: 'plugin-no-yolo',
        severity: 'warning',
        message: 'Found "YOLO" in instructions — agents follow instructions literally',
        suggestion: 'Replace YOLO with a specific, deterministic instruction',
      },
    ];
  }
  return [];
}
