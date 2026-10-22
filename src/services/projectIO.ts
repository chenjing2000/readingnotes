import fixture from '../../assets/projects/brainco/project.json';
import { parseProject, projectDocument, type Project, type RenderProject } from '../models/project';
import type { LayoutDiagnostics } from './layoutVerification';

const DRAFT = 'reading-editor.draft.v2';

export function restoreDraft(): { project: Project; notice: string; cacheBlocked: boolean; rejected?: string } {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(DRAFT);
    if (saved) return { project: parseProject(JSON.parse(saved).project), notice: '已恢复本机自动草稿；请另存 JSON 作为可移植备份。', cacheBlocked: false };
  } catch {
    let preserved = false;
    if (saved) try {
      localStorage.setItem(`reading-editor.rejected-draft.${Date.now()}`, saved);
      localStorage.setItem('reading-editor.rejected-draft', saved);
      preserved = true;
    } catch { preserved = false; }
    return { project: parseProject(fixture), notice: preserved ? '草稿格式不受支持或无法读取，已隔离备份，可下载原始草稿。当前显示样例。' : '草稿无法读取或备份，自动缓存已停用以保护旧数据；请保存 JSON。', cacheBlocked: !preserved, rejected: saved ?? undefined };
  }
  return { project: parseProject(fixture), notice: '已加载 BrainCo 完整样例。所有处理均在本机完成。', cacheBlocked: false };
}

export function cacheDraft(project: RenderProject) {
  localStorage.setItem(DRAFT, JSON.stringify({ project: projectDocument(project), modifiedAt: new Date().toISOString() }));
}

export async function readProject(file: File) {
  return parseProject(JSON.parse(await file.text()));
}

export function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function requestExport(project: RenderProject, signature: string, page?: number, diagnostics?: LayoutDiagnostics): Promise<Blob> {
  const snapshot = { project, signature, page, diagnostics };
  let body = JSON.stringify(snapshot);
  // Repeated long IDs in line records must not consume the project's 5 MiB request budget.
  if (diagnostics && new Blob([body]).size > 5 * 1024 * 1024) body = JSON.stringify({ ...snapshot, diagnostics: { projectSignature: diagnostics.projectSignature, pages: diagnostics.pages } });
  if (diagnostics && new Blob([body]).size > 5 * 1024 * 1024) body = JSON.stringify({ project, signature, page });
  const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export async function loadSettings() {
  const response = await fetch('/api/settings');
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ settings: import('../models/settings').Styles; error?: string }>;
}
export async function saveSettings(settings: import('../models/settings').Styles) {
  const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings), keepalive: true });
  if (!response.ok) throw new Error(await response.text());
}
