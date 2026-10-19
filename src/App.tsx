import { useEffect, useRef, useState } from 'react';
import fixture from '../projects/brainco/project.json';
import { defaults, editParagraph, layoutKey, newId, parseProject, toggleHighlight, type Project, type Styles } from './model';
import { paginate } from './pagination';

const DRAFT = 'reading-editor.draft.v2';
const stringify = (project: Project) => JSON.stringify(project, null, 2);
function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function initial(): { project: Project; notice: string; cacheBlocked: boolean; rejected?: string } {
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
    return { project: parseProject(fixture), notice: preserved ? '损坏草稿已隔离备份，可下载原始草稿尝试恢复。当前显示样例。' : '草稿无法读取或备份，自动缓存已停用以保护旧数据；请保存 JSON。', cacheBlocked: !preserved, rejected: saved ?? undefined };
  }
  return { project: parseProject(fixture), notice: '已加载 BrainCo 完整样例。所有处理均在本机完成。', cacheBlocked: false };
}
type Tab = '原文' | '词汇' | '表达' | '主旨与译文' | '样式';

export default function App() {
  const [boot] = useState(initial);
  const [history, setHistory] = useState<{ past: Project[]; present: Project; future: Project[] }>({ past: [], present: boot.project, future: [] });
  const project = history.present;
  const [tab, setTab] = useState<Tab>('原文');
  const [notice, setNotice] = useState(boot.notice);
  const [error, setError] = useState('');
  const [cacheStatus, setCacheStatus] = useState('');
  const [lastFile, setLastFile] = useState('');
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(0.46);
  const [signature, setSignature] = useState('');
  const preview = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState('');
  function update(next: Project | ((current: Project) => Project)) {
    setHistory(current => ({ past: [...current.past.slice(-99), current.present], present: typeof next === 'function' ? next(current.present) : next, future: [] }));
  }
  function undo() { setHistory(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current); }
  function redo() { setHistory(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current); }
  useEffect(() => {
    if (boot.cacheBlocked) { setCacheStatus('自动缓存已停用，旧草稿未覆盖，请保存 JSON。'); return; }
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ project, modifiedAt: new Date().toISOString() }));
      setCacheStatus(`自动草稿 ${new Date().toLocaleTimeString()}`);
    } catch { setCacheStatus('自动草稿保存失败！请立即下载 JSON 备份。'); }
  }, [project]);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const timer = setTimeout(() => {
      paginate(project).then(layout => {
        if (cancelled) return;
        const wrappers = layout.pages.map(card => { const wrapper = document.createElement('div'); wrapper.className = 'card-wrapper'; wrapper.append(card); return wrapper; });
        preview.current!.replaceChildren(...wrappers);
        setPages(layout.pages.length); setSignature(layout.signature); setReady(true);
        window.editor = { project, signature: layout.signature };
        if (layout.warnings.length) setNotice(layout.warnings.join(' '));
      }).catch(reason => { if (!cancelled) setError(`分页失败：${String(reason)}。请检查字号、边距或恢复模板默认。`); });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (stringify(project) !== lastFile) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [project, lastFile]);
  useEffect(() => {
    if (!focusId) return;
    inputs.current.get(focusId)?.focus();
    inputs.current.get(focusId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFocusId('');
  }, [focusId, tab]);
  function jump(event: React.MouseEvent) {
    const target = event.target as HTMLElement;
    const line = target.closest<HTMLElement>('[data-source]');
    const id = target.closest<HTMLElement>('[data-edit]')?.dataset.edit ?? line?.dataset.source;
    if (!id) return;
    const kind = line!.dataset.kind;
    if (kind === 'title' || kind === 'article') { setTab('原文'); setFocusId(kind === 'title' ? 'project:title' : `source:${id}`); }
    else if (kind === 'vocab') { setTab('词汇'); setFocusId(`vocabulary:${target.closest<HTMLElement>('[data-edit]')?.dataset.edit ?? `${id}:word`}`); }
    else if (['phrase', 'meaning', 'example', 'exampleTranslation'].includes(kind!)) { setTab('表达'); setFocusId(`expressions:${id}`); }
    else if (kind === 'translation' || kind === 'mainIdea') { setTab('主旨与译文'); setFocusId(kind === 'mainIdea' ? 'project:mainIdea' : `translation:${id}`); }
  }
  async function open(file?: File) {
    if (!file) return;
    setReady(false);
    try {
      const next = parseProject(JSON.parse(await file.text()));
      update(next); setLastFile(stringify(next)); setError(''); setNotice(`已打开 ${file.name}；旧项目可通过撤销恢复。`);
    } catch (reason) { setReady(!!signature); setError(`无法打开项目：${reason instanceof Error ? reason.message : String(reason)}`); }
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
      const snapshot = { project, signature, page };
      const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
      if (!response.ok) throw new Error(await response.text());
      download(await response.blob(), page ? `page-${String(page).padStart(2, '0')}.png` : 'reading-cards.zip');
      setNotice('导出完成，已发起下载。图片对应点击导出时的项目快照。');
    } catch (reason) { setError(`导出失败：${String(reason)}。请确认 Chromium 已安装，并等待分页完成后重试。`); }
    finally { setExporting(false); }
  }
  function field(label: string, value: string, onChange: (value: string) => void, id?: string, rows = 2) {
    return <label className="field" key={label}><span>{label}</span><textarea aria-label={label} value={value} rows={rows} ref={element => { if (id && element) inputs.current.set(id, element); }} onChange={event => onChange(event.target.value)} /></label>;
  }
  function breakControl(id: string, label: string) {
    return <label className="break-control"><input type="checkbox" aria-label={`${label} 前换页`} checked={project.layoutOverrides.manualPageBreaks.includes(id)} onChange={event => update(current => ({ ...current, layoutOverrides: { ...current.layoutOverrides, manualPageBreaks: event.target.checked ? [...current.layoutOverrides.manualPageBreaks, id] : current.layoutOverrides.manualPageBreaks.filter(item => item !== id) } }))} />前换页</label>;
  }
  function reorder(key: 'vocabulary' | 'expressions', index: number, direction: number) {
    update(current => { const list = [...current[key]]; const destination = index + direction; if (destination < 0 || destination >= list.length) return current; [list[index], list[destination]] = [list[destination], list[index]]; return { ...current, [key]: list }; });
  }
  function items(key: 'vocabulary' | 'expressions') {
    const vocabulary = key === 'vocabulary';
    const name = vocabulary ? '词汇' : '表达';
    const labels = vocabulary ? { word: '词头', ipa: '英式音标', pos: '词性', meaning: '释义' } : { phrase: '短语', meaning: '中文含义', example: '例句', exampleTranslation: '例句译文' };
    return <>{project[key].map((entry, index) => <section className="edit-entry" key={entry.id}>
      <div className="entry-toolbar"><b>{name} {index + 1}</b><span className="spacer" /><button aria-label={`${name} ${index + 1} 上移`} disabled={index === 0} onClick={() => reorder(key, index, -1)}>↑</button><button aria-label={`${name} ${index + 1} 下移`} disabled={index === project[key].length - 1} onClick={() => reorder(key, index, 1)}>↓</button><button aria-label={`删除${name} ${index + 1}`} onClick={() => update(current => ({ ...current, [key]: current[key].filter(item => item.id !== entry.id) }))}>删除</button></div>
      {Object.entries(labels).map(([property, label]) => field(`${label} ${index + 1}`, (entry as unknown as Record<string, string>)[property] ?? '', value => update(current => ({ ...current, [key]: current[key].map(item => item.id === entry.id ? { ...item, [property]: value } : item) })), `${key}:${entry.id}:${property}`))}
      {breakControl(vocabulary ? layoutKey('vocab', entry.id) : layoutKey('phrase', `${entry.id}:phrase`), `${name} ${index + 1}`)}
    </section>)}<button className="add-button" onClick={() => update(current => ({ ...current, [key]: [...current[key], vocabulary ? { id: newId(), word: '', pos: '', meaning: '', ipa: '' } : { id: newId(), phrase: '', meaning: '', example: '', exampleTranslation: '' }] }))}>添加{name}</button></>;
  }
  const styleFields: [keyof Styles, string, number, number, number][] = [
    ['titleSize', '标题字号', 12, 80, 1], ['bodySize', '英文正文字号', 12, 80, 1], ['phraseSize', '表达短语字号', 12, 80, 1], ['translationSize', '中文译文字号', 12, 80, 1],
    ['lineHeight', '英文行距', 1.2, 2.4, 0.05], ['translationLineHeight', '中文行距', 1.2, 2.4, 0.02], ['paragraphGap', '段距', 0, 100, 1], ['marginX', '左右边距', 24, 200, 1], ['marginTop', '上边距', 24, 200, 1], ['marginBottom', '底部预留', 65, 400, 1],
  ];
  return <div className="app-shell">
    <header className="app-header"><div className="brand-mark">Aa<span>READING STUDIO</span></div><span className="local-badge">本地 · 离线 · 私有</span><span className="spacer" />
      <label className="button">打开 JSON<input type="file" accept=".json,application/json" aria-label="打开项目 JSON" onChange={event => { void open(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button onClick={save}>保存 JSON</button><button className="primary" disabled={!ready || exporting} onClick={() => void exportImages()}>{exporting ? '正在导出…' : '导出全部 PNG / ZIP'}</button>
    </header>
    <div className="status-bar"><span>{cacheStatus}</span><span>{lastFile === stringify(project) ? 'JSON 下载已发起 / 项目已打开' : 'JSON 尚有未另存改动'}</span><span className="spacer" /><span>{ready ? `${pages} 页 · 排版就绪` : '正在测量字体与分页…'}</span></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}
    <div className="workspace"><aside className="editor-panel"><div className="panel-heading"><h1>精读卡片编辑器</h1><p>从文章到卡片，让每个细节都可编辑。</p></div>
      <nav aria-label="编辑板块">{(['原文', '词汇', '表达', '主旨与译文', '样式'] as Tab[]).map(name => <button key={name} className={name === tab ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</nav>
      <div className="history-toolbar"><button onClick={undo} disabled={!history.past.length}>撤销</button><button onClick={redo} disabled={!history.future.length}>重做</button><span>支持最近 100 次修改</span></div>
      <div className="fields">
        {tab === '原文' && <>
          {field('英文标题', project.title, value => update(current => ({ ...current, title: value })), 'project:title')}
          <p className="hint">在下方英文框选择文字，再点“标注 / 取消”。高亮字号始终继承正文。</p>
          {project.source.paragraphs.map((paragraph, index) => <section className="edit-entry" key={paragraph.id}>
            {field(`英文段落 ${index + 1}`, paragraph.text, value => update(current => editParagraph(current, paragraph.id, value)), `source:${paragraph.id}`, 9)}
            <div className="entry-toolbar"><button aria-label={`标注 / 取消所选重点 ${index + 1}`} onMouseDown={event => event.preventDefault()} onClick={() => { const input = inputs.current.get(`source:${paragraph.id}`)!; if (input.selectionStart === input.selectionEnd) { setNotice('请先在英文段落中选择要标注的文字。'); return; } update(current => toggleHighlight(current, paragraph.id, input.selectionStart, input.selectionEnd)); }}>标注 / 取消所选重点</button>{breakControl(layoutKey('article', paragraph.id), `英文段落 ${index + 1}`)}</div>
            <button onClick={() => update(current => ({ ...current, source: { paragraphs: current.source.paragraphs.filter(item => item.id !== paragraph.id) }, highlights: current.highlights.filter(mark => mark.paragraphId !== paragraph.id) }))}>删除英文段落 {index + 1}</button>
          </section>)}
          <button className="add-button" onClick={() => update(current => ({ ...current, source: { paragraphs: [...current.source.paragraphs, { id: newId(), text: '' }] } }))}>添加英文段落</button>
        </>}
        {tab === '词汇' && items('vocabulary')}
        {tab === '表达' && items('expressions')}
        {tab === '主旨与译文' && <>
          {field('Main Idea', project.mainIdea, value => update(current => ({ ...current, mainIdea: value })), 'project:mainIdea', 4)}
          {breakControl(layoutKey('mainIdea', 'mainIdea'), 'Main Idea')}
          {project.translation.paragraphs.map((paragraph, index) => <section className="edit-entry" key={paragraph.id}>
            {field(`中文段落 ${index + 1}`, paragraph.text, value => update(current => ({ ...current, translation: { paragraphs: current.translation.paragraphs.map(item => item.id === paragraph.id ? { ...item, text: value } : item) } })), `translation:${paragraph.id}`, 7)}
            {!paragraph.text && <p className="hint">空段落将保留，不影响其他段落。</p>}
            <div className="entry-toolbar">{breakControl(layoutKey('translation', paragraph.id), `中文段落 ${index + 1}`)}<span className="spacer" /><button onClick={() => update(current => ({ ...current, translation: { paragraphs: current.translation.paragraphs.filter(item => item.id !== paragraph.id) } }))}>删除中文段落 {index + 1}</button></div>
          </section>)}
          <button className="add-button" onClick={() => update(current => ({ ...current, translation: { paragraphs: [...current.translation.paragraphs, { id: newId(), text: '' }] } }))}>添加中文段落</button>
        </>}
        {tab === '样式' && <><p className="hint">画布固定 1200 × 1600。数值在离开输入框时校验；默认使用本地打包字体。</p><div className="style-grid">
          {styleFields.map(([key, label, min, max, step]) => <label className="field" key={key}><span>{label}</span><input type="number" aria-label={label} min={min} max={max} step={step} value={project.styles[key]} onChange={event => { const value = Number(event.target.value); if (value >= min && value <= max) update(current => ({ ...current, styles: { ...current.styles, [key]: value } })); }} /></label>)}
          {([['accent', '强调色'], ['divider', '分割线颜色']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type="color" aria-label={label} value={project.styles[key]} onChange={event => update(current => ({ ...current, styles: { ...current.styles, [key]: event.target.value } }))} /></label>)}
        </div><button className="add-button" onClick={() => update(current => ({ ...current, styles: { ...defaults } }))}>恢复模板默认</button></>}
        {!!project.warnings.length && <div className="warning-list">{project.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<button onClick={() => update(current => ({ ...current, warnings: [] }))}>已阅读提示</button></div>}
      </div><div className="notice" role="status">{notice}{boot.rejected && <button onClick={() => download(new Blob([boot.rejected!], { type: 'text/plain' }), 'rejected-draft.txt')}>下载原始草稿</button>}</div>
    </aside><section className="preview-panel" aria-label="分页预览"><div className="preview-toolbar"><b>实时预览</b><span>1200 × 1600 px</span><span className="spacer" /><label>缩放 <select aria-label="预览缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[0.3, 0.4, 0.46, 0.5, 0.65, 0.8, 1].map(value => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}</select></label></div>
      <div className="preview-scroll"><div className="preview" style={{ '--zoom': zoom } as React.CSSProperties} data-ready={ready} ref={preview} onClick={jump} />
        {ready && <div className="page-downloads">{Array.from({ length: pages }, (_, index) => <button key={index} disabled={exporting} onClick={() => void exportImages(index + 1)}>第 {index + 1} 页 PNG</button>)}</div>}
      </div>
    </section></div>
  </div>;
}
