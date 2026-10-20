# 英语精读卡片编辑器

Windows 本地运行的 React / TypeScript 编辑器：完整内容编辑、结构化 JSON、逐行自动分页、实时预览和 Chromium PNG / ZIP 导出。无账号、数据库或大模型 API；首次安装后可断开外网使用。

## 目录结构

| 目录 | 用途 |
|---|---|
| `src/` | 按 MVVM 分层的编辑器、公共服务及本机服务 |
| `tests/` | 单元测试与浏览器回归测试 |
| `tools/` | Vite / Playwright 配置和演示生成脚本 |
| `docs/` | 交接说明、实施计划、验收规范、审查报告与 skill |
| `assets/` | `projects/` 原始样例和 `reference/` 参考资料 |
| `artifacts/` | `dist/` 生产构建、`demo/` 演示文件、`verification/` 验证报告；测试临时目录也集中于此 |

根目录仅保留 README、npm 清单与锁文件、TypeScript 配置、HTML 入口和 Git 忽略规则。`node_modules/` 由 npm 管理。下文代码路径均相对于项目根目录；常用 npm 命令不变。

源码按以下职责组织，React 自定义 Hook 承担 ViewModel，不引入额外 MVVM 框架：

```text
src/
  models/project.ts                 数据结构、校验、迁移和高亮规则
  viewmodels/useEditorViewModel.ts   编辑状态、撤销重做和操作命令
  views/EditorView.tsx               界面与命令绑定、焦点、预览挂载
  views/VocabularyTable.tsx          四列词汇表及选中行操作
  views/SplitPane.tsx                可拖动和键盘调节的左右分隔线
  views/AutoSizeTextarea.tsx         表达输入按内容、字体与栏宽适应高度
  views/editor.css                  界面和卡片样式
  services/pagination.ts            字体测量、分页及渲染片段
  services/projectIO.ts             草稿、JSON 文件和导出请求
  server/index.ts                   本机 HTTP 服务与 Chromium 截图
  main.tsx                          应用及导出渲染入口
```

View 通过 ViewModel 执行编辑命令，ViewModel 调用 Model 与 Services；浏览器存储、文件读取和网络请求集中在 Services。分页仍使用原 DOM 实测引擎，View 只负责把返回的页面片段挂到预览容器。

## Windows 首次安装与运行

先安装 Node.js 24，或至少 Node.js 22.12。本次实际验证环境为 Windows、Node 24.19.0、npm 11.17.0。

在 PowerShell 中执行（使用 `.cmd` 避免本机 PowerShell 脚本执行策略影响）：

```powershell
Set-Location 'C:\Projects\EnglishNotes'
node --version
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd start
```

保持终端运行，在 Chrome / Edge / Chromium 打开 [本地编辑器](http://127.0.0.1:4317)。停止服务按 Ctrl+C。下次只需在相同目录执行 `npm.cmd start`；修改代码后重新构建。开发模式是 `npm.cmd run dev`，内容编辑仍实时更新，代码改动请刷新浏览器。

服务仅监听 `127.0.0.1`。字体 Nunito Sans 与 Noto Sans SC 由 npm 包本地打包；应用运行时无需 Google Fonts、远程 API 或云存储。不要直接双击 `index.html`，导出需要本地 Node 服务。

## 编辑、保存、重新打开

1. 首次打开自动载入 BrainCo；也可点“打开 JSON”选择 `assets/projects/brainco/project.json` 或自己保存的项目。旧版 schema 1 自动迁移为 schema 2；原始附件不被改写。
2. 在“原文 / 词汇 / 表达 / 主旨与译文”编辑所有内容。词汇页使用“词头 / 音标 / 词性 / 含义”四列表格，一词一行；各单元格采用不可拉伸的单行输入框，长内容可在框内横向查看。点击或编辑单元格选中该行，下方 `↑ / ↓ / × / +` 分别上移、下移、删除及在选中行下方插入空白行；插入后自动选中新行并聚焦词头，空表也可用 `+` 建立第一行。表达页每条内容使用四行两列表格，题头依次为“短语 / 含义 / 例句 / 翻译”，输入框按实际文字与栏宽自动调整高度，支持添加、删除及上下排序。两种表格的题头和内容均垂直居中。英文与中文段落可添加、删除；空译文段落会保留并提示。
3. 在英文编辑框选中一处文字，点“标注 / 取消所选重点”。取消只影响选区；原文改动会迁移未受影响的范围，涉及高亮原文的替换会取消该处高亮并提示重新确认。
4. 点击预览文字，可定位到对应编辑字段。预览本身不是直接输入区域。
5. “样式”调整标题、英文正文、表达短语、中文字号、英/中行距、段距、边距和颜色。“恢复模板默认”可撤销。重点字号继承正文。
6. “前换页”在逻辑内容块之前加入手动分页。词汇表下方可设置“选中词汇前换页”。卡片预览与导出中的词汇仍按每行左→右的双栏顺序读取；一对词汇中的手动分页作用于该行。
7. “撤销 / 重做”保留当前会话最近 100 次编辑；撤销历史不写入项目文件。导入新项目后也能撤销回到旧项目。
8. **JSON 文件是可移植的权威备份。** 点“保存 JSON”下载文件，并在浏览器下载列表确认已保存；普通浏览器无法保证操作系统最终写盘成功，界面会明确显示“下载已发起”。用“打开 JSON”重新加载即可继续编辑。

浏览器按站点自动保存草稿；刷新或关闭浏览器后，同一浏览器配置、同一地址/端口可恢复。隐私窗口、清理站点数据、浏览器配额不足会影响草稿，不能替代 JSON。损坏草稿会先隔离备份，可点“下载原始草稿”；若无法备份则停用自动缓存，保留原草稿。地址从 `127.0.0.1` 改为 `localhost` 或换端口，会使用不同的草稿空间。

## 预览与导出

- 页面自动流动，没有固定页数上限或“删减以适配”。英文/中文段落、表达短语、含义、例句及例句译文都可按真实行边界续页；续段不重复缩进。
- 左右栏分隔线可拖动调整宽度；聚焦分隔线后可用左右方向键微调，Home / End 调到边界。调整的是当前工作区比例，卡片画布保持 1200×1600。
- Useful Expressions 的含义、例句和例句翻译分别显示 `含义：`、`例句：`、`翻译：`，标签颜色为 `#006d87`。标签计入实际分页测量，只在该字段首行出现，续行/续页保留完整正文；JSON 仍存原始字段内容。
- “原文”页的“个性化页眉”默认 `some birds on tree`，每页与 `ENGLISH READING` 同行靠右显示，字体、字号和字重相同，颜色为 `#b2bfc3`。修改内容随 JSON 和草稿保存，旧项目缺少该字段时使用默认值；清空则右侧留空，过长时显示省略号，避免与左侧重叠。
- 长无空格 token 可在 grapheme 边界折行。过小行距若容纳不了字体包围框，会增加实际行高并提示，避免裁切。
- 浏览器对连续中文标点的行末压缩可能在独立行输出时改变宽度；分页器会复测实际输出行，必要时缩小测量宽度并提示，保持完整可见。
- 等状态变成“排版就绪”，点“导出全部 PNG / ZIP”。ZIP 含每页 **1200×1600** PNG 及当次项目 JSON；单页按钮在全部预览下方。
- 导出使用点击时的快照，后台会等待同一套字体并核对完整项目及每行位置的 SHA-256 指纹；不一致则报错，不下载错误排版。导出期间继续编辑不改变已经提交的快照。
- 浏览器缩放可用预览工具栏调节；导出分辨率不受预览缩放影响。建议 Chrome/Edge，其他排版引擎可能因实测差异被拒绝导出。

## 测试与实际演示产物

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run demo
```

E2E 默认自动启动 4317 端口服务并使用真实 Chromium，不复用已运行的服务。若手动编辑器正在使用该端口，可在独立测试终端执行 `$env:PORT='4321'; npm.cmd run test:e2e`，保留原有服务。`demo` 使用生产构建及独立 4318 端口，生成 `artifacts/demo/editor.png`、`artifacts/demo/page-01.png` 等、`artifacts/demo/reading-cards.zip` 和 `artifacts/demo/validation.json`，实际检查尺寸、重复导出及预览一致性。

初次实现的 20 项验收说明见 [IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md)；后续整理及最新复验结果见 [CODE_REVIEW_REPORT.md](docs/CODE_REVIEW_REPORT.md)。可直接打开 [已生成的演示 ZIP](artifacts/demo/reading-cards.zip) 和 [实际编辑器截图](artifacts/demo/editor.png)。

## 文件与数据格式

- `src/models/project.ts`：Zod 校验、schema 迁移、精确高亮及文本编辑映射。
- `src/services/pagination.ts`：独立 DOM Range / grapheme 行测量、流式分页及覆盖连续性断言；`tests/e2e/pagination.spec.ts` 在真实浏览器测试。
- `src/views/EditorView.tsx`：编辑表单、命令绑定、预览导航与 DOM 挂载。
- `src/viewmodels/useEditorViewModel.ts`：编辑状态、历史、保存与导出命令、分页调度。
- `src/services/projectIO.ts`：本机草稿恢复、隔离与写入、JSON 读取、下载和导出请求。
- `src/server/index.ts`：本机 Chromium 截图和 ZIP；`src/main.tsx` 的 `/render` 使用与预览相同的分页器。
- `assets/projects/brainco/` 与 `assets/reference/v17/` 保留原始内容。`artifacts/demo/project.json` 是可继续导入编辑的 schema 2 样例。
- schema 2 的精确重点存为 `{id, paragraphId, start, end, quote}`，区间单位为 JavaScript UTF-16 code unit，`end` 不包含端点；保存/加载校验 quote。
- schema 1 迁移时为每处高亮生成 UUID，保存后保留该 ID；原附件不改写。手动分页键单独允许最长 2048 字符，以容纳最长 200 字符业务 ID 的 JSON 转义及节点类型。
- 全局样式在 `styles`；手动分页在 `layoutOverrides.manualPageBreaks`，采用 `JSON.stringify([kind, sourceId])` 的字符串键隔离业务 ID。旧的裸 ID 会迁移。`elementStyles` 仅保留数据，当前不应用单元素覆写。

尚未实现 Markdown 导入/导出、standalone HTML、直接在预览输入、自由位置分页、单元素样式、孤行优化或桌面安装包。词汇统一跟在完整文章之后，不执行文章页与对应词汇的自动配对；这是 HANDOFF 允许的初版简化。

## 常见问题

- **字体错误**：保存 JSON 后重新执行 `npm.cmd ci`、`npm.cmd run build`，重启服务并刷新。字体未就绪时不会截图。
- **Chromium 缺失**：执行 `npx.cmd playwright install chromium`。不要执行浏览器缓存清理后直接导出。
- **端口被占用**：自定义端口可用 `$env:PORT='4320'; npm.cmd start`，随后打开对应地址；E2E 同样读取 `PORT`，未设置时使用 4317。
- **npm/浏览器安装失败**：首次安装需要访问 npm 与 Playwright 下载地址；检查本机代理。无需更改项目代码或关闭数据校验。
- **导出失败**：先等分页完成；确认用 Chromium 系浏览器。错误信息会保留，编辑内容和 JSON 保存仍可用。
- **大型项目**：单字段最多 300000 字符，导出请求上限 5MB；过大的 JSON 会明确拒绝。分页为主线程测量，超大项目可能短暂阻塞界面。
