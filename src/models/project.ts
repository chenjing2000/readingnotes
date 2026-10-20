import { z } from 'zod';

const size = z.number().finite().min(12).max(80);
export const styleSchema = z.object({
  titleSize: size.default(40), bodySize: size.default(36), phraseSize: size.default(36),
  translationSize: size.default(32), lineHeight: z.number().min(1.2).max(2.4).default(1.45),
  translationLineHeight: z.number().min(1.2).max(2.4).default(1.62),
  paragraphGap: z.number().min(0).max(100).default(18),
  marginX: z.number().min(24).max(200).default(54),
  marginTop: z.number().min(24).max(200).default(34),
  marginBottom: z.number().min(65).max(400).default(80),
  accent: z.string().regex(/^#[\da-fA-F]{6}$/).default('#b81a35'),
  divider: z.string().regex(/^#[\da-fA-F]{6}$/).default('#007175'),
});
export const defaults = styleSchema.parse({});
const id = z.string().min(1).max(200);
// A layout key contains a kind and an ID; JSON escaping can expand each ID character to six characters.
const pageBreakKey = z.string().min(1).max(2048);
const text = z.string().max(300000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(value), '含无效控制字符或乱码替代符');
const paragraph = z.object({ id, text });
const highlight = z.object({ id, paragraphId: id, start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: text });
const variants = z.array(text).max(2000).default([]);
const common = {
  id, title: text, personalizedHeader: text.default('SOME BIRDS ON TREE'), readingLevel: z.number().optional(),
  source: z.object({ paragraphs: z.array(paragraph).max(500) }),
  translation: z.object({ paragraphs: z.array(paragraph).max(500) }),
  vocabulary: z.array(z.object({ id, word: text, pos: text, meaning: text, ipa: text.optional(), highlight: variants })).max(2000),
  expressions: z.array(z.object({ id, phrase: text, meaning: text, example: text, exampleTranslation: text, highlight: variants })).max(2000),
  mainIdea: text,
  theme: z.literal('classic').default('classic'),
  layoutOverrides: z.object({ manualPageBreaks: z.array(pageBreakKey).default([]), elementStyles: z.record(z.string(), z.unknown()).default({}) }).default({ manualPageBreaks: [], elementStyles: {} }),
};
const currentSchema = z.object({ ...common, schemaVersion: z.literal(2), styles: styleSchema.default(defaults), warnings: z.array(z.string()).default([]) });
const positionedSchema = currentSchema.extend({ highlights: z.array(highlight) });
const legacySchema = z.object({ ...common, schemaVersion: z.literal(1), highlights: z.array(z.object({ id, text, style: z.string().optional() })) });
export type Project = z.infer<typeof currentSchema>;
export type Styles = Project['styles'];
export const newId = () => crypto.randomUUID();
export const layoutKey = (kind: string, sourceId: string) => JSON.stringify([kind, sourceId]);

export function parseProject(input: unknown): Project {
  let project: Project;
  let oldTerms: string[] = [];
  let oldMarks: z.infer<typeof highlight>[] = [];
  if ((input as { schemaVersion?: number })?.schemaVersion === 1) {
    const old = legacySchema.parse(input);
    oldTerms = old.highlights.map(hint => hint.text);
    project = currentSchema.parse({ ...old, schemaVersion: 2 });
  } else {
    if (input && typeof input === 'object' && 'highlights' in input) oldMarks = positionedSchema.parse(input).highlights;
    project = currentSchema.parse(input);
  }
  const ids = [project.id, ...project.source.paragraphs.map(item => item.id), ...project.translation.paragraphs.map(item => item.id), ...project.vocabulary.map(item => item.id), ...project.expressions.map(item => item.id), ...oldMarks.map(item => item.id)];
  if (new Set(ids).size !== ids.length) throw new Error('项目含重复 ID，请为各条目使用唯一 ID。');
  for (const mark of oldMarks) {
    const source = project.source.paragraphs.find(item => item.id === mark.paragraphId);
    if (!source || mark.end <= mark.start || mark.end > source.text.length || source.text.slice(mark.start, mark.end) !== mark.quote) throw new Error(`项目高亮 ${mark.id} 与原文不匹配，请重新确认。`);
    if (!isWholeTermSelection(source.text, mark.start, mark.end)) project.warnings.push(`旧高亮“${mark.quote}”已保留为条目规则，但原选区不是完整单词或词组，请重新确认。`);
  }
  for (const term of [...oldTerms, ...oldMarks.map(mark => mark.quote)]) project = addHighlightTerm(project, term);
  const targets = [
    ['title', 'title'], ...project.source.paragraphs.map(item => ['article', item.id]),
    ...project.vocabulary.map(item => ['vocab', item.id]),
    ...project.expressions.flatMap(item => ['phrase', 'meaning', 'example', 'exampleTranslation'].map(field => [field, `${item.id}:${field}`])),
    ['mainIdea', 'mainIdea'], ...project.translation.paragraphs.map(item => ['translation', item.id]),
    ...['vocab-heading', 'expressions-heading', 'main-heading', 'translation-heading'].map(id => [id === 'vocab-heading' ? 'vocab-heading' : 'section-heading', id]),
  ];
  const keys = new Set(targets.map(([kind, id]) => layoutKey(kind, id)));
  project.layoutOverrides.manualPageBreaks = [...new Set(project.layoutOverrides.manualPageBreaks.flatMap(key => {
    if (keys.has(key)) return [key];
    const matches = targets.filter(([, id]) => id === key);
    if (matches.length > 1) project.warnings.push(`旧分页标记“${key}”引用多个同名节点，请重新确认前换页选项。`);
    return matches.length ? matches.map(([kind, id]) => layoutKey(kind, id)) : [key];
  }))];
  return currentSchema.parse(project);
}

export type HighlightRange = { paragraphId: string; start: number; end: number; quote: string };
const normalizeTerm = (term: string) => term.trim().replace(/\s+/gu, ' ').toLowerCase();

function termMatches(source: string, term: string): { start: number; end: number }[] {
  const value = term.trim().replace(/\s+/gu, ' ');
  if (!value) return [];
  const pattern = new RegExp('(?<![\\p{L}\\p{N}\\p{M}_])' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/gu, '\\s+') + '(?![\\p{L}\\p{N}\\p{M}_])', 'giu');
  const matches: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    pattern.lastIndex = match.index + (source.codePointAt(match.index)! > 0xffff ? 2 : 1);
  }
  return matches;
}

function isWholeTermSelection(source: string, start: number, end: number): boolean {
  const selected = source.slice(start, end);
  const first = start + selected.length - selected.trimStart().length;
  const last = end - selected.length + selected.trimEnd().length;
  return termMatches(source, selected).some(match => match.start === first && match.end === last);
}

function addHighlightTerm(project: Project, selected: string): Project {
  const term = selected.trim();
  const normalized = normalizeTerm(term);
  if (!normalized || [...project.vocabulary, ...project.expressions].some(entry => entry.highlight.some(value => normalizeTerm(value) === normalized))) return project;
  const wordIndex = project.vocabulary.findIndex(entry => normalizeTerm(entry.word) === normalized);
  if (wordIndex !== -1) return { ...project, vocabulary: project.vocabulary.map((entry, index) => index === wordIndex ? { ...entry, highlight: [...entry.highlight, term] } : entry) };
  const phraseIndex = project.expressions.findIndex(entry => normalizeTerm(entry.phrase) === normalized);
  if (phraseIndex !== -1) return { ...project, expressions: project.expressions.map((entry, index) => index === phraseIndex ? { ...entry, highlight: [...entry.highlight, term] } : entry) };
  if (/\s/u.test(term)) return { ...project, expressions: [...project.expressions, { id: newId(), phrase: term, meaning: '', example: '', exampleTranslation: '', highlight: [term] }] };
  return { ...project, vocabulary: [...project.vocabulary, { id: newId(), word: term, pos: '', meaning: '', ipa: '', highlight: [term] }] };
}

export function collectHighlights(project: Project): HighlightRange[] {
  const terms = new Set([...project.vocabulary, ...project.expressions].flatMap(entry => entry.highlight).filter(term => term.trim()));
  const result: HighlightRange[] = [];
  for (const paragraph of project.source.paragraphs) {
    const matches = [...terms].flatMap(term => termMatches(paragraph.text, term));
    matches.sort((left, right) => left.start - right.start || right.end - left.end);
    const merged: typeof matches = [];
    for (const match of matches) {
      const previous = merged.at(-1);
      if (previous && match.start < previous.end) previous.end = Math.max(previous.end, match.end);
      else merged.push({ ...match });
    }
    result.push(...merged.map(match => ({ paragraphId: paragraph.id, ...match, quote: paragraph.text.slice(match.start, match.end) })));
  }
  return result;
}

export function editParagraph(project: Project, paragraphId: string, next: string): Project {
  return { ...project, source: { paragraphs: project.source.paragraphs.map(item => item.id === paragraphId ? { ...item, text: next } : item) } };
}

export function toggleHighlight(project: Project, paragraphId: string, start: number, end: number): Project {
  if (end <= start) return project;
  const paragraph = project.source.paragraphs.find(item => item.id === paragraphId)!;
  let removed = false;
  function withoutSelectedRule<T extends { highlight: string[] }>(entry: T): T {
    const highlight = entry.highlight.filter(term => !termMatches(paragraph.text, term).some(match => match.start < end && match.end > start));
    if (highlight.length === entry.highlight.length) return entry;
    removed = true; return { ...entry, highlight };
  }
  const vocabulary = project.vocabulary.map(withoutSelectedRule), expressions = project.expressions.map(withoutSelectedRule);
  if (removed) return { ...project, vocabulary, expressions };
  return isWholeTermSelection(paragraph.text, start, end) ? addHighlightTerm(project, paragraph.text.slice(start, end)) : project;
}
