import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '../src/skill.js';

describe('parseSkillMarkdown frontmatter tolerance', () => {
  it('recovers from malformed frontmatter instead of throwing', () => {
    // A real-world community SKILL.md with non-strict frontmatter (a duplicate
    // mapping key makes this invalid YAML).
    const md = `---\nname: Broken Skill\nversion: "1.1.2"\nversion: "1.1.3"\n---\n\n# Broken Skill\n\nDoes a thing.`;
    const skill = parseSkillMarkdown(md);
    expect(skill.name).toBe('Broken Skill'); // recovered from the body heading
    expect(skill.description).toBe('Does a thing.');
    expect(skill.tags).toEqual([]);
  });

  it('still parses valid frontmatter', () => {
    const md = `---\nname: Good Skill\ndescription: A good one.\ntags: [a, b]\n---\n\n# Good Skill`;
    const skill = parseSkillMarkdown(md);
    expect(skill.name).toBe('Good Skill');
    expect(skill.description).toBe('A good one.');
    expect(skill.tags).toEqual(['a', 'b']);
  });
});
