import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/800.css';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/700.css';
import './views/editor.css';
import EditorView from './views/EditorView';
import { paginate } from './services/pagination';
import { parseProject, type Project } from './models/project';
import type { LayoutDiagnostics } from './services/layoutVerification';

declare global {
  interface Window {
    renderProject: (project: unknown) => Promise<string>;
    editor: { project: Project; signature: string; diagnostics: LayoutDiagnostics };
    renderDiagnostics?: LayoutDiagnostics;
  }
}
if (location.pathname === '/render') {
  document.body.className = 'export-mode';
  window.renderProject = async input => {
    const result = await paginate(parseProject(input));
    document.getElementById('root')!.replaceChildren(...result.pages);
    window.renderDiagnostics = result.diagnostics;
    return result.signature;
  };
} else createRoot(document.getElementById('root')!).render(<React.StrictMode><EditorView /></React.StrictMode>);
