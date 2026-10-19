import express from 'express';
import { chromium } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject } from '../models/project';

const root = fileURLToPath(new URL('../..', import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 4317);
const baseURL = `http://127.0.0.1:${port}`;
let busy = false;
app.use(express.json({ limit: '5mb' }));
app.post('/api/export', async (request, response) => {
  if (request.headers.origin && request.headers.origin !== baseURL) { response.status(403).send('只允许本机编辑器发起导出。'); return; }
  if (busy) { response.status(409).send('正在导出另一个项目，请稍后重试。'); return; }
  busy = true;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let result: Buffer | undefined;
  let contentType = 'application/zip';
  let failure = '';
  try {
    const project = parseProject(request.body.project);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 1 });
    await page.goto(`${baseURL}/render`);
    await page.waitForFunction(() => typeof window.renderProject === 'function');
    const signature = await page.evaluate(input => window.renderProject(input), project);
    if (signature !== request.body.signature) throw new Error('导出与预览分页不一致，请刷新预览后再导出；请使用 Chromium/Chrome/Edge 浏览器。');
    const count = await page.locator('.card').count();
    const requested = request.body.page as number | undefined;
    if (requested !== undefined && (!Number.isInteger(requested) || requested < 1 || requested > count)) throw new Error('页码无效。');
    const files: Record<string, Uint8Array> = {};
    let single: Buffer | undefined;
    for (let index = 0; index < count; index++) {
      if (requested !== undefined && index !== requested - 1) continue;
      const png = await page.locator('.card').nth(index).screenshot({ animations: 'disabled', timeout: 60000 });
      if (requested !== undefined) { single = png; break; }
      files[`page-${String(index + 1).padStart(2, '0')}.png`] = png;
    }
    files['project.json'] = strToU8(JSON.stringify(project, null, 2));
    result = single ?? Buffer.from(zipSync(files));
    contentType = single ? 'png' : 'application/zip';
  } catch (reason) {
    failure = `本地导出失败：${reason instanceof Error ? reason.message : String(reason)}`;
  }
  finally {
    try { await browser?.close(); }
    catch (reason) { failure += `${failure ? '；' : '本地导出失败：'}浏览器清理失败：${reason instanceof Error ? reason.message : String(reason)}`; }
    busy = false;
  }
  if (failure) response.status(400).type('text').send(failure);
  else response.type(contentType).send(result);
});
if (process.argv.includes('--production')) {
  app.use(express.static(resolve(root, 'artifacts/dist')));
  app.get('/render', (_request, response) => response.sendFile(resolve(root, 'artifacts/dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, configFile: resolve(root, 'tools/vite.config.ts'), server: { middlewareMode: true, host: '127.0.0.1', hmr: false } });
  app.use(vite.middlewares);
}
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).send(`请求失败：${error.message}`));
app.listen(port, '127.0.0.1', () => console.log(`英语精读编辑器：${baseURL}`));
