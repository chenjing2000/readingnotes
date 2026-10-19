import { layoutKey, type Project } from '../models/project';
import type { useEditorViewModel } from '../viewmodels/useEditorViewModel';

type Props = {
  viewModel: ReturnType<typeof useEditorViewModel>;
  registerInput: (id: string, input: HTMLInputElement | HTMLTextAreaElement | null) => void;
  focusField: (id: string) => void;
};

export default function VocabularyTable({ viewModel: vm, registerInput, focusField }: Props) {
  const { project, selectedVocabulary, selectedVocabularyIndex } = vm;
  function editor(entry: Project['vocabulary'][number], index: number, property: 'word' | 'ipa' | 'pos' | 'meaning', label: string) {
    return <input type="text" aria-label={`${label} ${index + 1}`} value={entry[property] ?? ''}
      ref={input => registerInput(`vocabulary:${entry.id}:${property}`, input)}
      onChange={event => vm.setEntryField('vocabulary', entry.id, property, event.target.value)} />;
  }
  return <section className="vocabulary-editor">
    <div className="vocabulary-table-scroll"><table className="vocabulary-table" aria-label="词汇表">
      <colgroup><col /><col /><col /><col /></colgroup>
      <thead><tr><th scope="col">词头</th><th scope="col">音标</th><th scope="col">词性</th><th scope="col">含义</th></tr></thead>
      <tbody>{project.vocabulary.map((entry, index) => <tr key={entry.id} tabIndex={0} aria-selected={entry.id === selectedVocabulary?.id}
        onClick={() => vm.selectVocabulary(entry.id)} onFocus={() => vm.selectVocabulary(entry.id)}>
        <td>{editor(entry, index, 'word', '词头')}</td>
        <td>{editor(entry, index, 'ipa', '音标')}</td>
        <td>{editor(entry, index, 'pos', '词性')}</td>
        <td>{editor(entry, index, 'meaning', '含义')}</td>
      </tr>)}</tbody>
    </table>{!project.vocabulary.length && <p className="hint">暂无词汇，点击下方加号添加。</p>}</div>
    <div className="vocabulary-actions" role="group" aria-label="词汇行操作">
      <button aria-label="上移选中词汇" title="上移选中词汇" disabled={selectedVocabularyIndex <= 0} onClick={() => vm.moveSelectedVocabulary(-1)}>↑</button>
      <button aria-label="下移选中词汇" title="下移选中词汇" disabled={selectedVocabularyIndex < 0 || selectedVocabularyIndex === project.vocabulary.length - 1} onClick={() => vm.moveSelectedVocabulary(1)}>↓</button>
      <button aria-label="删除选中词汇" title="删除选中词汇" disabled={!selectedVocabulary} onClick={vm.deleteSelectedVocabulary}>×</button>
      <button aria-label="在选中词汇下方添加空白行" title="在选中词汇下方添加空白行" onClick={() => focusField(`vocabulary:${vm.insertVocabularyBelow()}:word`)}>+</button>
    </div>
    {selectedVocabulary && <label className="break-control vocabulary-options"><input type="checkbox" aria-label="选中词汇前换页"
      checked={project.layoutOverrides.manualPageBreaks.includes(layoutKey('vocab', selectedVocabulary.id))}
      onChange={event => vm.setPageBreak(layoutKey('vocab', selectedVocabulary.id), event.target.checked)} />选中词汇前换页</label>}
  </section>;
}
