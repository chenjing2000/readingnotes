import { Fragment } from 'react';
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
    {project.vocabulary.map((entry, index) => <section className={`edit-entry vocabulary-entry${entry.id === selectedVocabulary?.id ? ' selected' : ''}`} key={entry.id}
      onClick={() => vm.selectVocabulary(entry.id)} onFocus={() => vm.selectVocabulary(entry.id)}>
      <div className="entry-toolbar"><b>词汇 {index + 1}</b></div>
      <table className="expression-table vocabulary-table" aria-label={`词汇 ${index + 1}`}><tbody>
        <tr><th scope="row">词汇</th><td>{editor(entry, index, 'word', '词头')}</td></tr>
        <tr><th scope="row">音标</th><td>{editor(entry, index, 'ipa', '音标')}</td></tr>
        {entry.senses.map((sense, senseIndex) => <Fragment key={senseIndex}>
          <tr><th scope="row">含义{senseIndex > 0 ? ` ${senseIndex + 1}` : ''}</th><td>
            <EntryHeadInput multiline label={`含义 ${index + 1}${senseIndex ? ` 义项 ${senseIndex + 1}` : ''}`} value={sense.pos ? `${sense.pos} ${sense.meaning}` : sense.meaning}
              inputRef={input => { for (const property of ['pos', 'meaning']) registerInput(`vocabulary:${senseSourceId(entry.id, senseIndex, property)}`, input); }}
              commit={value => vm.setVocabularyMeaning(entry.id, senseIndex, value)} />
          </td></tr>
          {(['example', 'exampleTranslation'] as const).map(property => <tr key={property}><th scope="row">{property === 'example' ? '例句' : '翻译'}{senseIndex > 0 ? ` ${senseIndex + 1}` : ''}</th><td>
            <AutoSizeTextarea label={`词汇${property === 'example' ? '例句' : '翻译'} ${index + 1} 义项 ${senseIndex + 1}`} value={sense[property]}
              inputRef={input => registerInput(`vocabulary:${senseSourceId(entry.id, senseIndex, property)}`, input)}
              onChange={value => vm.setSenseField('vocabulary', entry.id, senseIndex, property, value)} />
          </td></tr>)}
          <tr><th scope="row">义项操作</th><td><button aria-label={`删除词汇 ${index + 1} 义项 ${senseIndex + 1}`} disabled={entry.senses.length <= 1} onClick={() => vm.removeSense('vocabulary', entry.id, senseIndex)}>删除义项</button></td></tr>
        </Fragment>)}
      </tbody></table>
      <button onClick={() => vm.addSense('vocabulary', entry.id)} aria-label={`为词汇 ${index + 1} 添加义项`} disabled={entry.senses.length >= 2000}>添加义项</button>
      <label className="break-control vocabulary-options"><input type="checkbox" aria-label={`词汇 ${index + 1} 前换页`}
        checked={project.layoutOverrides.manualPageBreaks.includes(layoutKey('vocab', entry.id))}
        onChange={event => vm.setPageBreak(layoutKey('vocab', entry.id), event.target.checked)} />前换页</label>
    </section>)}
    {!project.vocabulary.length && <p className="hint">暂无词汇，点击下方加号添加。</p>}
    <div className="vocabulary-actions" role="group" aria-label="词汇行操作">
      <button aria-label="上移选中词汇" title="上移选中词汇" disabled={selectedVocabularyIndex <= 0} onClick={() => vm.moveSelectedVocabulary(-1)}>↑</button>
      <button aria-label="下移选中词汇" title="下移选中词汇" disabled={selectedVocabularyIndex < 0 || selectedVocabularyIndex === project.vocabulary.length - 1} onClick={() => vm.moveSelectedVocabulary(1)}>↓</button>
      <button aria-label="删除选中词汇" title="删除选中词汇" disabled={!selectedVocabulary} onClick={vm.deleteSelectedVocabulary}>×</button>
      <button aria-label="在选中词汇下方添加空白行" title="在选中词汇下方添加空白行" onClick={() => focusField(`vocabulary:${vm.insertVocabularyBelow()}:word`)}>+</button>
      <button aria-label="刷新词汇与表达高亮" title="重新扫描词汇与表达的 highlight 列表" onClick={vm.refreshHighlights}>↻</button>
    </div>
  </section>;
}
