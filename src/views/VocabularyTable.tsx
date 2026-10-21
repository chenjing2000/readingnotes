import { layoutKey, senseSourceId, type Project } from '../models/project';
import type { useEditorViewModel } from '../viewmodels/useEditorViewModel';
import EntryHeadInput from './EntryHeadInput';
import AutoSizeTextarea from './AutoSizeTextarea';

type Props = {
  viewModel: ReturnType<typeof useEditorViewModel>;
  registerInput: (id: string, input: HTMLInputElement | HTMLTextAreaElement | null) => void;
  focusField: (id: string) => void;
};

export default function VocabularyTable({ viewModel: vm, registerInput, focusField }: Props) {
  const { project, selectedVocabulary, selectedVocabularyIndex } = vm;
  function editor(entry: Project['vocabulary'][number], index: number, property: 'word' | 'ipa', label: string) {
    if (property === 'word') return <EntryHeadInput label={`${label} ${index + 1}`} value={entry.word} commit={value => vm.commitHead('vocabulary', entry.id, value)} inputRef={input => registerInput(`vocabulary:${entry.id}:word`, input)} />;
    return <input type="text" aria-label={`${label} ${index + 1}`} value={entry[property] ?? ''}
      ref={input => registerInput(`vocabulary:${entry.id}:${property}`, input)}
      onChange={event => vm.setEntryField('vocabulary', entry.id, property, event.target.value)} />;
  }
  return <section className="vocabulary-editor">
    <div className="vocabulary-table-scroll"><table className="vocabulary-table" aria-label="词汇表">
      <colgroup><col /><col /><col /></colgroup>
      <thead><tr><th scope="col">词头</th><th scope="col">音标</th><th scope="col">含义</th></tr></thead>
      <tbody>{project.vocabulary.map((entry, index) => <tr key={entry.id} tabIndex={0} aria-selected={entry.id === selectedVocabulary?.id}
        onClick={() => vm.selectVocabulary(entry.id)} onFocus={() => vm.selectVocabulary(entry.id)}>
        <td>{editor(entry, index, 'word', '词头')}</td>
        <td>{editor(entry, index, 'ipa', '音标')}</td>
        <td>{entry.senses.map((sense, senseIndex) => <div className="sense-meaning" key={senseIndex}>
          <EntryHeadInput label={`含义 ${index + 1}${senseIndex ? ` 义项 ${senseIndex + 1}` : ''}`} value={sense.pos ? `${sense.pos} ${sense.meaning}` : sense.meaning}
            inputRef={input => { for (const property of ['pos', 'meaning']) registerInput(`vocabulary:${senseSourceId(entry.id, senseIndex, property)}`, input); }}
            commit={value => vm.setVocabularyMeaning(entry.id, senseIndex, value)} />
        </div>)}</td>
      </tr>)}</tbody>
    </table>{!project.vocabulary.length && <p className="hint">暂无词汇，点击下方加号添加。</p>}</div>
    <div className="vocabulary-actions" role="group" aria-label="词汇行操作">
      <button aria-label="上移选中词汇" title="上移选中词汇" disabled={selectedVocabularyIndex <= 0} onClick={() => vm.moveSelectedVocabulary(-1)}>↑</button>
      <button aria-label="下移选中词汇" title="下移选中词汇" disabled={selectedVocabularyIndex < 0 || selectedVocabularyIndex === project.vocabulary.length - 1} onClick={() => vm.moveSelectedVocabulary(1)}>↓</button>
      <button aria-label="删除选中词汇" title="删除选中词汇" disabled={!selectedVocabulary} onClick={vm.deleteSelectedVocabulary}>×</button>
      <button aria-label="在选中词汇下方添加空白行" title="在选中词汇下方添加空白行" onClick={() => focusField(`vocabulary:${vm.insertVocabularyBelow()}:word`)}>+</button>
      <button aria-label="刷新词汇与表达高亮" title="重新扫描词汇与表达的 highlight 列表" onClick={vm.refreshHighlights}>↻</button>
    </div>
    {selectedVocabulary && <details className="vocabulary-senses" key={selectedVocabulary.id}><summary>选中词汇的义项与例句</summary>
      {selectedVocabulary.senses.map((sense, index) => <section key={index}>
        <div className="entry-toolbar"><b>义项 {index + 1}</b><button aria-label={`删除词汇义项 ${index + 1}`} disabled={selectedVocabulary.senses.length <= 1} onClick={() => vm.removeSense('vocabulary', selectedVocabulary.id, index)}>删除义项</button></div>
        {(['example', 'exampleTranslation'] as const).map(field => <label className="field" key={field}><span>{field === 'example' ? '例句' : '翻译'}</span><AutoSizeTextarea
          label={`词汇${field === 'example' ? '例句' : '翻译'} ${index + 1}`} value={sense[field]}
          inputRef={input => registerInput(`vocabulary:${senseSourceId(selectedVocabulary.id, index, field)}`, input)}
          onChange={value => vm.setSenseField('vocabulary', selectedVocabulary.id, index, field, value)} /></label>)}
      </section>)}
      <button onClick={() => vm.addSense('vocabulary', selectedVocabulary.id)} aria-label="为选中词汇添加义项" disabled={selectedVocabulary.senses.length >= 2000}>添加义项</button>
    </details>}
    {selectedVocabulary && <label className="break-control vocabulary-options"><input type="checkbox" aria-label="选中词汇前换页"
      checked={project.layoutOverrides.manualPageBreaks.includes(layoutKey('vocab', selectedVocabulary.id))}
      onChange={event => vm.setPageBreak(layoutKey('vocab', selectedVocabulary.id), event.target.checked)} />选中词汇前换页</label>}
  </section>;
}
