import { expect, it } from 'vitest';
import fixture from '../assets/projects/brainco/project.json';
import { collectHighlights, parseProject, toggleHighlight, editParagraph } from '../src/models/project';

function project(text = 'They ran and ran. They took off.') {
  return parseProject({ ...fixture, schemaVersion: 2, highlights: [], source: { paragraphs: [{ id: 'p', text }] }, vocabulary: [], expressions: [] });
}

it('stores manually selected surface forms in entries, with no top-level highlights', () => {
  let result = toggleHighlight(project(), 'p', 5, 8);
  expect(result.vocabulary[0]).toMatchObject({ word: 'ran', ipa: '', pos: '', meaning: '', highlight: ['ran'] });
  expect(collectHighlights(result).map(mark => mark.quote)).toEqual(['ran', 'ran']);
  result = toggleHighlight(result, 'p', 23, 31);
  expect(result.expressions[0]).toMatchObject({ phrase: 'took off', highlight: ['took off'] });
  expect(result).not.toHaveProperty('highlights');
  expect(JSON.parse(JSON.stringify(result))).not.toHaveProperty('highlights');
  expect(parseProject(JSON.parse(JSON.stringify(result)))).toEqual(result);
});

it('cancels a variant everywhere, keeping collected entries and undoable immutable state', () => {
  const added = toggleHighlight(project(), 'p', 5, 8);
  const removed = toggleHighlight(added, 'p', 13, 16);
  expect(removed.vocabulary[0].word).toBe('ran');
  expect(removed.vocabulary[0].highlight).toEqual([]);
  expect(collectHighlights(removed)).toEqual([]);
  expect(added.vocabulary[0].highlight).toEqual(['ran']);
});

it('uses matching dictionary entries and cancels duplicate or overlapping rules across both lists', () => {
  const input = project('RUN run take off.');
  input.vocabulary = [{ id: 'v', word: 'run', pos: 'v.', ipa: '', meaning: '跑', highlight: [] }];
  const added = toggleHighlight(input, 'p', 0, 3);
  expect(added.vocabulary).toHaveLength(1); expect(added.vocabulary[0].highlight).toEqual(['RUN']);
  added.expressions = [{ id: 'x', phrase: 'take off', meaning: '', example: '', exampleTranslation: '', highlight: ['take off'] }];
  added.vocabulary.push({ id: 'off', word: 'off', ipa: '', pos: '', meaning: '', highlight: ['off'] });
  const removed = toggleHighlight(added, 'p', 13, 16);
  expect(removed.expressions[0].highlight).toEqual([]);
  expect(removed.vocabulary[1].highlight).toEqual([]);
});

it('migrates old precise marks into entry rules, preserves unrelated metadata and rejects broken old ranges', () => {
  const input = project();
  const migrated = parseProject({ ...input, highlights: [{ id: 'old', paragraphId: 'p', start: 5, end: 8, quote: 'ran' }] });
  expect(migrated.vocabulary[0].highlight).toEqual(['ran']);
  expect(migrated.title).toBe(input.title);
  expect(migrated).not.toHaveProperty('highlights');
  expect(collectHighlights(migrated)).toHaveLength(2);
  expect(() => parseProject({ ...input, highlights: [{ id: 'old', paragraphId: 'p', start: 5, end: 8, quote: 'run' }] })).toThrow();
});

it('migrates legacy text hints and keeps variants when article text changes', () => {
  const migrated = parseProject({ ...project(), schemaVersion: 1, highlights: [{ id: 'old', text: 'took off' }] });
  expect(migrated.expressions[0].highlight).toEqual(['took off']);
  const edited = editParagraph(migrated, 'p', 'They will take off.');
  expect(edited.expressions[0].highlight).toEqual(['took off']);
  expect(collectHighlights(edited)).toEqual([]);
});

it('rejects partial-word selections and warns when migrating old partial-word marks', () => {
  const input = project('runner run');
  expect(toggleHighlight(input, 'p', 0, 3)).toBe(input);
  const added = toggleHighlight(input, 'p', 0, 7);
  expect(added.vocabulary[0].highlight).toEqual(['runner']);
  expect(collectHighlights(added).map(mark => mark.quote)).toEqual(['runner']);
  const migrated = parseProject({ ...input, highlights: [{ id: 'old', paragraphId: 'p', start: 0, end: 3, quote: 'run' }] });
  expect(migrated.vocabulary[0].highlight).toEqual(['run']);
  expect(migrated.warnings).toContain('旧高亮“run”已保留为条目规则，但原选区不是完整单词或词组，请重新确认。');
  expect(collectHighlights(migrated).map(mark => mark.quote)).toEqual(['run']);
});
