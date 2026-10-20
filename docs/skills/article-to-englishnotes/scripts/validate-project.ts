import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyEntryHighlights, parseProject, defaults } from '../../../../src/models/project';

const files = process.argv.slice(2);
const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url));
let failed = false;
for (const path of files.length ? files : [skillPath]) {
  try {
    const text = await readFile(path, 'utf8');
    const source = files.length ? text : text.match(/```json\r?\n([\s\S]*?)\r?\n```/)?.[1];
    if (!source) throw new Error('SKILL.md 中缺少完整 JSON 示例');
    const input = JSON.parse(source);
    if (input.schemaVersion !== 2) throw new Error('本 skill 生成文件必须使用 schemaVersion: 2');
    const project = applyEntryHighlights(parseProject(input));
    if (!files.length && JSON.stringify(project.styles) !== JSON.stringify(defaults)) throw new Error('示例默认样式与程序不一致');
    if (!files.length && project.personalizedHeader !== parseProject({ ...input, personalizedHeader: undefined }).personalizedHeader) throw new Error('示例默认页眉与程序不一致');
    console.log(`PASS ${path}: 原文 ${project.source.paragraphs.length} 段，译文 ${project.translation.paragraphs.length} 段，词汇 ${project.vocabulary.length} 项，表达 ${project.expressions.length} 项，高亮 ${project.highlights.length} 处`);
  } catch (reason) {
    failed = true;
    console.error(`FAIL ${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
}
if (failed) process.exitCode = 1;
