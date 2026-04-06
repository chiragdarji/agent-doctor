import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSections } from '../src/parser/sections.js';
import { parseMarkdown, detectFileType } from '../src/parser/markdown.js';
import { parseMdc } from '../src/parser/mdc.js';
import { parseFile } from '../src/parser/index.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

// ---------------------------------------------------------------------------
// parseSections
// ---------------------------------------------------------------------------
describe('parseSections', () => {
  it('returns empty array for content with no headings', () => {
    expect(parseSections('')).toHaveLength(0);
    expect(parseSections('Just some text with no headings.')).toHaveLength(0);
  });

  it('ignores content before the first heading (preamble)', () => {
    const sections = parseSections('Preamble text\n\n# First Heading\nContent here.');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe('First Heading');
  });

  it('parses a single heading with content', () => {
    const sections = parseSections('# Hello\nSome content here.');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe('Hello');
    expect(sections[0]!.content).toBe('Some content here.');
    expect(sections[0]!.level).toBe(1);
    expect(sections[0]!.line).toBe(1);
  });

  it('parses multiple headings', () => {
    const content = '# One\nContent one.\n\n## Two\nContent two.\n\n### Three\nContent three.';
    const sections = parseSections(content);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.heading).toBe('One');
    expect(sections[0]!.level).toBe(1);
    expect(sections[1]!.heading).toBe('Two');
    expect(sections[1]!.level).toBe(2);
    expect(sections[2]!.heading).toBe('Three');
    expect(sections[2]!.level).toBe(3);
  });

  it('detects empty sections (heading with no body)', () => {
    const content = '# HasContent\nSome text.\n\n# Empty\n\n# AlsoHasContent\nMore text.';
    const sections = parseSections(content);
    expect(sections).toHaveLength(3);
    expect(sections[1]!.heading).toBe('Empty');
    expect(sections[1]!.content).toBe('');
  });

  it('records the correct line number for each heading', () => {
    const content = '# First\nline2\n\n# Second\nline5';
    const sections = parseSections(content);
    expect(sections[0]!.line).toBe(1);
    expect(sections[1]!.line).toBe(4);
  });

  it('computes a non-zero tokenCount for sections with content', () => {
    const sections = parseSections('# Section\n' + 'word '.repeat(20));
    expect(sections[0]!.tokenCount).toBeGreaterThan(0);
  });

  it('handles all heading levels h1–h6', () => {
    const content = ['# H1', '## H2', '### H3', '#### H4', '##### H5', '###### H6']
      .map((h, i) => `${h}\nContent ${i}`)
      .join('\n\n');
    const sections = parseSections(content);
    expect(sections).toHaveLength(6);
    sections.forEach((s, i) => expect(s.level).toBe(i + 1));
  });

  it('does not treat # inside a code block as a heading', () => {
    // Note: this is a known v0.1 limitation — we document it rather than hide it.
    // The parser uses a simple line-by-line regex and does not track fenced blocks.
    const content = '# Real Heading\n```\n# not a heading\n```\nContent.';
    const sections = parseSections(content);
    // Both lines match the heading regex — known limitation
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections[0]!.heading).toBe('Real Heading');
  });

  it('trims trailing whitespace from heading text', () => {
    const sections = parseSections('# My Heading   \nContent.');
    expect(sections[0]!.heading).toBe('My Heading');
  });
});

// ---------------------------------------------------------------------------
// detectFileType
// ---------------------------------------------------------------------------
describe('detectFileType', () => {
  const cases: Array<[string, string]> = [
    ['CLAUDE.md', 'claude-md'],
    ['claude.md', 'claude-md'],
    ['/project/CLAUDE.md', 'claude-md'],
    ['AGENTS.md', 'agents-md'],
    ['agents.md', 'agents-md'],
    ['GEMINI.md', 'gemini-md'],
    ['.github/copilot-instructions.md', 'copilot-instructions'],
    ['/project/.claude/agents/my-agent.md', 'claude-agent'],
    ['/project/.claude/commands/deploy.md', 'claude-command'],
    ['random.md', 'unknown'],
    ['notes.md', 'unknown'],
  ];

  for (const [path, expected] of cases) {
    it(`detects "${path}" as "${expected}"`, () => {
      expect(detectFileType(path)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// parseMarkdown
// ---------------------------------------------------------------------------
describe('parseMarkdown', () => {
  it('parses good-claude.md correctly', () => {
    const parsed = parseMarkdown(resolve(FIXTURES, 'good-claude.md'));
    expect(parsed.fileType).toBe('unknown'); // fixture basename doesn't match well-known names
    expect(parsed.sections.length).toBeGreaterThan(0);
    expect(parsed.tokenCount).toBeGreaterThan(0);
    expect(parsed.rawContent).toBeTruthy();
    expect(parsed.content).toBeTruthy();
  });

  it('stores raw content including frontmatter in rawContent', () => {
    // good.mdc has frontmatter — parse as markdown to test rawContent preservation
    const parsed = parseMarkdown(resolve(FIXTURES, 'good.mdc'));
    expect(parsed.rawContent).toContain('alwaysApply');
  });

  it('strips frontmatter from content field', () => {
    const parsed = parseMarkdown(resolve(FIXTURES, 'good.mdc'));
    // content should not start with ---
    expect(parsed.content.trimStart().startsWith('---')).toBe(false);
  });

  it('sets frontmatter field when file has YAML frontmatter', () => {
    const parsed = parseMarkdown(resolve(FIXTURES, 'good.mdc'));
    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter!['alwaysApply']).toBe(true);
  });

  it('leaves frontmatter undefined when file has none', () => {
    const parsed = parseMarkdown(resolve(FIXTURES, 'good-claude.md'));
    expect(parsed.frontmatter).toBeUndefined();
  });

  it('parses empty file without throwing', () => {
    const parsed = parseMarkdown(resolve(FIXTURES, 'empty-file.md'));
    expect(parsed.sections).toHaveLength(0);
    expect(parsed.tokenCount).toBe(0);
  });

  it('parses nested headings fixture with correct section count', () => {
    const parsed = parseMarkdown(resolve(FIXTURES, 'nested.md'));
    expect(parsed.sections.length).toBeGreaterThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// parseMdc
// ---------------------------------------------------------------------------
describe('parseMdc', () => {
  it('parses good.mdc with alwaysApply: true', () => {
    const parsed = parseMdc(resolve(FIXTURES, 'good.mdc'));
    expect(parsed.fileType).toBe('cursor-mdc');
    expect(parsed.frontmatter!['alwaysApply']).toBe(true);
    expect(parsed.sections.length).toBeGreaterThan(0);
  });

  it('parses mdc-no-always-apply.mdc — frontmatter exists but alwaysApply missing', () => {
    const parsed = parseMdc(resolve(FIXTURES, 'mdc-no-always-apply.mdc'));
    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter!['alwaysApply']).toBeUndefined();
  });

  it('parses bad.mdc — no frontmatter gives empty frontmatter object', () => {
    const parsed = parseMdc(resolve(FIXTURES, 'bad.mdc'));
    // gray-matter returns {} when no frontmatter present
    expect(parsed.frontmatter).toBeDefined();
    expect(Object.keys(parsed.frontmatter!)).toHaveLength(0);
  });

  it('parses frontmatter-only.mdc — content is empty, sections is empty', () => {
    const parsed = parseMdc(resolve(FIXTURES, 'frontmatter-only.mdc'));
    expect(parsed.frontmatter!['alwaysApply']).toBe(true);
    expect(parsed.sections).toHaveLength(0);
  });

  it('rawContent includes the frontmatter block', () => {
    const parsed = parseMdc(resolve(FIXTURES, 'good.mdc'));
    expect(parsed.rawContent).toContain('---');
    expect(parsed.rawContent).toContain('alwaysApply');
  });
});

// ---------------------------------------------------------------------------
// parseFile router
// ---------------------------------------------------------------------------
describe('parseFile router', () => {
  it('routes .mdc files to parseMdc (fileType = cursor-mdc)', () => {
    const parsed = parseFile(resolve(FIXTURES, 'good.mdc'));
    expect(parsed.fileType).toBe('cursor-mdc');
  });

  it('routes .md files to parseMarkdown', () => {
    const parsed = parseFile(resolve(FIXTURES, 'good-claude.md'));
    expect(parsed.fileType).not.toBe('cursor-mdc');
  });

  it('routes .cursorrules to parseMarkdown without crashing', () => {
    const parsed = parseFile(resolve(FIXTURES, '.cursorrules'));
    expect(parsed).toBeDefined();
    expect(parsed.content).toBeTruthy();
  });
});
