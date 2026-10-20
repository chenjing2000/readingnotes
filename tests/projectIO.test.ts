import { expect, it, vi } from 'vitest';
import fixture from '../assets/projects/brainco/project.json';
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
