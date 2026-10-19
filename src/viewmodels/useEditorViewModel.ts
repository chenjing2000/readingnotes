import { useEffect, useState } from 'react';
import { defaults, editParagraph, newId, parseProject, toggleHighlight, type Project, type Styles } from '../models/project';
import { paginate, type Layout } from '../services/pagination';
import { cacheDraft, download, readProject, requestExport, restoreDraft } from '../services/projectIO';

type EntryCollection = 'vocabulary' | 'expressions';
type ParagraphCollection = 'source' | 'translation';
const stringify = (project: Project) => JSON.stringify(project, null, 2);

export function useEditorViewModel() {
  const [boot] = useState(restoreDraft);
  const [history, setHistory] = useState<{ past: Project[]; present: Project; future: Project[] }>({ past: [], present: boot.project, future: [] });
  const project = history.present;
  const [vocabularySelection, setVocabularySelection] = useState<string | null>(null);
  const vocabularyIndex = project.vocabulary.findIndex(entry => entry.id === vocabularySelection);
  const selectedVocabularyIndex = vocabularyIndex >= 0 ? vocabularyIndex : project.vocabulary.length ? 0 : -1;
  const selectedVocabulary = project.vocabulary[selectedVocabularyIndex];
  const [notice, setNotice] = useState(boot.notice);
  const [error, setError] = useState('');
  const [cacheStatus, setCacheStatus] = useState('');
  const [lastFile, setLastFile] = useState('');
  const [rendered, setRendered] = useState<{ project: Project; layout: Layout } | null>(null);
  const [exporting, setExporting] = useState(false);
  const ready = rendered?.project === project;
  const hasFileChanges = lastFile !== stringify(project);

  function update(next: Project | ((current: Project) => Project)) {
    setHistory(current => ({ past: [...current.past.slice(-99), current.present], present: typeof next === 'function' ? next(current.present) : next, future: [] }));
  }
  function undo() { setHistory(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current); }
  function redo() { setHistory(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current); }

  useEffect(() => {
    if (boot.cacheBlocked) { setCacheStatus('自动缓存已停用，旧草稿未覆盖，请保存 JSON。'); return; }
    try {
      cacheDraft(project);
      setCacheStatus(`自动草稿 ${new Date().toLocaleTimeString()}`);
    } catch { setCacheStatus('自动草稿保存失败！请立即下载 JSON 备份。'); }
  }, [project]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      paginate(project).then(layout => {
        if (cancelled) return;
        setRendered({ project, layout });
        window.editor = { project, signature: layout.signature };
        if (layout.warnings.length) setNotice(layout.warnings.join(' '));
      }).catch(reason => { if (!cancelled) setError(`分页失败：${String(reason)}。请检查字号、边距或恢复模板默认。`); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasFileChanges) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasFileChanges]);

  async function open(file?: File) {
    if (!file) return;
    try {
      const next = await readProject(file);
      update(next); setLastFile(stringify(next)); setError(''); setNotice(`已打开 ${file.name}；旧项目可通过撤销恢复。`);
    } catch (reason) { setError(`无法打开项目：${reason instanceof Error ? reason.message : String(reason)}`); }
  }
  function save() {
    try {
      const contents = stringify(parseProject(project));
      download(new Blob([contents], { type: 'application/json' }), 'reading-project.json');
      setLastFile(contents); setNotice('已发起 JSON 下载，请在浏览器下载列表确认文件已落盘。');
    } catch (reason) { setError(`项目保存失败：${String(reason)}`); }
  }
  async function exportImages(page?: number) {
    setExporting(true); setError('');
    try {
      const image = await requestExport(project, rendered?.layout.signature ?? '', page);
      download(image, page ? `page-${String(page).padStart(2, '0')}.png` : 'reading-cards.zip');
      setNotice('导出完成，已发起下载。图片对应点击导出时的项目快照。');
    } catch (reason) { setError(`导出失败：${String(reason)}。请确认 Chromium 已安装，并等待分页完成后重试。`); }
    finally { setExporting(false); }
  }
  function setProjectText(key: 'title' | 'mainIdea', value: string) {
    update(current => ({ ...current, [key]: value }));
  }
  function setParagraphText(key: ParagraphCollection, id: string, text: string) {
    update(current => key === 'source' ? editParagraph(current, id, text) : { ...current, translation: { paragraphs: current.translation.paragraphs.map(item => item.id === id ? { ...item, text } : item) } });
  }
  function addParagraph(key: ParagraphCollection) {
    update(current => ({ ...current, [key]: { paragraphs: [...current[key].paragraphs, { id: newId(), text: '' }] } }));
  }
  function removeParagraph(key: ParagraphCollection, id: string) {
    update(current => ({ ...current, [key]: { paragraphs: current[key].paragraphs.filter(item => item.id !== id) }, highlights: key === 'source' ? current.highlights.filter(mark => mark.paragraphId !== id) : current.highlights }));
  }
  function highlightRange(paragraphId: string, start: number, end: number) {
    if (start === end) { setNotice('请先在英文段落中选择要标注的文字。'); return; }
    update(current => toggleHighlight(current, paragraphId, start, end));
  }
  function setPageBreak(id: string, checked: boolean) {
    update(current => ({ ...current, layoutOverrides: { ...current.layoutOverrides, manualPageBreaks: checked ? [...current.layoutOverrides.manualPageBreaks, id] : current.layoutOverrides.manualPageBreaks.filter(item => item !== id) } }));
  }
  function reorder(key: EntryCollection, index: number, direction: number) {
    update(current => { const list = [...current[key]]; const destination = index + direction; if (destination < 0 || destination >= list.length) return current; [list[index], list[destination]] = [list[destination], list[index]]; return { ...current, [key]: list }; });
  }
  function setEntryField(key: EntryCollection, id: string, property: string, value: string) {
    update(current => ({ ...current, [key]: current[key].map(item => item.id === id ? { ...item, [property]: value } : item) }));
  }
  function addEntry(key: EntryCollection) {
    update(current => ({ ...current, [key]: [...current[key], key === 'vocabulary' ? { id: newId(), word: '', pos: '', meaning: '', ipa: '' } : { id: newId(), phrase: '', meaning: '', example: '', exampleTranslation: '' }] }));
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
    const entry = { id: newId(), word: '', ipa: '', pos: '', meaning: '' };
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
  function resetStyles() { update(current => ({ ...current, styles: { ...defaults } })); }
  function clearWarnings() { update(current => ({ ...current, warnings: [] })); }
  function clearError() { setError(''); }
  function downloadRejectedDraft() {
    if (boot.rejected) download(new Blob([boot.rejected], { type: 'text/plain' }), 'rejected-draft.txt');
  }

  return {
    project, notice, error, cacheStatus, ready, exporting, hasFileChanges,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    layout: rendered?.layout, pages: rendered?.layout.pages.length ?? 0, rejectedDraft: boot.rejected,
    undo, redo, open, save, exportImages, setProjectText, setParagraphText, addParagraph, removeParagraph,
    highlightRange, setPageBreak, reorder, setEntryField, addEntry, removeEntry, setStyle, resetStyles,
    selectedVocabulary, selectedVocabularyIndex, selectVocabulary, moveSelectedVocabulary, deleteSelectedVocabulary, insertVocabularyBelow,
    clearWarnings, clearError, downloadRejectedDraft,
  };
}
