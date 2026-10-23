import { expect, it, vi } from 'vitest';
import fixture from '../assets/projects/brainco/project.json';
import { layoutKey, parseRenderProject } from '../src/models/project';
import { requestExport, restoreDraft } from '../src/services/projectIO';
import type { LayoutDiagnostics } from '../src/services/layoutVerification';

it('rejects an old-format draft while preserving its original bytes in quarantine', () => {
  const raw = JSON.stringify({ project: { ...fixture, schemaVersion: 2 } });
  const store = new Map([['reading-editor.draft.v2', raw]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  try {
    const restored = restoreDraft();
    expect(restored.project.schemaVersion).toBe(5);
    expect(restored.rejected).toBe(raw);
    expect(restored.notice).toContain('格式不受支持');
    expect(store.get('reading-editor.rejected-draft')).toBe(raw);
    expect(store.get('reading-editor.draft.v2')).toBe(raw);
  } finally { vi.unstubAllGlobals(); }
});

it('keeps large line diagnostics within the existing export request budget', async () => {
  const project = parseRenderProject(fixture);
  const diagnostics: LayoutDiagnostics = { projectSignature: 'a'.repeat(64), pages: 100, records: Array.from({ length: 4000 }, (_, index) => [1, layoutKey('article', '\u0001'.repeat(200)), index, index + 1, 0, 40, 1092, false]) };
  const fetchMock = vi.fn(async () => new Response('image'));
  vi.stubGlobal('fetch', fetchMock);
  try {
    await requestExport(project, 'signature', undefined, diagnostics);
    const options = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = options.body as string;
    expect(new Blob([body]).size).toBeLessThan(5 * 1024 * 1024);
    expect(JSON.parse(body)).toEqual({ project, signature: 'signature', diagnostics: { projectSignature: diagnostics.projectSignature, pages: 100 } });
  } finally { vi.unstubAllGlobals(); }
});

it('does not let summary diagnostics push an otherwise valid request over the limit', async () => {
  const project = parseRenderProject(fixture);
  project.source.paragraphs = Array.from({ length: 18 }, (_, index) => ({ id: `boundary-${index}`, text: index < 17 ? 'a'.repeat(300000) : '' }));
  const limit = 5 * 1024 * 1024;
  const overhead = new Blob([JSON.stringify({ project, signature: 'signature' })]).size;
  project.source.paragraphs[17].text = 'b'.repeat(limit - overhead);
  expect(() => parseRenderProject(project)).not.toThrow();
  const diagnostics: LayoutDiagnostics = { projectSignature: 'a'.repeat(64), pages: 100, records: [] };
  const fetchMock = vi.fn(async () => new Response('image')); vi.stubGlobal('fetch', fetchMock);
  try {
    await requestExport(project, 'signature', undefined, diagnostics);
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    expect(new Blob([body]).size).toBeLessThanOrEqual(limit);
    expect(JSON.parse(body).project).toEqual(project);
  } finally { vi.unstubAllGlobals(); }
});
