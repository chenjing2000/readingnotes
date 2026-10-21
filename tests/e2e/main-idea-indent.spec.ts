import { test, expect } from '@playwright/test';
import fixture from '../../assets/projects/brainco/project.json' with { type: 'json' };
import { parseProject } from '../../src/models/project';

test('main idea indents only its first line and exports with the same pagination', async ({ page, request }) => {
  await page.goto('/render');
  await page.waitForFunction(() => typeof window.renderProject === 'function');
  const project = parseProject({ ...fixture, source: { paragraphs: [] }, translation: { paragraphs: [] }, vocabulary: [], expressions: [],
    mainIdea: '这是一段用于检查主旨首行缩进和跨页续行的完整文字。'.repeat(70) });
  const signature = await page.evaluate(project => window.renderProject(project), project);
  const lines = page.locator('.mainIdea[data-source="mainIdea"]');
  await expect(lines.first()).toHaveCSS('text-indent', '72px');
  const indents = await lines.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).textIndent));
  expect(new Set(indents.slice(1))).toEqual(new Set(['0px']));
  expect((await lines.allTextContents()).join('')).toBe(project.mainIdea);
  expect(await lines.evaluateAll(nodes => new Set(nodes.map(node => node.closest('.card')!.getAttribute('data-page'))).size)).toBeGreaterThan(1);
  const diagnostics = await page.evaluate(() => window.renderDiagnostics);
  const result = await request.post('/api/export', { data: { project, signature, diagnostics, page: 1 } });
  expect(result.ok(), result.ok() ? '' : await result.text()).toBe(true);
});
