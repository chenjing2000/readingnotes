import { layoutKey, type Project, type Styles } from '../models/project';

export type Block = { id: string; text: string; kind: string; indent?: boolean; gap?: number; runs?: { start: number; end: number; kind: string }[] };
export type Line = { block: Block; start: number; end: number; indent: boolean; height: number };
export type Layout = { pages: HTMLElement[]; signature: string; warnings: string[] };
const FONT = '"Nunito Sans", "Noto Sans SC", "Microsoft YaHei", sans-serif';

function typography(block: Block, styles: Styles): Partial<CSSStyleDeclaration> {
  let fontSize = styles.bodySize;
  let lineHeight = styles.lineHeight;
  let fontWeight = '400';
  let color = '#1f1f1f';
  switch (block.kind) {
    case 'title': fontSize = styles.titleSize; lineHeight = 1.22; fontWeight = '800'; break;
    case 'section-heading': fontSize = 24; lineHeight = 1.4; fontWeight = '800'; color = styles.divider; break;
    case 'vocab-heading': fontSize = 22; lineHeight = 1.4; fontWeight = '800'; color = '#444'; break;
    case 'vocab': fontSize = 29; lineHeight = 1.6; break;
    case 'word': fontSize = 33; fontWeight = '800'; color = styles.accent; break;
    case 'ipa': fontSize = 23; color = '#666'; break;
    case 'pos': fontSize = 25; color = '#666'; break;
    case 'vocab-meaning': fontSize = 27; break;
    case 'phrase': fontSize = styles.phraseSize; lineHeight = 1.25; fontWeight = '800'; color = styles.accent; break;
    case 'meaning': fontSize = 33; lineHeight = 1.35; break;
    case 'example': fontSize = 34; lineHeight = 1.43; break;
    case 'exampleTranslation': fontSize = 31; lineHeight = 1.45; color = '#555'; break;
    case 'translation': fontSize = styles.translationSize; lineHeight = styles.translationLineHeight; break;
    case 'mainIdea': fontSize = 36; lineHeight = 1.54; break;
  }
  return { fontSize: `${fontSize}px`, lineHeight: String(lineHeight), fontWeight, color, fontFamily: FONT, letterSpacing: block.kind === 'article' ? '-0.2px' : 'normal' };
}

function appendText(element: HTMLElement, project: Project, block: Block, start: number, end: number) {
  const marks = block.kind === 'article' ? project.highlights.filter(mark => mark.paragraphId === block.id && mark.start < end && mark.end > start) : [];
  const runs = block.runs?.filter(run => run.start < end && run.end > start) ?? [];
  const boundaries = [...new Set([start, end, ...marks.flatMap(mark => [Math.max(start, mark.start), Math.min(end, mark.end)]), ...runs.flatMap(run => [Math.max(start, run.start), Math.min(end, run.end)])])].sort((first, second) => first - second);
  for (let index = 0; index < boundaries.length - 1; index++) {
    const left = boundaries[index], right = boundaries[index + 1];
    const value = block.text.slice(left, right);
    if (marks.some(mark => mark.start <= left && mark.end >= right)) {
      const strong = document.createElement('strong'); strong.className = 'hot'; strong.textContent = value;
      strong.style.color = project.styles.accent; element.append(strong);
    } else {
      const run = runs.find(run => run.start <= left && run.end >= right);
      if (run) {
        const span = document.createElement('span');
        Object.assign(span.style, typography({ ...block, kind: run.kind === 'meaning' ? 'vocab-meaning' : run.kind }, project.styles), { lineHeight: 'inherit' });
        span.dataset.edit = `${block.id}:${run.kind}`; span.textContent = value; element.append(span);
      } else element.append(document.createTextNode(value));
    }
  }
}

export function measureLines(project: Project, block: Block, width: number, host: HTMLElement, fitWidth = width): Line[] {
  const measure = document.createElement('div');
  Object.assign(measure.style, typography(block, project.styles), { width: `${width}px`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textIndent: block.indent ? '2em' : '0' });
  appendText(measure, project, block, 0, block.text.length);
  host.append(measure);
  const computed = getComputedStyle(measure);
  const measureLeft = measure.getBoundingClientRect().left;
  const height = parseFloat(computed.lineHeight);
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(measure, NodeFilter.SHOW_TEXT);
  let total = 0, current: Node | null;
  while ((current = walker.nextNode())) { nodes.push({ node: current as Text, start: total, end: total + current.textContent!.length }); total += current.textContent!.length; }
  const range = document.createRange();
  let nodeIndex = 0, lineStart = 0, previousTop: number | undefined;
  let glyphHeight = 0;
  let farthestRight = 0, widestGlyph = 0;
  const lines: Line[] = [];
  const segments = new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(block.text);
  for (const segment of segments) {
    const start = segment.index, end = start + segment.segment.length;
    while (nodes[nodeIndex] && start >= nodes[nodeIndex].end) nodeIndex++;
    const first = nodes[nodeIndex];
    let lastIndex = nodeIndex;
    while (nodes[lastIndex] && end > nodes[lastIndex].end) lastIndex++;
    const last = nodes[lastIndex];
    if (!first || !last) throw new Error(`无法测量内容 ${block.id}`);
    range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start);
    const rect = range.getBoundingClientRect();
    glyphHeight = Math.max(glyphHeight, rect.height);
    if (segment.segment.trim()) {
      farthestRight = Math.max(farthestRight, rect.right - measureLeft);
      widestGlyph = Math.max(widestGlyph, rect.width);
    }
    const top = rect.height > 0 ? rect.top : previousTop;
    if (previousTop !== undefined && top !== undefined && top > previousTop + height * 0.5) {
      lines.push({ block, start: lineStart, end: start, indent: !!block.indent && lineStart === 0, height });
      lineStart = start;
    }
    if (top !== undefined) previousTop = top;
  }
  lines.push({ block, start: lineStart, end: block.text.length, indent: !!block.indent && lineStart === 0, height });
  measure.remove();
  for (const line of lines) {
    const probe = renderLine(project, line, fitWidth); host.append(probe);
    const left = probe.getBoundingClientRect().left;
    const textNodes = document.createTreeWalker(probe, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = textNodes.nextNode())) {
      const lastVisible = /\S(?=\s*$)/u.exec(node.textContent!);
      if (!lastVisible) continue;
      range.setStart(node, lastVisible.index); range.setEnd(node, lastVisible.index + lastVisible[0].length);
      const rect = range.getBoundingClientRect();
      farthestRight = Math.max(farthestRight, rect.right - left);
      widestGlyph = Math.max(widestGlyph, rect.width);
    }
    probe.remove();
  }
  if (farthestRight > fitWidth + .1) {
    if (width <= widestGlyph + 1) throw new Error(`内容 ${block.id} 的单个字形无法放入当前栏宽，请减小字号或边距。`);
    host.dataset.adjustedWrap = 'true';
    return measureLines(project, block, width - Math.ceil(widestGlyph), host, fitWidth);
  }
  const safeHeight = Math.max(height, glyphHeight);
  if (safeHeight > height + .1) host.dataset.adjustedLineHeight = 'true';
  return lines.map(line => ({ ...line, height: safeHeight }));
}

function renderLine(project: Project, line: Line, width: number) {
  const element = document.createElement('div');
  element.className = `text-line ${line.block.kind}`;
  Object.assign(element.style, typography(line.block, project.styles), { width: `${width}px`, height: `${line.height}px`, lineHeight: `${line.height}px`, whiteSpace: 'pre', textIndent: line.indent ? '2em' : '0' });
  element.dataset.source = line.block.id; element.dataset.start = String(line.start); element.dataset.end = String(line.end);
  element.dataset.kind = line.block.kind;
  element.dataset.key = layoutKey(line.block.kind, line.block.id);
  appendText(element, project, line.block, line.start, line.end);
  return element;
}

export async function paginate(project: Project): Promise<Layout> {
  const host = document.createElement('div'); host.className = 'measurement';
  Object.assign(host.style, { position: 'absolute', left: '-20000px', top: '0', visibility: 'hidden' });
  document.body.append(host);
  try {
    const fontText = [project.title, ...project.source.paragraphs.map(item => item.text), ...project.translation.paragraphs.map(item => item.text), ...project.vocabulary.map(item => item.word + item.ipa + item.meaning), ...project.expressions.map(item => item.phrase + item.meaning + item.example + item.exampleTranslation), project.mainIdea].join('');
    try {
      await Promise.all([document.fonts.load('400 36px "Nunito Sans"', fontText), document.fonts.load('800 36px "Nunito Sans"', fontText), document.fonts.load('400 32px "Noto Sans SC"', fontText), document.fonts.load('700 32px "Noto Sans SC"', fontText)]);
    } catch { throw new Error('本地字体加载失败。请按 README 重新安装依赖并构建，再刷新页面；项目仍可保存 JSON。'); }
    await document.fonts.ready;
    const warnings: string[] = [];
    if (!document.fonts.check('400 32px "Noto Sans SC"', '中文')) warnings.push('中文字体未就绪，使用系统字体；请确认预览后重试导出。');
    const styles = project.styles;
    const width = 1200 - 2 * styles.marginX;
    const bodyTop = styles.marginTop + 42;
    const bodyHeight = 1600 - bodyTop - styles.marginBottom;
    const pages: HTMLElement[] = [];
    let pageBody: HTMLElement;
    let used = 0;
    const records: unknown[] = [];
    const coverage = new Map<string, { original: string; pieces: { start: number; end: number }[] }>();
    function newPage() {
      const page = document.createElement('section'); page.className = 'card'; page.dataset.page = String(pages.length + 1);
      const eyebrow = document.createElement('div'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'ENGLISH READING';
      Object.assign(eyebrow.style, { top: `${styles.marginTop}px`, left: `${styles.marginX}px` });
      pageBody = document.createElement('main'); pageBody.className = 'page-body';
      Object.assign(pageBody.style, { top: `${bodyTop}px`, left: `${styles.marginX}px`, width: `${width}px`, height: `${bodyHeight}px` });
      const footer = document.createElement('footer'); footer.className = 'footer';
      Object.assign(footer.style, { left: `${styles.marginX}px`, right: `${styles.marginX}px` });
      const label = document.createElement('span'); label.textContent = 'ARTICLE - VOCABULARY- EXPRESSIONS - MAIN IDEA - TRANSLATION';
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!; context.font = '17px "Nunito Sans"';
      const labelWidth = context.measureText(label.textContent).width + .4 * label.textContent.length;
      const factor = Math.min(1, (width - 110) / labelWidth);
      label.style.fontSize = `${17 * factor}px`; label.style.letterSpacing = `${.4 * factor}px`;
      footer.append(label, document.createElement('span'));
      page.append(eyebrow, pageBody, footer); pages.push(page); used = 0;
    }
    newPage();
    function addRow(lines: (Line | undefined)[], columnWidth: number, gap: number) {
      const height = Math.max(...lines.map(line => line?.height ?? 0));
      if (height > bodyHeight) throw new Error('字号或边距过大，一行文字无法放入页面。请恢复模板默认。');
      if (used + gap + height > bodyHeight + 0.01 && used > 0) newPage();
      else used += gap;
      const row = document.createElement('div'); row.className = lines.length === 2 ? 'vocab-row' : 'flow-row';
      Object.assign(row.style, { position: 'absolute', left: '0', top: `${used}px`, display: 'flex', gap: '36px', width: `${width}px`, height: `${height}px` });
      lines.forEach(line => {
        if (line) {
          const element = renderLine(project, line, columnWidth); row.append(element);
          const key = layoutKey(line.block.kind, line.block.id);
          const source = coverage.get(key) ?? { original: line.block.text, pieces: [] };
          source.pieces.push({ start: line.start, end: line.end }); coverage.set(key, source);
          records.push([pages.length, key, line.start, line.end, used, line.height, columnWidth, line.indent]);
        } else { const empty = document.createElement('div'); empty.style.width = `${columnWidth}px`; row.append(empty); }
      });
      pageBody!.append(row); used += height;
    }
    function block(value: Block) {
      if (project.layoutOverrides.manualPageBreaks.includes(layoutKey(value.kind, value.id)) && used > 0) newPage();
      const lines = measureLines(project, value, width, host);
      lines.forEach((line, index) => addRow([line], width, index === 0 ? (value.gap ?? 0) : 0));
    }
    block({ id: 'title', text: project.title, kind: 'title', gap: 0 });
    project.source.paragraphs.forEach(item => block({ ...item, kind: 'article', indent: true, gap: styles.paragraphGap }));
    if (project.vocabulary.length) {
      block({ id: 'vocab-heading', text: 'VOCABULARY', kind: 'vocab-heading', gap: 25 });
      const middle = Math.ceil(project.vocabulary.length / 2);
      const columnWidth = (width - 36) / 2;
      for (let index = 0; index < middle; index++) {
        const entries = [project.vocabulary[index * 2], project.vocabulary[index * 2 + 1]];
        const columns = entries.map(entry => {
          if (!entry) return [];
          let text = '';
          const runs: NonNullable<Block['runs']> = [];
          for (const field of ['word', 'ipa', 'pos', 'meaning'] as const) {
            if (field === 'ipa' && !entry.ipa) continue;
            if (text) text += ' ';
            const start = text.length; text += entry[field] ?? '';
            runs.push({ start, end: text.length, kind: field });
          }
          return measureLines(project, { id: entry.id, text, kind: 'vocab', runs }, columnWidth, host);
        });
        if (entries.some(entry => entry && project.layoutOverrides.manualPageBreaks.includes(layoutKey('vocab', entry.id))) && used > 0) newPage();
        for (let lineIndex = 0; lineIndex < Math.max(...columns.map(column => column.length)); lineIndex++) addRow([columns[0][lineIndex], columns[1][lineIndex]], columnWidth, lineIndex === 0 ? 15 : 0);
      }
    }
    block({ id: 'expressions-heading', text: 'USEFUL EXPRESSIONS · 有用表达', kind: 'section-heading', gap: 25 });
    for (const entry of project.expressions) for (const field of ['phrase', 'meaning', 'example', 'exampleTranslation'] as const) {
      block({ id: `${entry.id}:${field}`, text: entry[field], kind: field, gap: field === 'phrase' ? 20 : field === 'example' ? 10 : 7 });
    }
    block({ id: 'main-heading', text: 'MAIN IDEA · 主要内容', kind: 'section-heading', gap: 25 });
    block({ id: 'mainIdea', text: project.mainIdea, kind: 'mainIdea', gap: 14 });
    block({ id: 'translation-heading', text: 'CHINESE TRANSLATION · 中文译文', kind: 'section-heading', gap: 25 });
    project.translation.paragraphs.forEach(item => block({ ...item, kind: 'translation', indent: true, gap: styles.paragraphGap }));
    for (const [id, source] of coverage) {
      let cursor = 0;
      for (const piece of source.pieces) { if (piece.start !== cursor) throw new Error(`分页连续性错误：${id}`); cursor = piece.end; }
      if (cursor !== source.original.length) throw new Error(`分页内容缺失：${id}`);
    }
    pages.forEach((page, index) => { page.querySelector('.footer')!.lastElementChild!.textContent = `${String(index + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`; });
    if (host.dataset.adjustedLineHeight) warnings.push('部分行距小于字体字形包围框，已增加实际行高以避免裁切。');
    if (host.dataset.adjustedWrap) warnings.push('部分标点会悬挂出文本框，已缩小实际换行宽度，确保文字完整可见。');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([project, records])));
    const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { pages, signature, warnings };
  } finally { host.remove(); }
}
