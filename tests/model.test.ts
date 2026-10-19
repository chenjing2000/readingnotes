import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import fixture from '../projects/brainco/project.json';
import { parseProject, editParagraph, toggleHighlight, defaults, layoutKey } from '../src/model';

describe('project persistence and precise highlights', () => {
  it('migrates without changing either independent snapshot', () => {
    const project = parseProject(fixture);
    expect(project.schemaVersion).toBe(2);
    for (const [key, filename] of [['source', 'article'], ['translation', 'translation']] as const) {
      const snapshot = readFileSync(`projects/brainco/${filename}.md`, 'utf8').replace(/\r\n/g, '\n').trim();
      expect(project[key].paragraphs.map(item => item.text).join('\n\n')).toBe(snapshot);
      expect(project[key].paragraphs).toHaveLength(2);
    }
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(project.styles.bodySize).toBe(36);
    expect(project.styles.translationSize).toBe(32);
  });
  it('rejects bad versions, fields, IDs, ranges and unsafe styles', () => {
    expect(() => parseProject({ ...fixture, schemaVersion: 99 })).toThrow();
    expect(() => parseProject({ ...fixture, title: null })).toThrow();
    expect(() => parseProject({ ...fixture, vocabulary: [fixture.vocabulary[0], fixture.vocabulary[0]] })).toThrow();
    const project = parseProject(fixture);
    expect(() => parseProject({ ...project, styles: { ...defaults, bodySize: 10000 } })).toThrow();
    expect(() => parseProject({ ...project, highlights: [{ id: 'bad', paragraphId: 'en-1', start: 0, end: 3, quote: 'bad' }] })).toThrow();
  });
  it('marks and removes only selected occurrence', () => {
    let project = parseProject({ ...fixture, source: { paragraphs: [{ id: 'p', text: 'word word' }] }, highlights: [] });
    project = toggleHighlight(project, 'p', 0, 4);
    project = toggleHighlight(project, 'p', 5, 9);
    project = toggleHighlight(project, 'p', 0, 4);
    expect(project.highlights).toMatchObject([{ paragraphId: 'p', start: 5, end: 9, quote: 'word' }]);
  });
  it('moves intervals on insertion, invalidates changed quote explicitly', () => {
    let project = parseProject({ ...fixture, source: { paragraphs: [{ id: 'p', text: 'word word' }] }, highlights: [] });
    project = toggleHighlight(project, 'p', 5, 9);
    project = editParagraph(project, 'p', 'new word word');
    expect(project.highlights[0]).toMatchObject({ start: 9, end: 13, quote: 'word' });
    project = editParagraph(project, 'p', 'new word changed');
    expect(project.highlights).toHaveLength(0);
    expect(project.warnings.join(' ')).toContain('高亮');
  });
  it('round-trips page breaks for maximum-length IDs, including JSON escapes', () => {
    const paragraphId = '\u0001'.repeat(200);
    const project = parseProject({ ...fixture, source: { paragraphs: [{ id: paragraphId, text: 'Article' }] }, highlights: [] });
    project.layoutOverrides.manualPageBreaks = [layoutKey('article', paragraphId)];
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    const legacyBreak = parseProject({ ...project, layoutOverrides: { manualPageBreaks: [paragraphId] } });
    expect(parseProject(JSON.parse(JSON.stringify(legacyBreak)))).toEqual(legacyBreak);
  });
  it('migrates highlights with long source and hint IDs into persistable unique IDs', () => {
    const project = parseProject({
      ...fixture, source: { paragraphs: [{ id: 'p'.repeat(200), text: 'word word' }] },
      highlights: [{ id: 'h'.repeat(200), text: 'word' }],
    });
    expect(project.highlights.map(mark => [mark.start, mark.end, mark.quote])).toEqual([[0, 4, 'word'], [5, 9, 'word']]);
    expect(new Set(project.highlights.map(mark => mark.id)).size).toBe(2);
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });
});
