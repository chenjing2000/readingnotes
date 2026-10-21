import { expect, it, vi } from 'vitest';
import fixture from '../assets/reference/project.schema2.json';
import { layoutKey, parseProject } from '../src/models/project';
import { requestExport } from '../src/services/projectIO';
import type { LayoutDiagnostics } from '../src/services/layoutVerification';

it('keeps large line diagnostics within the existing export request budget', async () => {
  const project = parseProject(fixture);
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
  const project = parseProject(fixture);
  project.source.paragraphs = Array.from({ length: 18 }, (_, index) => ({ id: `boundary-${index}`, text: index < 17 ? 'a'.repeat(300000) : '' }));
  const limit = 5 * 1024 * 1024;
  const overhead = new Blob([JSON.stringify({ project, signature: 'signature' })]).size;
  project.source.paragraphs[17].text = 'b'.repeat(limit - overhead);
  expect(() => parseProject(project)).not.toThrow();
  const diagnostics: LayoutDiagnostics = { projectSignature: 'a'.repeat(64), pages: 100, records: [] };
  const fetchMock = vi.fn(async () => new Response('image')); vi.stubGlobal('fetch', fetchMock);
  try {
    await requestExport(project, 'signature', undefined, diagnostics);
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    expect(new Blob([body]).size).toBeLessThanOrEqual(limit);
    expect(JSON.parse(body).project).toEqual(project);
  } finally { vi.unstubAllGlobals(); }
});
