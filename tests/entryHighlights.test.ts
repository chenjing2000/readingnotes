import { expect, it } from 'vitest';
import fixture from '../assets/projects/brainco/project.json';
import { applyEntryHighlights, parseProject, toggleHighlight } from '../src/models/project';
import { readProject } from '../src/services/projectIO';

function project(text: string, words: string[], phrases: string[] = []) {
  return parseProject({ ...fixture, schemaVersion: 2, highlights: [], source: { paragraphs: [{ id: 'p1', text }] }, vocabulary: [{ id: 'v1', word: 'run', pos: 'v.', meaning: '跑', highlight: words }], expressions: [{ id: 'x1', phrase: 'take off', meaning: '起飞', example: '', exampleTranslation: '', highlight: phrases }] });
}

it('preserves variant lists, defaults old entries to empty lists and rejects invalid lists', () => {
  expect(parseProject(fixture).vocabulary.every(entry => entry.highlight.length === 0)).toBe(true);
  expect(parseProject(fixture).expressions.every(entry => entry.highlight.length === 0)).toBe(true);
  const input = project('Runs.', ['run', 'runs'], ['take off']);
  expect(parseProject(JSON.parse(JSON.stringify(input)))).toEqual(input);
  expect(() => parseProject({ ...input, vocabulary: [{ ...input.vocabulary[0], highlight: 'runs' }] })).toThrow();
  expect(() => parseProject({ ...input, expressions: [{ ...input.expressions[0], highlight: [1] }] })).toThrow();
});

it('matches only supplied whole-word variants, case-insensitively, with literal punctuation', () => {
  const result = applyEntryHighlights(project('RUN runs running runner outrun run2 x_run éRun run\u0301 C++ a.b axb.', ['run', 'runs', 'running', 'C++', 'a.b']));
  expect(result.highlights.map(mark => mark.quote)).toEqual(['RUN', 'runs', 'running', 'C++', 'a.b']);
  expect(parseProject(result)).toEqual(result);
});

it('matches phrase variants across whitespace, merges overlaps and keeps UTF-16 source offsets', () => {
  const input = project('😀 They took\n off. People bring people together. in in in', ['people', '  ', 'People'], ['took off', 'bring people together', 'in in']);
  const result = applyEntryHighlights(input);
  expect(result.highlights.map(mark => mark.quote)).toEqual(['took\n off', 'People', 'bring people together', 'in in in']);
  for (const mark of result.highlights) expect(input.source.paragraphs[0].text.slice(mark.start, mark.end)).toBe(mark.quote);
  expect(result.highlights[0].start).toBe(8);
});

it('preserves manual marks, adds only uncovered spans and does not scan between paragraphs', () => {
  const input = project('take off take', ['take'], ['take off']);
  input.highlights = [{ id: 'manual', paragraphId: 'p1', start: 2, end: 6, quote: 'ke o' }];
  input.source.paragraphs.push({ id: 'p2', text: 'off' });
  const result = applyEntryHighlights(input);
  expect(result.highlights.find(mark => mark.id === 'manual')).toEqual(input.highlights[0]);
  expect(result.highlights.filter(mark => mark.id !== 'manual').map(mark => mark.quote)).toEqual(['ta', 'ff', 'take']);
  expect(result.highlights.every(mark => mark.paragraphId === 'p1')).toBe(true);
  expect(applyEntryHighlights(result)).toEqual(result);
  expect(input.highlights).toHaveLength(1);
});

it('scans at JSON file import, while ordinary parsing preserves a manual cancellation', async () => {
  const input = project('run run', ['run']);
  const imported = await readProject(new File([JSON.stringify(input)], 'article.json'));
  expect(imported.highlights).toHaveLength(2);
  const edited = toggleHighlight(imported, 'p1', 0, 3);
  expect(parseProject(JSON.parse(JSON.stringify(edited))).highlights).toHaveLength(1);
  const reimported = await readProject(new File([JSON.stringify(edited)], 'again.json'));
  expect(reimported.highlights).toHaveLength(2);
});
