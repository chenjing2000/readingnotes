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
const common = {
  id, title: text, personalizedHeader: text.default('some birds on tree'), readingLevel: z.number().optional(),
  source: z.object({ paragraphs: z.array(paragraph).max(500) }),
  translation: z.object({ paragraphs: z.array(paragraph).max(500) }),
  vocabulary: z.array(z.object({ id, word: text, pos: text, meaning: text, ipa: text.optional() })).max(2000),
  expressions: z.array(z.object({ id, phrase: text, meaning: text, example: text, exampleTranslation: text })).max(2000),
  mainIdea: text,
  theme: z.literal('classic').default('classic'),
  layoutOverrides: z.object({ manualPageBreaks: z.array(pageBreakKey).default([]), elementStyles: z.record(z.string(), z.unknown()).default({}) }).default({ manualPageBreaks: [], elementStyles: {} }),
};
const currentSchema = z.object({ ...common, schemaVersion: z.literal(2), highlights: z.array(highlight), styles: styleSchema.default(defaults), warnings: z.array(z.string()).default([]) });
const legacySchema = z.object({ ...common, schemaVersion: z.literal(1), highlights: z.array(z.object({ id, text, style: z.string().optional() })) });
export type Project = z.infer<typeof currentSchema>;
export type Styles = Project['styles'];
export const newId = () => crypto.randomUUID();
export const layoutKey = (kind: string, sourceId: string) => JSON.stringify([kind, sourceId]);

export function parseProject(input: unknown): Project {
  let project: Project;
  if ((input as { schemaVersion?: number })?.schemaVersion === 1) {
    const old = legacySchema.parse(input);
    const highlights: Project['highlights'] = [];
    for (const hint of old.highlights) {
      if (!hint.text) continue;
      for (const paragraph of old.source.paragraphs) {
        let start = paragraph.text.indexOf(hint.text);
        while (start !== -1) {
          highlights.push({ id: newId(), paragraphId: paragraph.id, start, end: start + hint.text.length, quote: hint.text });
          start = paragraph.text.indexOf(hint.text, start + hint.text.length);
        }
      }
    }
    project = currentSchema.parse({ ...old, schemaVersion: 2, highlights });
  } else project = currentSchema.parse(input);
  const ids = [project.id, ...project.source.paragraphs.map(item => item.id), ...project.translation.paragraphs.map(item => item.id), ...project.vocabulary.map(item => item.id), ...project.expressions.map(item => item.id), ...project.highlights.map(item => item.id)];
  if (new Set(ids).size !== ids.length) throw new Error('项目含重复 ID，请为各条目使用唯一 ID。');
  for (const mark of project.highlights) {
    const source = project.source.paragraphs.find(item => item.id === mark.paragraphId);
    if (!source || mark.end <= mark.start || mark.end > source.text.length || source.text.slice(mark.start, mark.end) !== mark.quote) throw new Error(`项目高亮 ${mark.id} 与原文不匹配，请重新确认。`);
  }
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
  return project;
}

export function editParagraph(project: Project, paragraphId: string, next: string): Project {
  const old = project.source.paragraphs.find(item => item.id === paragraphId)!.text;
  let prefix = 0;
  while (prefix < Math.min(old.length, next.length) && old[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < Math.min(old.length, next.length) - prefix && old[old.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const oldEnd = old.length - suffix;
  const delta = next.length - old.length;
  const warnings = [...project.warnings];
  const highlights = project.highlights.flatMap(mark => {
    if (mark.paragraphId !== paragraphId || mark.end <= prefix) return [mark];
    if (mark.start >= oldEnd) return [{ ...mark, start: mark.start + delta, end: mark.end + delta }];
    warnings.push(`高亮“${mark.quote}”所引用的原文已修改，已取消该处标注，请重新确认。`);
    return [];
  });
  return { ...project, source: { paragraphs: project.source.paragraphs.map(item => item.id === paragraphId ? { ...item, text: next } : item) }, highlights, warnings };
}

export function toggleHighlight(project: Project, paragraphId: string, start: number, end: number): Project {
  if (end <= start) return project;
  const paragraph = project.source.paragraphs.find(item => item.id === paragraphId)!;
  const overlap = project.highlights.some(mark => mark.paragraphId === paragraphId && mark.start < end && mark.end > start);
  const highlights = project.highlights.filter(mark => !(mark.paragraphId === paragraphId && mark.start < end && mark.end > start));
  if (overlap) {
    for (const mark of project.highlights) {
      if (mark.paragraphId !== paragraphId || mark.start >= end || mark.end <= start) continue;
      if (mark.start < start) highlights.push({ ...mark, end: start, quote: paragraph.text.slice(mark.start, start) });
      if (mark.end > end) highlights.push({ ...mark, id: newId(), start: end, quote: paragraph.text.slice(end, mark.end) });
    }
  } else highlights.push({ id: newId(), paragraphId, start, end, quote: paragraph.text.slice(start, end) });
  return { ...project, highlights };
}
