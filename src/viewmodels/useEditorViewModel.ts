import { useEffect, useRef, useState } from 'react';
import { commitEntryHead, defaults, editParagraph, emptySense, newId, parseProject, removeEntrySense, splitSenseMeaning, toggleHighlight, type EntryCollection, projectDocument, styleSchema, type RenderProject, type Project, type Sense, type Styles } from '../models/project';
import { paginate, type Layout } from '../services/pagination';
import { cacheDraft, download, loadSettings, saveSettings, readProject, requestExport, restoreDraft } from '../services/projectIO';

type ParagraphCollection = 'source' | 'translation';
const stringify = (project: Project) => JSON.stringify(projectDocument(project as RenderProject), null, 2);

export function useEditorViewModel() {
  const [boot] = useState(restoreDraft);
  const [history, setHistory] = useState<{ past: RenderProject[]; present: RenderProject; future: RenderProject[] }>({ past: [], present: { ...boot.project, styles: { ...defaults } }, future: [] });
  const project = history.present;
  const [vocabularySelection, setVocabularySelection] = useState<string | null>(null);
  const vocabularyIndex = project.vocabulary.findIndex(entry => entry.id === vocabularySelection);
  const selectedVocabularyIndex = vocabularyIndex >= 0 ? vocabularyIndex : project.vocabulary.length ? 0 : -1;
  const selectedVocabulary = project.vocabulary[selectedVocabularyIndex];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const error = Object.values(errors)[0] ?? '';
  const [warning, setWarning] = useState<{ text: string } | null>(null);
  function reportError(source: string, text: string) {
    setErrors(current => {
      if ((current[source] ?? '') === text) return current;
      const next = { ...current }; if (text) next[source] = text; else delete next[source]; return next;
    });
  }
  function showWarning(text: string) { setWarning({ text }); }
  useEffect(() => {
    if (!warning) return;
    const timer = setTimeout(() => setWarning(current => current === warning ? null : current), 10000);
    return () => clearTimeout(timer);
  }, [warning]);
  useEffect(() => {
    if (boot.rejected && !boot.cacheBlocked) showWarning(boot.notice);
  }, []);
  useEffect(() => { if (project.warnings.length) showWarning(project.warnings.join(' ')); }, [project.warnings]);
  const [lastFile, setLastFile] = useState('');
  const [rendered, setRendered] = useState<{ project: RenderProject; layout: Layout } | null>(null);
  const [highlightRefresh, setHighlightRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const openRequest = useRef(0);
  const [settingsReady, setSettingsReady] = useState(false);
  const savedSettings = useRef('');
  const settingsQueue = useRef(Promise.resolve());
  const pendingSettingsSaves = useRef(0);
  const settingsRevision = useRef(0);
  const ready = settingsReady && !opening && rendered?.project === project;
  const hasFileChanges = lastFile !== stringify(project);

  function update(next: Project | ((current: RenderProject) => Project)) {
    setHistory(current => {
      const result = typeof next === 'function' ? next(current.present) : next;
      if (result === current.present) return current;
      return { past: [...current.past.slice(-9), current.present], present: { ...result, styles: 'styles' in result ? (result as RenderProject).styles : current.present.styles }, future: [] };
    });
  }
  function undo() { setHistory(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current); }
  function redo() { setHistory(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current); }

  useEffect(() => {
    let cancelled = false;
    loadSettings().then(result => {
      if (cancelled) return;
      const styles = styleSchema.parse(result.settings);
      savedSettings.current = JSON.stringify(styles);
      setHistory(current => ({ past: [], present: { ...current.present, styles }, future: [] }));
      if (result.error) showWarning(result.error); setSettingsReady(true);
    }).catch(reason => { if (!cancelled) { reportError('settings-load', `配置读取失败：${String(reason)}。请刷新重试。`); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!settingsReady) return;
    const revision = ++settingsRevision.current;
    const parsed = styleSchema.safeParse(project.styles);
    if (!parsed.success) { reportError('settings-validation', `配置无效，未保存：${parsed.error.issues.map(issue => issue.message).join(' ')}`); return; }
    reportError('settings-validation', '');
    const serialized = JSON.stringify(parsed.data);
    if (serialized === savedSettings.current && pendingSettingsSaves.current === 0) {
      reportError('settings-save', '');
      return;
    }
    const timer = setTimeout(() => {
      pendingSettingsSaves.current++;
      settingsQueue.current = settingsQueue.current.then(async () => {
        try {
          if (revision !== settingsRevision.current) return;
          await saveSettings(parsed.data); savedSettings.current = serialized;
          if (revision === settingsRevision.current) reportError('settings-save', '');
        } catch (reason) { if (revision === settingsRevision.current) reportError('settings-save', `配置未保存：${String(reason)}`); }
        finally { pendingSettingsSaves.current--; }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [project.styles, settingsReady]);

  useEffect(() => {
    if (boot.cacheBlocked) { reportError('draft', '自动缓存已停用，旧草稿未覆盖，请保存 JSON。'); return; }
    try {
      cacheDraft(project);
      reportError('draft', '');
    } catch { reportError('draft', '自动草稿保存失败！请立即下载 JSON 备份。'); }
  }, [project]);
  useEffect(() => {
    if (!settingsReady) return;
    const valid = styleSchema.safeParse(project.styles);
    if (!valid.success) { setRendered(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      paginate(project).then(layout => {
        if (cancelled) return;
        setRendered({ project, layout });
        window.editor = { project, signature: layout.signature, diagnostics: layout.diagnostics };
        reportError('pagination', '');
        if (layout.warnings.length) showWarning(layout.warnings.join(' '));
      }).catch(reason => { if (!cancelled) reportError('pagination', `分页失败：${String(reason)}。请检查字号、边距或恢复模板默认。`); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project, highlightRefresh, settingsReady]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasFileChanges || pendingSettingsSaves.current > 0 || (settingsReady && JSON.stringify(project.styles) !== savedSettings.current)) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasFileChanges, settingsReady, project.styles]);

  async function open(file?: File) {
    if (!file) return;
    const request = ++openRequest.current;
    setOpening(true);
    try {
      const next = await readProject(file);
      if (request !== openRequest.current) return;
      update(next); setLastFile(stringify(next)); reportError('import', '');
    } catch (reason) { if (request === openRequest.current) reportError('import', `无法打开项目：${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { if (request === openRequest.current) setOpening(false); }
  }
  function save() {
    try {
      const contents = stringify(parseProject(projectDocument(project)));
      download(new Blob([contents], { type: 'application/json' }), 'reading-project.json');
      setLastFile(contents); reportError('save', '');
    } catch (reason) { reportError('save', `项目保存失败：${String(reason)}`); }
  }
  async function exportImages(page?: number) {
    if (!ready || exporting) return;
    setExporting(true);
    try {
      const image = await requestExport(project, rendered.layout.signature, page, rendered.layout.diagnostics);
      download(image, page ? `page-${String(page).padStart(2, '0')}.png` : 'reading-cards.zip');
      reportError('export', '');
    } catch (reason) { reportError('export', `导出失败：${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { setExporting(false); }
  }
  function setProjectText(key: 'title' | 'mainIdea' | 'personalizedHeader', value: string) {
    update(current => ({ ...current, [key]: value }));
  }
  function setParagraphText(key: ParagraphCollection, id: string, text: string) {
    update(current => key === 'source' ? editParagraph(current, id, text) : { ...current, translation: { paragraphs: current.translation.paragraphs.map(item => item.id === id ? { ...item, text } : item) } });
  }
  function addParagraph(key: ParagraphCollection) {
    update(current => ({ ...current, [key]: { paragraphs: [...current[key].paragraphs, { id: newId(), text: '' }] } }));
  }
  function highlightRange(paragraphId: string, start: number, end: number) {
    if (start === end) { showWarning('请先在英文段落中选择要标注的文字。'); return; }
    const next = toggleHighlight(project, paragraphId, start, end);
    if (next === project) { showWarning('请选择完整的单词或词组。'); return; }
    update(next);
  }
  function refreshHighlights() {
    setRendered(null);
    setHighlightRefresh(current => current + 1);
  }
  function reorder(key: EntryCollection, index: number, direction: number) {
    update(current => { const list = [...current[key]]; const destination = index + direction; if (destination < 0 || destination >= list.length) return current; [list[index], list[destination]] = [list[destination], list[index]]; return { ...current, [key]: list }; });
  }
  function setEntryField(key: EntryCollection, id: string, property: string, value: string) {
    update(current => ({ ...current, [key]: current[key].map(item => item.id === id ? { ...item, [property]: value } : item) }));
  }
  function commitHead(key: EntryCollection, id: string, value: string) {
    try {
      const next = commitEntryHead(project, key, id, value);
      if (next !== project) update(next);
      reportError('entry', '');
    } catch (reason) { reportError('entry', `词条保存失败：${String(reason)}`); }
  }
  function setSenseField(key: EntryCollection, id: string, index: number, field: keyof Sense, value: string) {
    update(current => ({ ...current, [key]: current[key].map(entry => entry.id === id ? { ...entry, senses: entry.senses.map((sense, i) => i === index ? { ...sense, [field]: value } : sense) } : entry) }));
  }
  function setVocabularyMeaning(id: string, index: number, value: string) {
    update(current => ({ ...current, vocabulary: current.vocabulary.map(entry => entry.id === id ? { ...entry, senses: entry.senses.map((sense, i) => i === index ? { ...sense, ...splitSenseMeaning(value, sense.pos) } : sense) } : entry) }));
  }
  function addSense(key: EntryCollection, id: string) {
    update(current => ({ ...current, [key]: current[key].map(entry => entry.id === id ? { ...entry, senses: [...entry.senses, emptySense()] } : entry) }));
  }
  function removeSense(key: EntryCollection, id: string, index: number) {
    update(current => removeEntrySense(current, key, id, index));
  }
  function addEntry(key: EntryCollection) {
    update(current => ({ ...current, [key]: [...current[key], key === 'vocabulary' ? { id: newId(), word: '', ipa: '', highlight: [], senses: [emptySense()] } : { id: newId(), phrase: '', highlight: [], senses: [emptySense()] }] }));
  }
  function removeEntry(key: EntryCollection, id: string) {
    update(current => ({ ...current, [key]: current[key].filter(item => item.id !== id) }));
  }
  function selectVocabulary(id: string) { setVocabularySelection(id); }
  function moveSelectedVocabulary(direction: number) {
    if (!selectedVocabulary) return;
    setVocabularySelection(selectedVocabulary.id);
    reorder('vocabulary', selectedVocabularyIndex, direction);
  }
  function deleteSelectedVocabulary() {
    if (!selectedVocabulary) return;
    const next = project.vocabulary[selectedVocabularyIndex + 1] ?? project.vocabulary[selectedVocabularyIndex - 1];
    setVocabularySelection(next?.id ?? null);
    removeEntry('vocabulary', selectedVocabulary.id);
  }
  function insertVocabularyBelow() {
    const entry = { id: newId(), word: '', ipa: '', highlight: [], senses: [emptySense()] };
    update(current => {
      const vocabulary = [...current.vocabulary];
      const index = vocabulary.findIndex(item => item.id === selectedVocabulary?.id);
      vocabulary.splice(index + 1, 0, entry);
      return { ...current, vocabulary };
    });
    setVocabularySelection(entry.id);
    return entry.id;
  }
  function setStyle<K extends keyof Styles>(key: K, value: Styles[K]) {
    update(current => ({ ...current, styles: { ...current.styles, [key]: value } }));
  }
  function resetStyles() { savedSettings.current = ''; update(current => ({ ...current, styles: { ...defaults } })); }
  function clearError() { const source = Object.keys(errors)[0]; if (source) reportError(source, ''); }
  function downloadRejectedDraft() {
    if (boot.rejected) download(new Blob([boot.rejected], { type: 'text/plain' }), 'rejected-draft.txt');
  }

  return {
    project, warning, error, settingsReady, ready, exporting, hasFileChanges,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    layout: rendered?.layout, pages: rendered?.layout.pages.length ?? 0, rejectedDraft: boot.rejected,
    undo, redo, open, save, exportImages, setProjectText, setParagraphText, addParagraph,
    highlightRange, refreshHighlights, commitHead, setSenseField, setVocabularyMeaning, addSense, removeSense, reorder, setEntryField, addEntry, removeEntry, setStyle, resetStyles,
    selectedVocabulary, selectedVocabularyIndex, selectVocabulary, moveSelectedVocabulary, deleteSelectedVocabulary, insertVocabularyBelow,
    clearError, downloadRejectedDraft,
  };
}
