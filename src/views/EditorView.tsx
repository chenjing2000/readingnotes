import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { layoutKey, type Styles } from '../models/project';
import { useEditorViewModel } from '../viewmodels/useEditorViewModel';
import VocabularyTable from './VocabularyTable';

type Tab = '原文' | '词汇' | '表达' | '主旨与译文' | '样式';

export default function EditorView() {
  const vm = useEditorViewModel();
  const { project, notice, error, cacheStatus, ready, exporting, pages, layout, hasFileChanges, canUndo, canRedo, rejectedDraft } = vm;
  const [tab, setTab] = useState<Tab>('原文');
  const [zoom, setZoom] = useState(0.46);
  const preview = useRef<HTMLDivElement>(null);
  const inputs = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState('');
  useLayoutEffect(() => {
    if (!layout) return;
    const wrappers = layout.pages.map(card => { const wrapper = document.createElement('div'); wrapper.className = 'card-wrapper'; wrapper.append(card); return wrapper; });
    preview.current!.replaceChildren(...wrappers);
  }, [layout]);
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
  function field(label: string, value: string, onChange: (value: string) => void, id?: string, rows = 2) {
    return <label className="field" key={label}><span>{label}</span><textarea aria-label={label} value={value} rows={rows} ref={element => { if (id && element) inputs.current.set(id, element); }} onChange={event => onChange(event.target.value)} /></label>;
  }
  function breakControl(id: string, label: string) {
    return <label className="break-control"><input type="checkbox" aria-label={`${label} 前换页`} checked={project.layoutOverrides.manualPageBreaks.includes(id)} onChange={event => vm.setPageBreak(id, event.target.checked)} />前换页</label>;
  }
  function expressions() {
    const key = 'expressions';
    const name = '表达';
    const labels = { phrase: '短语', meaning: '中文含义', example: '例句', exampleTranslation: '例句译文' };
    return <>{project[key].map((entry, index) => <section className="edit-entry" key={entry.id}>
      <div className="entry-toolbar"><b>{name} {index + 1}</b><span className="spacer" /><button aria-label={`${name} ${index + 1} 上移`} disabled={index === 0} onClick={() => vm.reorder(key, index, -1)}>↑</button><button aria-label={`${name} ${index + 1} 下移`} disabled={index === project[key].length - 1} onClick={() => vm.reorder(key, index, 1)}>↓</button><button aria-label={`删除${name} ${index + 1}`} onClick={() => vm.removeEntry(key, entry.id)}>删除</button></div>
      {Object.entries(labels).map(([property, label]) => field(`${label} ${index + 1}`, (entry as unknown as Record<string, string>)[property] ?? '', value => vm.setEntryField(key, entry.id, property, value), `${key}:${entry.id}:${property}`))}
      {breakControl(layoutKey('phrase', `${entry.id}:phrase`), `${name} ${index + 1}`)}
    </section>)}<button className="add-button" onClick={() => vm.addEntry(key)}>添加{name}</button></>;
  }
  const styleFields: [keyof Styles, string, number, number, number][] = [
    ['titleSize', '标题字号', 12, 80, 1], ['bodySize', '英文正文字号', 12, 80, 1], ['phraseSize', '表达短语字号', 12, 80, 1], ['translationSize', '中文译文字号', 12, 80, 1],
    ['lineHeight', '英文行距', 1.2, 2.4, 0.05], ['translationLineHeight', '中文行距', 1.2, 2.4, 0.02], ['paragraphGap', '段距', 0, 100, 1], ['marginX', '左右边距', 24, 200, 1], ['marginTop', '上边距', 24, 200, 1], ['marginBottom', '底部预留', 65, 400, 1],
  ];
  return <div className="app-shell">
    <header className="app-header"><div className="brand-mark">Aa<span>READING STUDIO</span></div><span className="local-badge">本地 · 离线 · 私有</span><span className="spacer" />
      <label className="button">打开 JSON<input type="file" accept=".json,application/json" aria-label="打开项目 JSON" onChange={event => { void vm.open(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button onClick={vm.save}>保存 JSON</button><button className="primary" disabled={!ready || exporting} onClick={() => void vm.exportImages()}>{exporting ? '正在导出…' : '导出全部 PNG / ZIP'}</button>
    </header>
    <div className="status-bar"><span>{cacheStatus}</span><span>{!hasFileChanges ? 'JSON 下载已发起 / 项目已打开' : 'JSON 尚有未另存改动'}</span><span className="spacer" /><span>{ready ? `${pages} 页 · 排版就绪` : '正在测量字体与分页…'}</span></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={vm.clearError}>关闭</button></div>}
    <div className="workspace"><aside className="editor-panel"><div className="panel-heading"><h1>精读卡片编辑器</h1><p>从文章到卡片，让每个细节都可编辑。</p></div>
      <nav aria-label="编辑板块">{(['原文', '词汇', '表达', '主旨与译文', '样式'] as Tab[]).map(name => <button key={name} className={name === tab ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</nav>
      <div className="history-toolbar"><button onClick={vm.undo} disabled={!canUndo}>撤销</button><button onClick={vm.redo} disabled={!canRedo}>重做</button><span>支持最近 100 次修改</span></div>
      <div className={`fields${tab === '词汇' ? ' vocabulary-fields' : ''}`}>
        {tab === '原文' && <>
          {field('英文标题', project.title, value => vm.setProjectText('title', value), 'project:title')}
          <p className="hint">在下方英文框选择文字，再点“标注 / 取消”。高亮字号始终继承正文。</p>
          {project.source.paragraphs.map((paragraph, index) => <section className="edit-entry" key={paragraph.id}>
            {field(`英文段落 ${index + 1}`, paragraph.text, value => vm.setParagraphText('source', paragraph.id, value), `source:${paragraph.id}`, 9)}
            <div className="entry-toolbar"><button aria-label={`标注 / 取消所选重点 ${index + 1}`} onMouseDown={event => event.preventDefault()} onClick={() => { const input = inputs.current.get(`source:${paragraph.id}`) as HTMLTextAreaElement; vm.highlightRange(paragraph.id, input.selectionStart, input.selectionEnd); }}>标注 / 取消所选重点</button>{breakControl(layoutKey('article', paragraph.id), `英文段落 ${index + 1}`)}</div>
            <button onClick={() => vm.removeParagraph('source', paragraph.id)}>删除英文段落 {index + 1}</button>
          </section>)}
          <button className="add-button" onClick={() => vm.addParagraph('source')}>添加英文段落</button>
        </>}
        {tab === '词汇' && <VocabularyTable viewModel={vm} registerInput={(id, input) => { if (input) inputs.current.set(id, input); else inputs.current.delete(id); }} focusField={setFocusId} />}
        {tab === '表达' && expressions()}
        {tab === '主旨与译文' && <>
          {field('Main Idea', project.mainIdea, value => vm.setProjectText('mainIdea', value), 'project:mainIdea', 4)}
          {breakControl(layoutKey('mainIdea', 'mainIdea'), 'Main Idea')}
          {project.translation.paragraphs.map((paragraph, index) => <section className="edit-entry" key={paragraph.id}>
            {field(`中文段落 ${index + 1}`, paragraph.text, value => vm.setParagraphText('translation', paragraph.id, value), `translation:${paragraph.id}`, 7)}
            {!paragraph.text && <p className="hint">空段落将保留，不影响其他段落。</p>}
            <div className="entry-toolbar">{breakControl(layoutKey('translation', paragraph.id), `中文段落 ${index + 1}`)}<span className="spacer" /><button onClick={() => vm.removeParagraph('translation', paragraph.id)}>删除中文段落 {index + 1}</button></div>
          </section>)}
          <button className="add-button" onClick={() => vm.addParagraph('translation')}>添加中文段落</button>
        </>}
        {tab === '样式' && <><p className="hint">画布固定 1200 × 1600。数值在允许范围内时立即应用；默认使用本地打包字体。</p><div className="style-grid">
          {styleFields.map(([key, label, min, max, step]) => <label className="field" key={key}><span>{label}</span><input type="number" aria-label={label} min={min} max={max} step={step} value={project.styles[key]} onChange={event => { const value = Number(event.target.value); if (value >= min && value <= max) vm.setStyle(key, value); }} /></label>)}
          {([['accent', '强调色'], ['divider', '分割线颜色']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type="color" aria-label={label} value={project.styles[key]} onChange={event => vm.setStyle(key, event.target.value)} /></label>)}
        </div><button className="add-button" onClick={vm.resetStyles}>恢复模板默认</button></>}
        {!!project.warnings.length && <div className="warning-list">{project.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<button onClick={vm.clearWarnings}>已阅读提示</button></div>}
      </div><div className="notice" role="status">{notice}{rejectedDraft && <button onClick={vm.downloadRejectedDraft}>下载原始草稿</button>}</div>
    </aside><section className="preview-panel" aria-label="分页预览"><div className="preview-toolbar"><b>实时预览</b><span>1200 × 1600 px</span><span className="spacer" /><label>缩放 <select aria-label="预览缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[0.3, 0.4, 0.46, 0.5, 0.65, 0.8, 1].map(value => <option value={value} key={value}>{Math.round(value * 100)}%</option>)}</select></label></div>
      <div className="preview-scroll"><div className="preview" style={{ '--zoom': zoom } as React.CSSProperties} data-ready={ready} ref={preview} onClick={jump} />
        {ready && <div className="page-downloads">{Array.from({ length: pages }, (_, index) => <button key={index} disabled={exporting} onClick={() => void vm.exportImages(index + 1)}>第 {index + 1} 页 PNG</button>)}</div>}
      </div>
    </section></div>
  </div>;
}
