import { useEffect, useRef, useState } from 'react';
import { collectHighlights, commitEntryHead, defaults, editParagraph, emptySense, layoutKey, newId, parseProject, senseSourceId, toggleHighlight, type Project, type Sense, type Styles } from '../models/project';
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
  const [highlightRefresh, setHighlightRefresh] = useState(0);
  const lastHighlightRefresh = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const ready = !opening && rendered?.project === project;
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
        window.editor = { project, signature: layout.signature, diagnostics: layout.diagnostics };
        if (highlightRefresh !== lastHighlightRefresh.current) {
          lastHighlightRefresh.current = highlightRefresh;
          setNotice(`已刷新高亮：命中 ${collectHighlights(project).length} 处。${layout.warnings.length ? ` ${layout.warnings.join(' ')}` : ''}`);
        } else if (layout.warnings.length) setNotice(layout.warnings.join(' '));
      }).catch(reason => { if (!cancelled) setError(`分页失败：${String(reason)}。请检查字号、边距或恢复模板默认。`); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project, highlightRefresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasFileChanges) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasFileChanges]);

  async function open(file?: File) {
    if (!file) return;
    setOpening(true);
    try {
      const next = await readProject(file);
      update(next); setLastFile(stringify(next)); setError(''); setNotice(`已打开 ${file.name}；旧项目可通过撤销恢复。`);
    } catch (reason) { setError(`无法打开项目：${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { setOpening(false); }
  }
  function save() {
    try {
      const contents = stringify(parseProject(project));
      download(new Blob([contents], { type: 'application/json' }), 'reading-project.json');
      setLastFile(contents); setNotice('已发起 JSON 下载，请在浏览器下载列表确认文件已落盘。');
    } catch (reason) { setError(`项目保存失败：${String(reason)}`); }
  }
  async function exportImages(page?: number) {
    if (!ready || exporting) return;
    setExporting(true); setError('');
    try {
      const image = await requestExport(project, rendered.layout.signature, page, rendered.layout.diagnostics);
      download(image, page ? `page-${String(page).padStart(2, '0')}.png` : 'reading-cards.zip');
      setNotice('导出完成，已发起下载。图片对应点击导出时的项目快照。');
    } catch (reason) { setError(`导出失败：${reason instanceof Error ? reason.message : String(reason)}`); }
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
  function removeParagraph(key: ParagraphCollection, id: string) {
    update(current => ({ ...current, [key]: { paragraphs: current[key].paragraphs.filter(item => item.id !== id) } }));
  }
  function highlightRange(paragraphId: string, start: number, end: number) {
    if (start === end) { setNotice('请先在英文段落中选择要标注的文字。'); return; }
    const next = toggleHighlight(project, paragraphId, start, end);
    if (next === project) { setNotice('请选择完整的单词或词组。'); return; }
    update(next);
  }
  function refreshHighlights() {
    setRendered(null);
    setHighlightRefresh(current => current + 1);
    setError('');
    setNotice('正在刷新高亮…');
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
  function commitHead(key: EntryCollection, id: string, value: string) {
    try {
      const next = commitEntryHead(project, key, id, value);
      if (next !== project) update(next);
    } catch (reason) { setError(`词条保存失败：${String(reason)}`); }
  }
  function setSenseField(key: EntryCollection, id: string, index: number, field: keyof Sense, value: string) {
    update(current => ({ ...current, [key]: current[key].map(entry => entry.id === id ? { ...entry, senses: entry.senses.map((sense, i) => i === index ? { ...sense, [field]: value } : sense) } : entry) }));
  }
  function addSense(key: EntryCollection, id: string) {
    update(current => ({ ...current, [key]: current[key].map(entry => entry.id === id ? { ...entry, senses: [...entry.senses, emptySense()] } : entry) }));
  }
  function removeSense(key: EntryCollection, id: string, index: number) {
    update(current => {
      const entry = current[key].find(entry => entry.id === id);
      if (!entry || entry.senses.length <= 1) return current;
      const replacements = new Map<string, string | null>();
      for (let i = index; i < entry.senses.length; i++) for (const field of ['meaning', 'example', 'exampleTranslation']) {
        replacements.set(layoutKey(field, senseSourceId(id, i, field)), i === index ? null : layoutKey(field, senseSourceId(id, i - 1, field)));
      }
      return { ...current, [key]: current[key].map(item => item.id === id ? { ...item, senses: item.senses.filter((_, i) => i !== index) } : item),
        layoutOverrides: { ...current.layoutOverrides, manualPageBreaks: current.layoutOverrides.manualPageBreaks.flatMap(mark => replacements.has(mark) ? replacements.get(mark) ? [replacements.get(mark)!] : [] : [mark]) } };
    });
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
    highlightRange, refreshHighlights, commitHead, setSenseField, addSense, removeSense, setPageBreak, reorder, setEntryField, addEntry, removeEntry, setStyle, resetStyles,
    selectedVocabulary, selectedVocabularyIndex, selectVocabulary, moveSelectedVocabulary, deleteSelectedVocabulary, insertVocabularyBelow,
    clearWarnings, clearError, downloadRejectedDraft,
  };
}
