// 事实闸 FactScribe 呈现层回归测试：离线、零依赖（node:test + node:assert）。
//
// 跑法（integrations/minifactscribe 目录）：
//   node --test tests/
//
// 这一组盯的是"人看得懂"这件事，不是判据。判据层的正反例在 audit.test.mjs。
// 之所以要钉死：呈现层的退化（英文码直接怼脸、状态只靠颜色、过期结果冒充现状）
// 不会让任何测试变红，但会让工具变得没法用。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const HTML = readFileSync(new URL('../miniapp/client/index.html', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../miniapp/client/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../miniapp/client/app.css', import.meta.url), 'utf8');
const SERVER = readFileSync(new URL('../miniapp/node/server.mjs', import.meta.url), 'utf8');
const MINIAPP = readFileSync(new URL('../miniapp/miniapp.json', import.meta.url), 'utf8');
const LAUNCHER = readFileSync(new URL('../miniapp/node/launcher.mjs', import.meta.url), 'utf8');
const PROJECTS = readFileSync(new URL('../miniapp/node/projects.mjs', import.meta.url), 'utf8');

/** 从 app.js 里取出 ISSUE_LABEL 的键。 */
function issueLabelKeys() {
  const block = JS.slice(JS.indexOf('const ISSUE_LABEL = {'), JS.indexOf('};', JS.indexOf('const ISSUE_LABEL = {')));
  return new Set([...block.matchAll(/^\s{2}'?([A-Z_]+)'?:/gm)].map((m) => m[1]));
}

// ------------------------------------------------------- 1. 违规码必须有人话
//
// 判定来自 Python 引擎；工作台把引擎给的码翻成中文短名。
// 翻不出来时退回原码，所以短名表要覆盖引擎真的会发出的那一批码。

test('工作台的问题码有中文短名：翻不出来就退回原码', () => {
  const block = JS.slice(JS.indexOf('const ISSUE_LABEL = {'), JS.indexOf('};', JS.indexOf('const ISSUE_LABEL = {')));
  const pairs = [...block.matchAll(/^\s{2}'?([A-Z_]+)'?:\s*'([^']*)'/gm)];
  assert.ok(pairs.length > 20, '短名表不该只有几条');
  for (const [, code, label] of pairs) {
    assert.match(label, /[\u4e00-\u9fff]/, code + ' 的短名里没有中文');
  }
  assert.match(JS, /ISSUE_LABEL\[f\.code\] \|\| f\.code/, '工作台要给出中文短名，查不到才退回原码');
});

// ------------------------------------------------------------- 2. 过期要说出来
//
// 本地草稿整套已经删掉了：运行时只剩 Python 引擎，判定直接来自引擎。
// 「过期」这件事现在由引擎侧负责，界面不再自己存一份结论。

test('[hidden] 必须压过组件自己的 display：否则"隐藏"只改了属性', () => {
  assert.match(
    CSS,
    /\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    '组件用了 display:flex 时，hidden 属性会被顶掉，必须有全局兜底规则'
  );
});

// ------------------------------------------------- 5. 危险动作必须先确认
//
// 危险动作现在只剩工作台这一侧：删章节要 confirm、冻结证据要问理由。

test('删章节与冻结证据都要先问人', () => {
  assert.match(JS, /confirm\(/, '删章节要先确认');
  assert.match(JS, /prompt\(/, '冻结证据要问理由');
  assert.match(JS, /冻结理由/, '要说清冻结的理由是什么');
});

// --------------------------------------------------- 7. 表头与表格可读

test('表头不换行：中文表头被压成竖排时整张表都读不下去', () => {
  assert.match(
    CSS,
    /\.data-table th\s*\{[^}]*white-space:\s*nowrap/,
    '表头应 nowrap'
  );
});

test('工作台章节编辑框有可见 label，不只靠 aria-label', () => {
  assert.match(HTML, /for="workbench-section-text"/, '当前节应有可见 label');
  assert.match(HTML, /写给工作台项目/, '要说明写给谁');
});

// -------------------------------------------------------- 8. 服务端别乱报 500

test('未知路径回 404 而不是 500：content-type 不能是 undefined', () => {
  assert.match(
    SERVER,
    /function sendText\([^)]*type\s*=\s*'text\/plain/,
    'sendText 的 content-type 必须有默认值'
  );
});

test('本地工作台是独立入口，界面只呈现工作台项目的结果', () => {
  assert.match(HTML, /id="panel-workbench"/, '应有独立的工作台面板');
  assert.match(HTML, /id="btn-workbench-connect"/, '应有连接按钮');
  assert.match(HTML, /只显示工作台项目的结果/, '界面必须说清这里只呈现工作台项目');
  assert.match(JS, /\/api\/workbench/, '客户端应调用工作台代理接口');
  assert.match(JS, /runWorkbenchAudit/, '应有工作台审计入口');
});

test('工作台按节保存，且保存前说明写给工作台项目', () => {
  assert.match(HTML, /id="workbench-section-select"/, '应有节选择');
  assert.match(HTML, /id="btn-workbench-save"/, '应有保存按钮');
  assert.match(HTML, /写给工作台项目/, '必须说明写入目标');
  assert.match(JS, /wb\('\/project'\)/, '应载入工作台项目（经 wb 适配）');
  assert.match(JS, /wb\('\/sections'\)/, '应能保存工作台章节（经 wb 适配）');
  assert.match(JS, /MODE\.mini \? '\/api\/workbench' : '\/api'/, 'MiniApp 走 Node 代理，网页直连 Python');
});

test('「载入工作台项目」按钮删干净了：切换、保存、导入后都会自动刷新', () => {
  assert.doesNotMatch(HTML, /id="btn-workbench-load"/, '不该再有载入工作台项目按钮');
  assert.doesNotMatch(JS, /btn-workbench-load/, '也不该再有它的监听');
});


test('AI 起草是独立入口：页面发起 agent，输出只进候选区', () => {
  assert.match(MINIAPP, /"agentAccess": \["session.run", "session.read"\]/, '必须声明 session.run + session.read');
  assert.match(HTML, /id="panel-ai"/, '应有 AI 起草面板');
  assert.match(HTML, /id="btn-ai-run"/, '应有生成候选按钮');
  assert.match(HTML, /id="ai-candidate"/, '应有候选正文区');
  assert.match(JS, /mcode\?\.miniapp\?\.agent/, '应从页面调用宿主 agent');
  assert.match(JS, /agent\.run/, '应调用 agent.run');
  assert.match(JS, /text\.delta/, '应流式接收 text.delta');
  assert.match(JS, /permission\.requested/, '应把审批交给用户');
  assert.match(JS, /acceptAi/, '采纳后才写工作台');
});


test('非项目对话打开时能检测并报错：AI 必须 fail-closed', () => {
  assert.match(MINIAPP, /"hostAccess": \["navigation.read"\]/, '需要 navigation.read 才能判断打开位置');
  assert.match(HTML, /id="session-banner"/, '应有非对话提示条');
  assert.match(JS, /host\.navigation\.getState/, '应读取 navigation.getState');
  assert.match(JS, /hostView === 'conversation'/, '只有 conversation 才允许 AI');
  assert.match(JS, /AI 起草已禁用/, '未知/非对话时要明说禁用');
});


test('能从当前对话读项目文件夹（session.read），没有就提示', () => {
  assert.match(JS, /agent\.session\(\)/, '应读当前对话的 session');
  assert.match(JS, /workspaceDir/, '应读 workspaceDir');
  assert.match(JS, /isDefaultWorkspace/, '要区分默认工作区');
  assert.match(HTML, /id="workbench-host-path"/, '工作台应显示当前对话项目');
  assert.match(JS, /当前对话没有项目文件夹/, '没有项目文件夹时要提示');
});


test('论文项目＝文件夹：列表、路径校验、切换即换文件夹', () => {
  assert.match(HTML, /id="project-list"/, '应有项目列表（不是下拉框）');
  assert.match(HTML, /id="project-path"/, '当前项目文件夹的位置还在（隐藏着，逻辑从它取路径）');
  assert.match(HTML, /id="btn-workbench-start"/, '应有一键启动');
  assert.match(HTML, /id="btn-workbench-stop"/, '应能停止');
  assert.match(HTML, /id="workbench-allow-write"/, '写权限必须是显式开关');
  assert.match(JS, /\/api\/projects/, '项目列表走 Node 接口');
  assert.match(JS, /\/api\/workbench\/start/, '启动走 Node 接口');
  assert.match(JS, /用当前对话项目/, '应能用当前对话的文件夹');
  assert.match(PROJECTS, /factscribe\.toml/, '校验项目必须含 factscribe.toml');
  assert.match(PROJECTS, /MAX_PROJECTS/, '登记册必须有上限，不能无限长');
});

test('一键启动只跑固定命令：不过 shell、不收任意命令', () => {
  assert.match(LAUNCHER, /shell: false/, '子进程不能过 shell');
  assert.match(LAUNCHER, /'serve', project, '--port', '0', '--json'/, '参数顺序固定');
  assert.match(LAUNCHER, /--allow-write/, '写权限要显式传');
  assert.doesNotMatch(LAUNCHER, /execSync|shell: true|spawn\(\s*['"]sh/, '不许拼 shell 命令');
  assert.match(SERVER, /\/api\/workbench\/start/, 'Node 侧要有启动路由');
  assert.match(SERVER, /stopServe/, '断开/退出要收子进程');
  assert.match(SERVER, /resolveProjectDir/, '启动前必须重新校验文件夹');
});

test('宿主上下文检测真的在启动时跑，不是只定义', () => {
  assert.match(JS, /await detectHostContext\(\)/, 'init 必须先问宿主打开位置');
  assert.match(JS, /session-banner/, '非对话要能看见提示条');
});


test('一套界面两种启动：宿主检测决定显示哪一区', () => {
  assert.match(JS, /mcode\?\.miniapp/, '靠宿主对象判断是不是 MiniApp');
  assert.match(JS, /showHostUi/, '宿主专属区由一个开关控制');
  assert.match(JS, /applyMode/, '启动时要应用模式');
  assert.match(JS, /data-tab="' \+ tab \+ '"/, '按页签逐个显隐');
  assert.match(JS, /const hostTabs = \['ai'\]/, '只有 AI 起草是宿主专属页签');
});

test('网页模式：直连 Python、要 token、藏掉宿主专属按钮', () => {
  assert.match(JS, /MODE\.mini \? '\/api\/workbench' : '\/api'/, '接口按模式分流');
  assert.match(JS, /Authorization = 'Bearer ' \+ state\.token/, '网页模式带 token');
  assert.match(JS, /showTokenPanel/, '缺 token 要提示粘贴');
  assert.match(HTML, /id="token-panel"/, '需要 token 面板');
  assert.match(JS, /这是 MiniApp 专属按钮/, '网页里启动按钮要说明为什么不能点');
});

test('开发模式 --dev：网页也显示宿主专属区，并说明只是预览', () => {
  assert.match(JS, /get\('dev'\) === '1'/, '页面认 ?dev=1');
  assert.match(JS, /开发模式：宿主专属的按钮和输入都显示出来了/, '要说清只是界面预览');
});

test('编译、事实、证据在统一界面里都有入口', () => {
  assert.match(HTML, /id="btn-wb-build"/, '应有编译 PDF');
  assert.match(HTML, /id="wb-fact-form"/, '应有工作台事实表单');
  assert.match(HTML, /id="btn-wb-freeze"/, '应有证据冻结');
  assert.match(JS, /wb\('\/build'\)/, '编译走工作台接口');
  assert.match(JS, /wb\('\/evidence'\)/, '证据走工作台接口');
  assert.match(JS, /wb\('\/pdf'\)/, 'PDF 走工作台接口');
});


test('网页也能管项目：不带路径启动，页面里选文件夹', () => {
  assert.match(JS, /chooseProject/, '网页里选项目要让服务切过去');
  assert.match(JS, /还没有选论文项目/, '未选项目要说清下一步');
  assert.match(JS, /\/api\/projects/, '项目列表与加入走同一接口');
  assert.match(HTML, /id="project-list"/, '项目列表两种模式都该在');
  assert.match(HTML, /id="btn-np-existing-add"/, '加入已有文件夹两种模式都该在');
  assert.doesNotMatch(JS, /'#btn-project-add', '#btn-project-host',/, '网页里不能禁用加入按钮');
});

// ------------------------------------------------------------ 9. 实验报告

test('工作台有实验报告块：下拉、四个动作、签收人、审阅卡', () => {
  assert.match(HTML, /id="wb-reports"/, '应有报告区');
  assert.match(HTML, /id="wb-report-select"/, '应有报告下拉');
  assert.match(HTML, /id="wb-report-by"/, '应有签收人输入');
  assert.match(HTML, /id="wb-report-card"/, '应有审阅卡区');
  for (const id of ['btn-wb-report-check', 'btn-wb-report-lock',
    'btn-wb-report-sign', 'btn-wb-report-import']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '应有按钮 ' + id);
  }
});

test('报告动作要说人话：封存钉哈希、签收认取数位置、导入写进事实账', () => {
  assert.match(HTML, /封存＝把当前文件哈希钉住/, '要说明封存是什么');
  assert.match(HTML, /签收＝你确认取数位置/, '要说明签收是什么');
  assert.match(HTML, /导入＝写进事实账/, '要说明导入是什么');
  assert.match(JS, /报告由实验脚本产出/, '没有报告时要说明去哪儿找');
  assert.match(JS, /新建报告模板/, '没有报告时要告诉人还能自己建一份');
  assert.match(JS, /启动时没加 --allow-write/, '只读时要说明为什么不能写');
});

test('报告走工作台接口（经 wb 适配），MiniApp 走 Node 代理', () => {
  assert.match(JS, /wb\('\/reports'\)/, '报告列表与动作走工作台接口');
  assert.match(JS, /MODE\.mini \? '\/api\/workbench' : '\/api'/, '接口按模式分流');
  assert.match(JS, /function reportAction/, '应有报告动作函数');
  assert.match(SERVER, /'\/api\/workbench\/reports'/, 'Node 侧要有报告代理');
  assert.match(SERVER, /'\/api\/reports\/action'/, 'Node 侧要转到报告动作接口');
});

test('审阅卡逐行显示、不截断：截掉的行等于人没看见却签了字', () => {
  const card = JS.slice(JS.indexOf('function renderReportCard'),
    JS.indexOf('async function loadWorkbenchReports'));
  assert.ok(card.length > 0, '应有审阅卡渲染函数');
  assert.doesNotMatch(card, /\.slice\(|substring\(/, '审阅卡不许截断');
  assert.match(card, /wb-report-line/, '卡片要一行一条');
});

// ---------------------------------------------------- 10. 工作台两栏

test('工作台是两栏：源码+预览 / 问题+AI 聊天；章节目录搬到左侧栏', () => {
  assert.match(HTML, /id="wb-section-list"/, '侧栏应有章节目录');
  assert.match(HTML, /id="btn-wb-mode-source"/, '左栏应有源码切换');
  assert.match(HTML, /id="btn-wb-mode-preview"/, '左栏应有预览切换');
  assert.match(HTML, /id="wb-preview-html"/, '左栏应有网页渲染预览位');
  assert.match(HTML, /id="wb-chat-input"/, '右栏应有聊天输入框');
  assert.match(HTML, /id="wb-chat-send"/, '右栏应有聊天发送按钮');
  assert.match(HTML, /id="workbench-section-select"/, '隐藏的下拉要留着：现有逻辑与测试都认它');
  assert.match(CSS, /\.wb-columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) 360px/,
    '两栏要用 CSS grid：中栏 / 360px');
  assert.match(CSS, /@media \(max-width: 1100px\)[\s\S]*\.wb-columns\s*\{\s*grid-template-columns:\s*1fr/,
    '窄屏要叠成一列');
});

test('工作台面板里不再有章节列：目录搬进左侧栏了', () => {
  const wb = HTML.slice(HTML.indexOf('id="panel-workbench"'), HTML.indexOf('id="panel-facts"'));
  assert.ok(wb.length > 0, '应能找到工作台面板');
  assert.doesNotMatch(wb, /wb-col-sections/, '工作台里不该再有章节列');
  assert.doesNotMatch(wb, /id="wb-section-list"/, '章节目录不该留在工作台面板里');
  assert.match(wb, /id="workbench-status"/, '动作消息行要留在工作台页签');
  assert.match(wb, /id="workbench-save-state"/, '保存状态要留在工作台页签');
});

test('章节目录来自项目章节，当前节高亮，点一下切到那一节', () => {
  const block = JS.slice(JS.indexOf('function renderWorkbenchSections'),
    JS.indexOf('/** 切到某一节'));
  assert.ok(block.length > 0, '应有目录渲染函数');
  assert.match(block, /workbenchProject/, '目录来自工作台项目的章节');
  assert.match(block, /is-active/, '当前节要高亮');
  assert.match(block, /data-section/, '每一节都要能点');
  const jump = JS.slice(JS.indexOf('function selectWorkbenchSection'),
    JS.indexOf('/** 源码 / 预览 两个视图'));
  assert.match(jump, /workbench-section-select/, '目录点击要同步隐藏的下拉');
});

// --------------------------------------------- 10b. 章节增删改（目录级）

test('章节目录能新建 / 改名 / 删除：三个按钮 id 与三条接口都要在', () => {
  assert.match(HTML, /id="btn-wb-section-add"/, '目录标题右侧要有新建按钮');
  assert.match(JS, /id="wb-section-rename"/, '每节要有改名按钮');
  assert.match(JS, /id="wb-section-delete"/, '每节要有删除按钮');
  assert.match(JS, /data-file=/, '两个小按钮要用 data-file 指明是哪一节');
  for (const action of ['create', 'rename', 'delete']) {
    assert.match(JS, new RegExp("wb\\('/sections/" + action + "'\\)"),
      '增删改要走工作台接口：/sections/' + action);
  }
});

test('目录一项一行：主按钮切节，右侧两个小按钮', () => {
  const block = JS.slice(JS.indexOf('function renderWorkbenchSections'),
    JS.indexOf('/** 工作台是不是只读'));
  assert.ok(block.length > 0, '应有目录渲染函数');
  assert.match(block, /wb-section-row/, '一行要有个行容器');
  assert.match(block, /data-section=/, '主按钮负责切节');
  assert.match(block, /data-action="rename"/, '要有改名动作');
  assert.match(block, /data-action="delete"/, '要有删除动作');
  assert.match(CSS, /\.wb-section-row\s*\{[^}]*display:\s*flex/, '行容器要横排');
  assert.match(CSS, /\.wb-section-act\s*\{/, '小按钮要有样式');
});

test('新建 / 改名 / 删除都要先问人，删除被引用时要拦一次', () => {
  assert.match(JS, /prompt\(/, '新建与改名要用 prompt 问文件名');
  assert.match(JS, /confirm\(/, '删除要先确认');
  const del = JS.slice(JS.indexOf('async function deleteWorkbenchSection'),
    JS.indexOf('/** 目录里的操作按钮'));
  assert.ok(del.length > 0, '应有删除函数');
  assert.match(del, /409/, '被引用（409）要先拦一次');
  assert.match(del, /force/, '确认之后才带 force 重试');
  assert.match(del, /references/, '要把引用位置说清楚');
  const rename = JS.slice(JS.indexOf('async function renameWorkbenchSection'),
    JS.indexOf('async function deleteWorkbenchSection'));
  assert.match(rename, /引用/, '改名要说清「只改文件名，不动正文引用」');
});

test('只读工作台：增删改三个按钮都灰掉并说明原因', () => {
  assert.match(JS, /function workbenchReadOnly/, '应有只读判定');
  assert.match(JS, /read_only/, '只读来自服务端的 read_only');
  const block = JS.slice(JS.indexOf('function renderWorkbenchSections'),
    JS.indexOf('/** 工作台是不是只读'));
  assert.match(block, /disabled/, '只读时要禁用按钮');
  assert.match(JS, /wb\.readOnly/, '要说明为什么灰掉');
});

test('顶部冗余信息压缩到右栏 #wb-meta：大卡片与 panel-head 都不要了', () => {
  assert.match(HTML, /id="wb-meta"/, '右栏要有紧凑信息行');
  assert.doesNotMatch(HTML, /id="workbench-summary"/, '顶部大卡片要去掉');
  const panel = HTML.slice(HTML.indexOf('id="panel-workbench"'),
    HTML.indexOf('id="panel-facts"'));
  assert.ok(panel.length > 0, '应能找到工作台面板');
  assert.doesNotMatch(panel, /class="panel-head"/, '工作台页签的大标题要去掉');
  // 顺序：问题 → 紧凑信息 → AI 聊天
  const metaAt = panel.indexOf('id="wb-meta"');
  const issuesAt = panel.indexOf('id="workbench-audit"');
  const aiAt = panel.indexOf('id="wb-side-ai"');
  assert.ok(issuesAt > 0 && metaAt > issuesAt && aiAt > metaAt,
    '右栏顺序要是：问题 → 紧凑信息 → AI 聊天');
  const meta = JS.slice(JS.indexOf('function renderWbMeta'),
    JS.indexOf('// ------------------------------------------------------- 章节增删改'));
  assert.match(meta, /条事实/, '紧凑行要写事实条数');
  assert.match(meta, /节/, '紧凑行要写节数');
  assert.match(meta, /只读|可写/, '紧凑行要写可写/只读');
  assert.match(meta, /title/, '根路径放 title 属性，不占屏');
});

test('预览是网页渲染：把当前节转成 HTML，不编译 PDF', () => {
  assert.match(JS, /function latexToHtml/, '应有 LaTeX→HTML 渲染器');
  assert.match(JS, /function renderWbPreviewHtml/, '应有渲染入口');
  assert.match(JS, /latexInline/, '行内命令要有白名单替换');
  assert.match(HTML, /id="wb-preview-html"/, '预览是一个渲染容器');
  assert.doesNotMatch(HTML, /id="wb-preview-pdf"/, '不再嵌 PDF');
});

test('预览不依赖 --allow-build：切换即渲染', () => {
  const block = JS.slice(JS.indexOf('function setWbMode'),
    JS.indexOf('function stripTexComment'));
  assert.match(block, /renderWbMode/, '切开预览走统一渲染入口');
  const mode = JS.slice(JS.indexOf('function renderWbMode'), JS.indexOf('function setWbMode'));
  assert.match(mode, /renderWbPreviewHtml/, '预览模式要渲染 HTML');
  assert.doesNotMatch(block, /build_allowed/, '不再看编译开关');
});

test('问题列表能跳到源码那一行：滚动过去并选中', () => {
  assert.match(JS, /function jumpToLine/, '应有跳转函数');
  assert.match(JS, /data-jump-line/, '每条问题要带跳转入口');
  const block = JS.slice(JS.indexOf('function jumpToLine'),
    JS.indexOf('function snippetSlot'));
  assert.match(block, /setSelectionRange/, '跳转要选中那一行');
  assert.match(block, /scrollTop/, '跳转要把那一行滚进视野');
});

test('AI 聊天在网页模式禁用并说明原因：需要 MiniApp 宿主', () => {
  const block = JS.slice(JS.indexOf('async function sendChat'),
    JS.indexOf('/** 聊天里的流式事件'));
  assert.ok(block.length > 0, '应有聊天发送函数');
  assert.match(block, /!MODE\.mini/, '网页模式不许起草');
  assert.match(block, /需要 MiniApp 宿主/, '要说明为什么点不了');
  assert.match(JS, /setChatNotice\('网页模式不能起草：需要 MiniApp 宿主'\)/,
    '网页模式的提示语要写清楚');
  const mode = JS.slice(JS.indexOf('function applyMode'), JS.indexOf('function renderSessionBanner'));
  assert.match(mode, /#wb-chat-input/, '网页模式要禁用聊天输入');
  assert.match(mode, /#wb-chat-send/, '网页模式要禁用发送按钮');
  assert.match(mode, /el\.disabled = true/, '禁用要真的生效');
});

// ------------------------------------------------- 11. hash 路由多页
//
// 拆页不是为了好看，是为了让「刷新后还在同一页」「后退能退回上一页」
// 这两件事成立。所以这里钉死的是路由本身：hash 写法、面板、导航项。

test('导航只剩 AI 起草 + 工作台事实账 + 实验报告 + 引用，工作台与项目没有导航项', () => {
  assert.match(HTML, /data-tab="reports"[^>]*aria-controls="panel-reports"/, '应有实验报告导航项');
  assert.match(HTML, /data-tab="facts"[^>]*aria-controls="panel-facts"/, '应有工作台事实账导航项');
  assert.match(HTML, /data-tab="citations"[^>]*aria-controls="panel-citations"/, '应有引用导航项');
  const nav = HTML.slice(HTML.indexOf('data-tab="ai"'), HTML.indexOf('</nav>'));
  const order = [...nav.matchAll(/data-tab="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['ai', 'facts', 'reports', 'citations'],
    '导航顺序：AI 起草 → 工作台事实账 → 实验报告 → 引用');
});

test('工作台与项目不再有导航项：章节是工作台的入口，项目靠顶部按钮', () => {
  assert.doesNotMatch(HTML, /data-tab="workbench"/, '工作台不该再有导航项：章节承担入口');
  assert.doesNotMatch(HTML, /data-tab="project"/, '项目不该再有导航项：用顶部按钮进 #/project');
});

test('左侧栏：项目切换按钮 + 章节目录 + 事实账导航，左下角留偏好容器', () => {
  assert.match(HTML, /id="btn-sidebar-project"/, '侧栏顶部应有项目切换按钮');
  assert.match(HTML, /id="sidebar-project-name"/, '按钮里要有项目名');
  assert.match(HTML, /id="wb-section-list"/, '章节目录应在侧栏里');
  assert.match(HTML, /id="sidebar-prefs"/, '左下角要留偏好容器（放语言/主题）');
  assert.doesNotMatch(HTML, /绿只说明三件事/, '左下角那句边界说明不该再出现');
  assert.doesNotMatch(HTML, /class="boundary"/, '边界说明的样式位也不该再出现');
});

test('项目按钮是按钮样，不是导航项：整宽、左对齐、有边框', () => {
  assert.match(CSS, /\.project-switch\s*\{[^}]*width:\s*100%/, '按钮要整宽');
  assert.match(CSS, /\.project-switch\s*\{[^}]*border:/, '按钮要有边框');
  assert.match(CSS, /\.project-switch\s*\{[^}]*text-align:\s*left/, '按钮内容要左对齐');
  assert.doesNotMatch(CSS, /\.project-switch[^{]*\{[^}]*background:\s*none/, '按钮不能是透明底的导航项');
});

test('侧栏目录可滚动：章节多了不许把下面的导航顶走', () => {
  assert.match(CSS, /\.sidebar\s+\.wb-section-list\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/,
    '侧栏里的章节目录要限高并自己滚');
});

test('实验报告与项目各有独立面板：报告块搬走了，id 一个没变', () => {
  assert.match(HTML, /id="panel-reports"[^>]*role="tabpanel"/, '应有实验报告面板');
  assert.match(HTML, /id="panel-project"[^>]*role="tabpanel"/, '应有项目面板');
  for (const id of ['wb-reports', 'wb-report-select', 'wb-report-by', 'wb-report-card',
    'btn-wb-report-check', 'btn-wb-report-lock', 'btn-wb-report-sign',
    'btn-wb-report-import']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '报告块 id 要留在 DOM 里：' + id);
  }
  // 报告块要真的在 panel-reports 里面，不只是还在页面上
  const panel = HTML.slice(HTML.indexOf('id="panel-reports"'), HTML.indexOf('id="panel-project"'));
  assert.match(panel, /id="wb-report-select"/, '报告下拉应在实验报告面板里');
  assert.match(panel, /id="wb-report-card"/, '审阅卡应在实验报告面板里');
});

// ------------------------------------------------- 12. 引用页（多 bib 汇总）
//
// 引用页回答三件事：引了哪些、哪些还没引到、哪些标识不可复核。
// 它只读：不编辑 bib、不联网核对（联网核对仍然走 audit）。

test('引用页有自己的面板：汇总、文件清单、过滤、表格的 id 一个不能少', () => {
  assert.match(HTML, /id="panel-citations"[^>]*role="tabpanel"/, '要有引用面板');
  assert.match(HTML, /id="panel-citations" class="panel panel-narrow"/, '引用页是窄面板');
  for (const id of ['cite-summary', 'cite-files', 'cite-table', 'cite-tbody',
    'cite-filter-all', 'cite-filter-no-id', 'cite-filter-unused']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '引用页要有 #' + id);
  }
  const panel = HTML.slice(HTML.indexOf('id="panel-citations"'),
    HTML.indexOf('id="panel-project"'));
  assert.match(panel, /id="cite-summary"/, '汇总行要在引用面板里');
  assert.match(panel, /id="cite-files"/, '文件清单要在引用面板里');
  assert.match(panel, /id="cite-table"/, '表格要在引用面板里');
});

test('引用页按需加载：切到这一页才请求 /api/citations', () => {
  assert.match(JS, /wb\('\/citations'\)/, '要调引用接口');
  assert.match(JS, /state\.tab === 'citations'/, '切到引用页才处理');
  assert.match(JS, /async function loadCitations\(\)/, '要有加载函数');
  const block = JS.slice(JS.indexOf('function renderTab'),
    JS.indexOf('function renderTab') + 1200);
  assert.match(block, /loadCitations\(\)/, '切页时要拉引用数据');
});

test('三个过滤按钮：当前项要标出来，不能只靠颜色', () => {
  for (const [id, filter] of [['cite-filter-all', 'all'],
    ['cite-filter-no-id', 'no-id'], ['cite-filter-unused', 'unused']]) {
    assert.match(HTML, new RegExp('id="' + id + '"[^>]*data-filter="' + filter + '"'),
      id + ' 要带自己的过滤值');
  }
  assert.match(HTML, /id="cite-filter-all"[^>]*is-active/, '默认选中「全部」');
  assert.match(JS, /classList\.toggle\('is-active'/, '当前过滤项要标出来');
});

test('状态短名进字典：中文与英文各有一套', () => {
  for (const key of ['cite.statusOk', 'cite.statusNoId', 'cite.statusBadId',
    'cite.statusUnused']) {
    assert.match(JS, new RegExp("'" + key + "': '[^']+'"), '字典里要有 ' + key);
  }
  for (const word of ['有标识', '缺 DOI/arXiv', '标识不合法', '未引用']) {
    assert.match(JS, new RegExp(word), '要有中文短名：' + word);
  }
  assert.match(JS, /没有参考文献文件/, '没有 bib 时要说清');
  assert.match(JS, /没有参考文献文件（配置 bib 或正文 \\\\bibliography\{\}）/,
    '空状态要说清 bib 从哪来');
});

test('引用页的颜色只用现成变量：深浅两套都跟着走', () => {
  const start = CSS.indexOf('.cite-filters');
  const block = CSS.slice(start, CSS.indexOf('/* ---------- 工作台两栏'));
  assert.ok(start >= 0 && block.length > 0, '引用页要有样式');
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,6}/, '不许自创颜色值');
  assert.match(block, /var\(--mcode-accent-soft\)/, '当前过滤项要用语义变量');
});

test('项目页装的是项目管理：列表、权限、启动/停止、解释器', () => {
  const panel = HTML.slice(HTML.indexOf('id="panel-project"'), HTML.indexOf('id="panel-ai"'));
  for (const id of ['project-list', 'project-path', 'btn-project-host',
    'workbench-allow-write', 'workbench-allow-build', 'btn-workbench-start',
    'btn-workbench-stop', 'btn-workbench-connect', 'project-python',
    'workbench-host-path', 'btn-new-project']) {
    assert.match(panel, new RegExp('id="' + id + '"'), '项目面板里应有 ' + id);
  }
  // 「最近项目」下拉已经换成列表：下拉不许再回来。
  assert.doesNotMatch(panel, /id="project-select"/, '项目列表不再用下拉框');
  // 工作台页签只留两栏与状态行
  const wb = HTML.slice(HTML.indexOf('id="panel-workbench"'), HTML.indexOf('id="panel-facts"'));
  assert.doesNotMatch(wb, /id="project-list"/, '项目列表不该留在工作台页签');
  assert.doesNotMatch(wb, /id="wb-report-select"/, '报告下拉不该留在工作台页签');
  assert.doesNotMatch(wb, /id="wb-section-list"/, '章节目录搬去左侧栏了，不该留在工作台页签');
  assert.match(wb, /id="workbench-status"/, '动作消息行要留在工作台页签');
  assert.match(wb, /id="workbench-save-state"/, '保存状态要留在工作台页签');
});

test('项目列表是手风琴：一行一项，展开后有编辑/删除/载入项目/复制路径', () => {
  const block = JS.slice(JS.indexOf('function renderProjectList'),
    JS.indexOf('async function projectItemAction'));
  assert.ok(block.length > 0, '应有列表渲染函数');
  for (const [action, label] of [['edit', '编辑'], ['delete', '删除'],
    ['load', '载入项目'], ['copy', '复制路径']]) {
    assert.match(block, new RegExp("'" + action + "'"), '列表项要有动作：' + action);
    assert.match(JS, new RegExp("'" + label + "'"), '动作文案要进字典：' + label);
  }
  assert.match(JS, /state\.projectOpen === path \? '' : path/, '同一时刻只展开一条，再点收起');
  assert.match(JS, /confirm\(/, '删除要先问一次');
  assert.match(JS, /wb\('\/projects\/update'\)/, '编辑要走新的更新接口');
  assert.match(JS, /clipboard/, '复制路径要写剪贴板');
});

test('项目页右栏是窄栏，只有三个按钮', () => {
  const side = HTML.slice(HTML.indexOf('class="project-side"'),
    HTML.indexOf('</aside>', HTML.indexOf('class="project-side"')));
  assert.ok(side.length > 0, '应有右栏');
  for (const id of ['btn-new-project', 'btn-guide-open', 'btn-guide-reset']) {
    assert.match(side, new RegExp('id="' + id + '"'), '右栏要有 ' + id);
  }
  const buttons = [...side.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons, ['btn-new-project', 'btn-guide-open', 'btn-guide-reset'],
    '右栏只有这三个按钮，顺序不变');
  assert.doesNotMatch(side, /id="guide-card"/, '新手引导整张卡片要去掉');
  assert.doesNotMatch(HTML, /id="btn-project-add"/, '「加入已有文件夹」独立输入要去掉');
  assert.match(CSS, /\.project-layout\s*\{[^}]*grid-template-columns:[^}]*200px/,
    '右栏是窄栏（约 200px）');
});

test('工作台事实账搬进独立面板 #/facts：事实块 id 一个没变', () => {
  assert.match(HTML, /id="panel-facts"[^>]*role="tabpanel"/, '应有事实账面板');
  const panel = HTML.slice(HTML.indexOf('id="panel-facts"'), HTML.indexOf('id="panel-reports"'));
  for (const id of ['wb-facts', 'wb-facts-count', 'wb-fact-card', 'wb-fact-form',
    'wb-fact-id', 'wb-fact-value', 'wb-fact-claim', 'wb-fact-source',
    'wb-fact-derived', 'wb-fact-expr', 'wb-fact-note', 'btn-wb-add-fact']) {
    assert.match(panel, new RegExp('id="' + id + '"'), '事实块 id 要留在事实账面板里：' + id);
  }
  // 事实块要真的搬走了，不只是复制了一份
  const wb = HTML.slice(HTML.indexOf('id="panel-workbench"'), HTML.indexOf('id="panel-facts"'));
  assert.doesNotMatch(wb, /id="wb-facts"/, '事实块不该留在工作台面板里');
  assert.doesNotMatch(wb, /id="wb-fact-card"/, '事实表单不该留在工作台面板里');
});

test('路由靠地址栏 hash：切页写 hash，hashchange 回读，前进/后退因此可用', () => {
  assert.match(JS, /hashchange/, '应监听 hashchange');
  assert.match(JS, /'#\/' \+ tab/, 'hash 形式应是 #/<页名>');
  assert.match(JS, /suppressHash/, '自己写 hash 会触发 hashchange，要有标志防递归');
  const block = JS.slice(JS.indexOf('function switchTab'), JS.indexOf('function renderTab'));
  assert.match(block, /writeHash\(tab/, '切页要写地址栏');
  // 写 hash 而不是 replaceState：replaceState 不留历史，后退键就废了
  const write = JS.slice(JS.indexOf('function writeHash'), JS.indexOf('function updateTitle'));
  assert.match(write, /location\.hash = next/, '切页要压历史，后退才回得去');
  assert.match(write, /location\.hash === next/, '同一页不要重复写 hash');
  assert.match(write, /history\.replaceState/, '首屏用 replaceState，别塞一条空历史');
});

test('启动落在哪一页由 hash 说了算；非法 hash 退回默认页', () => {
  assert.match(JS, /function pageFromHash/, '应有 hash 解析函数');
  assert.match(JS, /const hashPage = pageFromHash\(\)/, '启动时应读 hash');
  assert.match(JS, /hashPage \|\| defaultPage\(\)/, '没给 hash 时用默认页');
  assert.match(JS, /function defaultPage/, '应有默认页函数');
  assert.match(JS, /function defaultPage\(\) \{\s*return 'project'/, '两种模式都默认落到项目管理页');
  // 非法 hash 不能停在一个空白面板上
  const on = JS.slice(JS.indexOf('function onHashChange'), JS.indexOf('function renderTab'));
  assert.match(on, /const fallback = defaultPage\(\)/, '非法 hash 要退回默认页');
  assert.match(on, /switchTab\(fallback/, '退回后要真的切过去');
});

test('默认进项目页：上次停在哪个页签不再决定（只有 hash 明确指向别页才去别页）', () => {
  assert.doesNotMatch(JS, /localStorage\.getItem\('minifactscribe\.tab'\)/,
    '不许用上次的页签盖掉默认页');
  assert.match(JS, /switchTab\(hashPage \|\| defaultPage\(\)/, '启动只看 hash');
});

test('renderTab 认得新页面：报告页渲染报告，项目页渲染项目，事实页渲染事实账', () => {
  const block = JS.slice(JS.indexOf('function renderTab'), JS.indexOf('// ------------------------------------------------------------------ KPI'));
  assert.match(block, /state\.tab === 'reports'/, '报告页分支要在');
  assert.match(block, /renderWorkbenchReports\(\)/, '报告页要渲染报告');
  assert.match(block, /loadWorkbenchReports\(\)/, '报告页才按需拉列表');
  assert.match(block, /state\.tab === 'project'\) renderProjects\(\)/, '项目页要渲染项目');
  assert.match(block, /state\.tab === 'facts'\) renderWorkbenchFacts\(\)/, '事实账页要渲染事实块');
});

test('事实账有自己的路由 #/facts：页表里要写明', () => {
  assert.match(JS, /facts:\s*'nav\.facts'/, '页面名要挂一个 i18n 键（文案在字典里）');
  assert.match(JS, /const PAGE_LABEL = \{[\s\S]*?workbench: 'page\.workbench'[\s\S]*?ai: 'page\.ai'/,
    '页表要写明这六页：工作台 / 事实账 / 实验报告 / 引用 / 项目 / AI 起草');
});

test('applyMode 只把 AI 起草当宿主专属：facts / reports 两项都要能进', () => {
  const block = JS.slice(JS.indexOf('function applyMode'), JS.indexOf('function renderSessionBanner'));
  assert.ok(block.length > 0, '应有 applyMode');
  const hostTabs = /const hostTabs = \[([^\]]*)\]/.exec(block);
  assert.ok(hostTabs, '应有宿主专属页签清单');
  assert.doesNotMatch(hostTabs[1], /facts|reports|project|citations/, '这些页不是宿主专属，不该在隐藏名单里');
  assert.match(JS, /citations: 'page\.citations'/, '引用页要在页表里');
});

test('点侧栏章节就打开工作台：章节本身就是入口', () => {
  const block = JS.slice(JS.indexOf("$('#wb-section-list').addEventListener"),
    JS.indexOf("$('#btn-wb-mode-source').addEventListener"));
  assert.ok(block.length > 0, '应有目录点击处理');
  assert.match(block, /selectWorkbenchSection\(btn\.dataset\.section\)/, '点章节要切到那一节');
  assert.match(block, /switchTab\('workbench'\)/, '点章节要打开工作台');
});

test('侧栏顶部按钮进项目页：项目视图不在导航里，只能从按钮进', () => {
  const block = JS.slice(JS.indexOf("$('#btn-sidebar-project').addEventListener"),
    JS.indexOf("$('#btn-wb-mode-source').addEventListener"));
  assert.ok(block.length > 0, '项目按钮要有点击处理');
  assert.match(block, /switchTab\('project'\)/, '项目按钮要进项目页');
});

test('侧栏项目名跟着工作台项目走：没有项目就写那句默认提示', () => {
  const block = JS.slice(JS.indexOf('function renderSidebarProject'),
    JS.indexOf('function renderWorkbench()'));
  assert.ok(block.length > 0, '应有侧栏项目名渲染函数');
  assert.match(block, /workbenchProject/, '名字来自工作台项目');
  assert.match(HTML, /data-i18n="sidebar\.noProject"/, '没项目时那句提示挂在空态元素上');
  assert.match(JS, /'sidebar\.noProject':\s*'未选择项目，点击项目管理选择或新建项目'/,
    '没项目时那句提示要留在字典里');
  assert.match(block, /sidebar-project-name/, '要写到侧栏那个名字位');
  assert.match(block, /sidebar-project-empty/, '没项目时显示那句默认提示');
  assert.match(block, /sidebar-project-root/, '有项目时显示树根');
  assert.doesNotMatch(block, /sectionsCollapsed/, '章节目录不再折叠');
});

test('侧栏顶部：按钮是「项目管理」，下面一行是当前项目名', () => {
  assert.match(HTML, /id="btn-sidebar-project"[\s\S]{0,200}项目管理/, '按钮文案是「项目管理」');
  assert.match(HTML, /id="sidebar-project-name"/, '按钮下面要有项目名那一行');
  assert.match(JS, /'btn\.projectManage':\s*'项目管理'/, '按钮文案进字典');
});

test('标题跟着当前页与项目走：工作台 · 论文名', () => {
  assert.match(JS, /document\.title/, '应更新标题');
  const block = JS.slice(JS.indexOf('function updateTitle'), JS.indexOf('function switchTab'));
  assert.match(block, /PAGE_LABEL\[state\.tab\]/, '标题要带页名');
  assert.match(block, /workbenchProject/, '标题要带项目名');
});

test('报告列表按需加载：进报告页才请求，工作台启动不预拉', () => {
  const project = JS.slice(JS.indexOf('async function loadWorkbenchProject'),
    JS.indexOf('async function saveWorkbenchSection'));
  // 允许「当前就在报告页」时补拉；不允许无条件预拉
  assert.match(project, /if \(state\.tab === 'reports'\)[\s\S]*loadWorkbenchReports\(\)/,
    '只有当前在报告页时才补拉');
  assert.doesNotMatch(project.replace(/if \(state\.tab === 'reports'\)[\s\S]*?\n  \}/, ''),
    /loadWorkbenchReports\(\)/, '工作台页不该预拉报告列表');
  const loader = JS.slice(JS.indexOf('async function loadWorkbenchReports'),
    JS.indexOf('function reportAction'));
  assert.match(loader, /wbReportsLoading/, '要有并发/重复请求保护');
  assert.match(loader, /api\(wb\('\/reports'\)\)/, '列表仍走同一个接口');
});

// ------------------------------------------------- 12. 语言 / 主题切换
//
// 这一步只做「界面偏好」：语言与主题是这台机器的事，不是项目的事。
// 之所以要钉死，是因为这类退化不响：文案没跟着换、刷新后不记得、
// 浅色下看不清——都不会让任何后端测试变红。

/** 从 app.js 里取出 I18N 字典某个语言的键。 */
function i18nKeys(lang) {
  const m = new RegExp('\\n  ' + lang + ': \\{([\\s\\S]*?)\\n  \\},').exec(JS);
  assert.ok(m, 'I18N 里要有 ' + lang + ' 这一套');
  return [...m[1].matchAll(/^\s{4}'([^']+)':/gm)].map((x) => x[1]);
}

/** 取出一段 CSS 里的 --mcode-* 变量名与取值。 */
function cssVars(block) {
  const out = new Map();
  for (const m of block.matchAll(/(--mcode-[a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

test('左下角有四个切换按钮：中文/EN 与浅/深', () => {
  assert.match(HTML, /id="sidebar-prefs"/, '要有放切换按钮的容器');
  for (const id of ['btn-lang-zh', 'btn-lang-en', 'btn-theme-light', 'btn-theme-dark']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '应有按钮 ' + id);
  }
  // 两组分段按钮，别做成一堆散按钮
  assert.ok((HTML.match(/class="prefs-group"/g) || []).length === 2, '要有两组分段按钮');
  // 样式小巧、不抢主导航
  assert.match(CSS, /\.prefs-btn\s*\{[^}]*font-size:\s*12px/, '切换按钮字号要小（12px）');
});

test('当前选中项加 is-active：语言与主题各有一格', () => {
  assert.match(JS, /classList\.toggle\('is-active'/, '选中项要加 is-active');
  assert.match(HTML, /id="btn-lang-zh"[^>]*class="prefs-btn is-active"/,
    '默认语言是中文，中文那一格默认选中');
  const block = JS.slice(JS.indexOf('function syncThemeButtons'), JS.indexOf('function syncLangButtons'));
  assert.match(block, /btn-theme-light/, '浅色那一格也要有选中态');
  assert.match(block, /btn-theme-dark/, '深色那一格也要有选中态');
  assert.match(block, /is-active/, '主题按钮要跟着当前生效的主题打标');
  const lang = JS.slice(JS.indexOf('function syncLangButtons'), JS.indexOf('function initPrefs'));
  assert.match(lang, /btn-lang-zh[\s\S]*btn-lang-en/, '语言按钮也要按当前语言打标');
});

test('语言与主题都要记住：刷新后还在', () => {
  assert.match(JS, /localStorage\.setItem\('factscribe\.lang'/, '语言要存 localStorage');
  assert.match(JS, /localStorage\.setItem\('factscribe\.theme'/, '主题要存 localStorage');
  assert.match(JS, /localStorage\.getItem\('factscribe\.lang'/, '启动时要读回语言');
  assert.match(JS, /localStorage\.getItem\('factscribe\.theme'/, '启动时要读回主题');
  assert.match(JS, /function initPrefs/, '要有读回偏好的入口');
  assert.match(JS, /initPrefs\(\)/, '启动时要真的调用它');
});

test('主题写到 <html> 上：不写就是跟随系统', () => {
  assert.match(JS, /document\.documentElement\.dataset\.theme = next/, '主题要写进 dataset.theme');
  assert.match(JS, /delete\s+document\.documentElement\.dataset\.theme/, '跟随系统时要把 data-theme 拿掉');
  assert.match(JS, /^\s*theme:\s*''/m, '默认主题是空的＝跟随系统');
});

test('state.lang 默认中文，document.documentElement.lang 跟着变', () => {
  assert.match(JS, /lang:\s*'zh'/, '默认语言是中文');
  assert.match(JS, /document\.documentElement\.lang\s*=/, 'html 的 lang 属性要跟着变');
});

test('切语言：扫一遍 DOM 再重渲染当前页', () => {
  assert.match(JS, /function applyLang\(/, '要有 applyLang');
  assert.match(JS, /function applyLangDom\(/, '静态文案要扫 DOM');
  const block = JS.slice(JS.indexOf('function applyLang('), JS.indexOf('function setLang'));
  assert.match(block, /applyLangDom\(\)/, '静态文案要扫一遍 DOM');
  assert.match(block, /renderTab\(\)/, 'JS 生成的文案要靠重渲染当前页跟上');
  assert.match(block, /updateTitle\(\)/, '页标题也要跟着变');
});

test('三种静态文案标记都要认：正文 / 提示 / 占位符', () => {
  assert.match(JS, /\[data-i18n\]/, '要认 data-i18n（正文）');
  assert.match(JS, /\[data-i18n-title\]/, '要认 data-i18n-title（title）');
  assert.match(JS, /\[data-i18n-placeholder\]/, '要认 data-i18n-placeholder（占位符）');
});

test('导航与页标题带 data-i18n', () => {
  const nav = HTML.slice(HTML.indexOf('data-tab="ai"'), HTML.indexOf('</nav>'));
  const items = [...nav.matchAll(/data-tab="([a-z]+)"([^>]*)>/g)];
  assert.ok(items.length >= 4, '导航项要够多');
  for (const [, tab, rest] of items) {
    assert.match(rest, /data-i18n="/, '导航项 ' + tab + ' 要带 data-i18n');
  }
  // 页标题（面板 h2）也要能翻
  for (const panel of ['panel-workbench', 'panel-facts', 'panel-reports', 'panel-citations',
    'panel-project', 'panel-ai']) {
    const block = HTML.slice(HTML.indexOf('id="' + panel + '"'), HTML.indexOf('</section>', HTML.indexOf('id="' + panel + '"')));
    assert.match(block, /<h2[^>]*data-i18n="/, panel + ' 的页标题要带 data-i18n');
  }
});

test('字典里中英键数量一致：漏一个就是半中半英', () => {
  const zh = i18nKeys('zh');
  const en = i18nKeys('en');
  assert.ok(zh.length >= 40, '字典不该只有几条（' + zh.length + '）');
  assert.equal(zh.length, en.length, '中英键数量要一致');
  assert.deepEqual([...zh].sort(), [...en].sort(), '中英要有一模一样的键');
});

test('HTML 里每个 data-i18n 键都要在字典里：写了标记却查不到就会露出原文', () => {
  const known = new Set(i18nKeys('zh'));
  const used = new Set();
  for (const attr of ['data-i18n', 'data-i18n-title', 'data-i18n-placeholder']) {
    for (const m of HTML.matchAll(new RegExp(attr + '="([^"]+)"', 'g'))) used.add(m[1]);
  }
  assert.ok(used.size >= 40, '标记要覆盖得够广（' + used.size + '）');
  const missing = [...used].filter((k) => !known.has(k)).sort();
  assert.deepEqual(missing, [], '这些键字典里没有：' + missing.join('、'));
});

test('报告页的状态词要跟着语言变：final / 已封存 / 已签收', () => {
  for (const key of ['report.final', 'report.locked', 'report.signed', 'report.unsigned',
    'report.readOnly']) {
    assert.match(JS, new RegExp("'" + key + "'"), '字典里要有 ' + key);
  }
  const block = JS.slice(JS.indexOf('function renderReportState'),
    JS.indexOf('function renderReportCard'));
  assert.match(block, /reportStatusWord\(item\.status\)/, '报告状态词要走字典');
  assert.match(block, /'report\.locked'|'report\.lockStale'|'report\.unlocked'/, '封存状态要跟着语言变');
  assert.match(block, /'report\.signed'|'report\.unsigned'/, '签收状态要跟着语言变');
});

test('空状态提示要跟着语言变：没有报告 / 没有事实 / 没有红黄项', () => {
  for (const key of ['empty.noReports', 'empty.noFacts', 'empty.noRedYellow']) {
    assert.match(JS, new RegExp("'" + key + "'"), '字典里要有 ' + key);
    assert.match(JS, new RegExp('t\\(\\s*' + "'" + key + "'"), key + ' 要真的被用上');
  }
});

test('浅色/深色两套变量照抄现有色板：不许自创颜色', () => {
  const root = CSS.slice(CSS.indexOf(':root,'), CSS.indexOf('@media (prefers-color-scheme: dark)'));
  const darkMedia = CSS.slice(CSS.indexOf('@media (prefers-color-scheme: dark)'),
    CSS.indexOf("html[data-theme='light']"));
  const light = CSS.slice(CSS.indexOf("html[data-theme='light']"),
    CSS.indexOf("html[data-theme='dark']"));
  const dark = CSS.slice(CSS.indexOf("html[data-theme='dark']"),
    CSS.indexOf('* { box-sizing: border-box; }'));
  assert.ok(light.length > 0 && dark.length > 0, '两套显式主题都要在');
  const rootVars = cssVars(root);
  const lightVars = cssVars(light);
  const darkVars = cssVars(dark);
  const mediaVars = cssVars(darkMedia);
  assert.deepEqual([...lightVars.keys()].sort(), [...rootVars.keys()].sort(),
    '浅色主题的变量名要和 :root 一模一样');
  assert.deepEqual([...darkVars.keys()].sort(), [...mediaVars.keys()].sort(),
    '深色主题的变量名要和系统暗色那一套一模一样');
  for (const [k, v] of lightVars) {
    assert.equal(v, rootVars.get(k), '浅色主题里 ' + k + ' 的取值要和 :root 一样');
  }
  for (const [k, v] of darkVars) {
    assert.equal(v, mediaVars.get(k), '深色主题里 ' + k + ' 的取值要和系统暗色一样');
  }
});

test('显式主题压得住系统偏好：系统是暗色时点「浅」也要真的变浅', () => {
  // html[data-theme] 的特异性 (0,1,1) 高过媒体查询里的 :root (0,1,0)，
  // 而且必须在媒体查询之后出现，不然会被系统配色顶回去。
  assert.match(CSS, /html\[data-theme='light'\]\s*\{[^}]*color-scheme:\s*light/,
    '浅色主题要自己声明 color-scheme');
  assert.match(CSS, /html\[data-theme='dark'\]\s*\{[^}]*color-scheme:\s*dark/,
    '深色主题要自己声明 color-scheme');
  const lightAt = CSS.indexOf("html[data-theme='light']");
  const darkAt = CSS.indexOf("html[data-theme='dark']");
  const mediaAt = CSS.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(lightAt > mediaAt && darkAt > lightAt,
    '两套显式主题都要排在系统媒体查询之后');
});

// ------------------------------------------------------ 新手引导（示例论文）

test('新手引导的入口都要在：打开 / 引导条 / 重置 / 关闭', () => {
  for (const id of ['btn-guide-open', 'guide-bar', 'btn-guide-reset-bar', 'btn-guide-close']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '页面要有 #' + id);
  }
  // 项目页的引导卡片删了：打开示例与重置示例收进右栏的窄栏里。
  assert.doesNotMatch(HTML, /id="guide-card"/, '项目页的引导卡片要去掉');
});

test('装示例走工作台接口：网页直连 Python，MiniApp 走 Node 代理', () => {
  assert.match(JS, /wb\('\/samples\/guide'\)/, "JS 要调 wb('/samples/guide')");
  assert.match(JS, /method:\s*'POST'[\s\S]{0,160}reset/, '装示例是 POST，带 reset');
});

test('引导条的五个勾由状态推导：不许假勾', () => {
  const block = JS.slice(JS.indexOf('function guideProgress'), JS.indexOf('function renderGuide'));
  assert.ok(block.length > 0, '要有 guideProgress 这个推导函数');
  assert.match(block, /state\.currentSection/, '第 ① 步看当前选中的节');
  assert.match(block, /findings\.length > 0/, '第 ② 步看有没有红/黄');
  assert.match(block, /reports\.some/, '第 ③ 步看报告是否已签收');
  assert.match(block, /signed/, '第 ③ 步要有签收字段');
  assert.match(block, /facts\.some/, '第 ④ 步看账里有没有报告导入的事实');
  assert.match(block, /f\.report/, '第 ④ 步要有 report 字段');
  assert.match(block, /severity !== 'red'/, '第 ⑤ 步看红牌是否清零');
  // 勾由状态算出来：渲染里不许写死一个「已完成」。
  const render = JS.slice(JS.indexOf('function renderGuide'), JS.indexOf('async function openGuideSample'));
  assert.match(render, /guideProgress\(\)/, '渲染要问 guideProgress 要进度');
  assert.match(render, /ok \? '✓' : '○'/, '做完是 ✓，没做是 ○（不靠颜色单独承载）');
});

test('引导状态记在 localStorage 的 factscribe.guide 里（值＝项目路径）', () => {
  assert.match(JS, /factscribe\.guide/, '要用 factscribe.guide 这个键');
  assert.match(JS, /localStorage\.setItem\(GUIDE_KEY/, '要把路径写回去');
  assert.match(JS, /localStorage\.getItem\(GUIDE_KEY/, '刷新后要读得回来');
});

test('引导文案进字典：中英各一套', () => {
  for (const key of ['guide.title', 'guide.desc', 'guide.bar', 'guide.step1', 'guide.step2',
    'guide.step3', 'guide.step4', 'guide.step5', 'guide.hint1', 'guide.hint5', 'guide.readyMini',
    'btn.guideOpen', 'btn.guideOpenExists', 'btn.guideReset', 'btn.guideClose']) {
    assert.match(JS, new RegExp("'" + key + "'"), '字典里要有 ' + key);
  }
});

// ------------------------------------------- 新建项目页（#/project/new）
//
// 布局从「下拉框 + 大块路径输入」改成「左边列表、右边新建」，
// 新建另开一页 #/project/new。这一组盯住那条路不许断。

test('新建项目页在：面板、表单、按钮、字段 id 一个不缺', () => {
  assert.match(HTML, /id="panel-project-new"[^>]*role="tabpanel"/, '应有新建项目面板');
  assert.match(HTML, /id="new-project-form"/, '应有新建表单');
  assert.match(HTML, /id="btn-np-create"/, '应有创建按钮');
  assert.match(HTML, /id="btn-np-cancel"/, '应有取消按钮');
  assert.match(HTML, /id="btn-new-project"/, '项目页要有「新建项目」按钮');
  for (const id of ['np-title', 'np-parent', 'np-slug', 'np-authors', 'np-description',
    'np-lang', 'np-sections', 'np-facts', 'np-bib', 'np-root-tex', 'np-build',
    'np-source-root', 'np-output', 'np-error']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '新建表单里应有 ' + id);
  }
});

test('新建页有两个页签：新建项目 / 加入已有文件夹', () => {
  assert.match(HTML, /id="btn-np-tab-new"/, '要有「新建项目」页签');
  assert.match(HTML, /id="btn-np-tab-add"/, '要有「加入已有文件夹」页签');
  assert.match(HTML, /id="np-existing-path"/, '加入页签要有路径输入');
  assert.match(HTML, /id="btn-np-existing-add"/, '加入页签要有「加入」按钮');
  assert.match(JS, /'project\/add'/, 'JS 要认得 #/project/add');
  const block = JS.slice(JS.indexOf('function pageFromHash'), JS.indexOf('function panelIdFor'));
  assert.match(block, /project\/add/, 'hash 解析要处理 project/add');
  assert.match(block, /raw\.startsWith\('project\/'\)/, '非法子路由要回项目列表');
  assert.match(JS, /addExistingProject/, '要有加入已有文件夹的动作');
  assert.match(JS, /'\/api\/projects'/, '加入走登记接口');
});

test('路由认得 project/new：非法子路由回项目列表', () => {
  assert.match(JS, /'project\/new'/, 'JS 要认得 #/project/new');
  const block = JS.slice(JS.indexOf('function pageFromHash'), JS.indexOf('function panelIdFor'));
  assert.ok(block.length > 0, '应有 hash 解析函数');
  assert.match(block, /project\/new/, 'hash 解析要处理 project/new');
  assert.match(JS, /function panelIdFor/, '面板 id 要按子路由分');
  assert.match(JS, /panel-project-new/, '新建页有自己的面板');
});

test('新建走 POST /api/projects/create：失败留在表单里，不跳走', () => {
  const block = JS.slice(JS.indexOf('async function createProjectFromForm'),
    JS.indexOf('async function loadProjects'));
  assert.ok(block.length > 0, '应有创建函数');
  assert.match(block, /wb\('\/projects\/create'\)/, "要调 wb('/projects/create')");
  assert.match(block, /method:\s*'POST'/, '创建是 POST');
  assert.match(block, /showNpError/, '失败要有错误位');
  assert.match(block, /btn\.disabled = true/, '创建中要禁用按钮');
  assert.match(HTML, /id="np-error"/, '表单顶部要有错误位');
});

test('项目列表：排除示例论文、当前项带「当前」徽标、每项有详情', () => {
  const block = JS.slice(JS.indexOf('function renderProjectList'),
    JS.indexOf('async function loadProjects'));
  assert.ok(block.length > 0, '应有列表渲染函数');
  assert.match(block, /!p\.guide/, '示例论文（guide）不进列表');
  assert.match(block, /project-badge/, '当前项目要有徽标');
  assert.match(block, /description/, '每项要显示详情');
  assert.match(JS, /'project\.current':/, '「当前」文案要进字典');
});

// ------------------------------------------- 13. 旧的「本地草稿」整套不许回来
//
// 运行时只剩 Python 引擎：界面里没有草稿页，Node 里没有草稿接口。
// 这一节钉的就是「删干净了」——任何一处草稿冒头都会让测试变红。

test('界面里没有草稿页：导航、面板、顶栏控件都不许再有', () => {
  for (const tab of ['manuscript', 'ledger', 'refs', 'protect', 'audit']) {
    assert.doesNotMatch(HTML, new RegExp('data-tab="' + tab + '"'), '不该有草稿页签：' + tab);
    assert.doesNotMatch(HTML, new RegExp('id="panel-' + tab + '"'), '不该有草稿面板：' + tab);
  }
  for (const id of ['project-name', 'save-state', 'verdict', 'btn-demo', 'btn-audit',
    'demo-confirm', 'stale-banner', 'btn-rerun', 'export-out', 'manuscript-input',
    'bib-input', 'facts-tbody', 'fact-form', 'protect-result', 'issues-list']) {
    assert.doesNotMatch(HTML, new RegExp('id="' + id + '"'), '不该再有草稿控件：' + id);
  }
});

test('客户端不再有草稿状态与函数：也不许再请求草稿接口', () => {
  for (const fn of ['renderManuscript', 'renderLedger', 'renderRefs', 'renderProtect',
    'renderAudit', 'runAudit', 'loadDemo', 'scheduleSave', 'saveNow', 'refreshStale',
    'sigOf', 'setSaveState', 'loadFactForm', 'validateFact', 'showFormErrors',
    'renderVerdict', 'loadPreviewDraft']) {
    assert.doesNotMatch(JS, new RegExp('function ' + fn + '\\b'), '不该再有草稿函数：' + fn);
  }
  for (const key of ['state.project', 'state.audit', 'state.verify', 'state.auditSig',
    'state.stale', 'state.saveFailed', 'state.editingFactId']) {
    assert.doesNotMatch(JS, new RegExp(key + '\\b'), '不该再有草稿状态：' + key);
  }
  for (const route of ['/api/state', '/api/demo', '/api/verify', '/api/protect', '/api/export']) {
    assert.doesNotMatch(JS, new RegExp(route.replace('/', '\\/')), '不该再请求草稿接口：' + route);
  }
});

test('Node 侧没有草稿路由：判定只来自 Python 工作台', () => {
  for (const route of ["'/api/state'", "'/api/demo'", "'/api/verify'", "'/api/protect'",
    "'/api/export/", "'/api/audit'"]) {
    assert.doesNotMatch(SERVER, new RegExp('path === ' + route), 'Node 不该再有草稿路由：' + route);
  }
  assert.doesNotMatch(SERVER, /from '\.\/audit\.mjs'/, 'Node 不该再引 JS 审计引擎');
  assert.doesNotMatch(SERVER, /from '\.\/demo\.mjs'/, 'Node 不该再引演示数据');
  assert.match(SERVER, /'\/api\/workbench\/audit'/, '工作台审计代理要留着');
});


test('预览跟着当前节走：切节/切回预览都重新渲染', () => {
  assert.match(JS, /renderWbPreviewHtml\(\)/, '渲染入口要在');
  const wire = JS.slice(JS.indexOf("$('#workbench-section-select').addEventListener('change'"));
  assert.match(wire.slice(0, 800), /renderWbPreviewHtml/, '切节时预览要重画');
});


test('MiniApp 可在浏览器打开同一个服务：按钮只在宿主里出现', () => {
  assert.match(HTML, /id="btn-wb-open-browser"/, '应有在浏览器打开按钮');
  assert.match(JS, /wb\('\/browser'\)/, '走工作台 browser 接口');
  assert.match(JS, /openBrowser\.hidden = !MODE\.mini/, '网页模式隐藏');
});


test('章节目录：带阿拉伯数字序号，不折叠', () => {
  assert.match(JS, /wb-section-num/, '章节前要有序号位');
  assert.match(JS, /\(index \+ 1\)/, '序号从 1 开始');
  assert.doesNotMatch(JS, /sectionsCollapsed/, '不再有折叠状态');
});

// ------------------------------------------- 14. 工作台改版（预览合并 / 快捷插入 / 聊天）
//
// 这一版把工作台从「一堆小控件」改成「一张大编辑器 + 一个互斥右栏」：
// 源码与预览合成右上角一个分段控件；编辑器上方有快捷插入工具栏；
// 保存按钮是绿的；右栏在「要处理的问题」与「AI 聊天」之间切换，同时只显示一个。

test('项目管理按钮的文字要居中', () => {
  assert.match(CSS, /\.project-switch\s*\{[^}]*justify-content:\s*center/,
    '「项目管理」按钮文字要居中');
});

test('编辑器卡片更高：约 90vh，源码与预览撑满', () => {
  assert.match(CSS, /\.wb-columns\s*\{[^}]*--wb-editor-h:\s*90vh/,
    '编辑器高度锚在 90vh');
  assert.match(CSS, /\.wb-editor-card\s*\{[^}]*min-height:\s*70vh[^}]*height:\s*var\(--wb-editor-h,\s*90vh\)/,
    '编辑器卡片：min-height 70vh / height 90vh');
  assert.match(CSS, /\.wb-editor-card \.editor\s*\{[^}]*height:\s*100%/,
    '源码 textarea 要撑满卡片');
  assert.match(CSS, /#wb-preview-pdf\s*\{[^}]*height:\s*100%/,
    '预览 embed 要撑满卡片');
});

test('源码与预览合成一个分段控件，嵌在编辑器右上角', () => {
  const card = HTML.slice(HTML.indexOf('class="wb-editor-card"'),
    HTML.indexOf('</section>', HTML.indexOf('class="wb-editor-card"')));
  assert.ok(card.length > 0, '应能找到编辑器卡片');
  assert.match(card, /id="btn-wb-mode-source"/, '源码分段要在编辑器卡片里');
  assert.match(card, /id="btn-wb-mode-preview"/, '预览分段要在编辑器卡片里');
  assert.match(card, /wb-col-head-right/, '分段控件要靠右');
  assert.match(HTML, /<div class="wb-mode" role="group"/, '两个视图共用一个分段控件');
});

test('保存本节是绿色的：深浅两套都看得清', () => {
  assert.match(HTML, /id="btn-workbench-save" class="btn btn-success"/,
    '保存本节按钮要用 .btn-success');
  assert.match(CSS, /\.btn-success[^{]*\{[^}]*var\(--mcode-success-action-bg\)/,
    '绿色保存走语义变量');
  assert.match(CSS, /\.btn-success[^{]*\{[^}]*var\(--mcode-success-action-text\)/,
    '字色也要走语义变量');
  const light = /html\[data-theme='light'\][\s\S]*?--mcode-success-action-bg:\s*([^;]+);/.exec(CSS);
  const dark = /html\[data-theme='dark'\][\s\S]*?--mcode-success-action-bg:\s*([^;]+);/.exec(CSS);
  assert.ok(light && dark, '深浅两套都要给绿色');
  assert.notEqual(light[1].trim(), dark[1].trim(),
    '深色模式要用另一套绿色：暗底上也要看得清');
});

test('快捷插入工具栏：模板够用，按钮等宽不换行', () => {
  assert.match(HTML, /id="wb-snippets"/, '要有快捷插入工具栏');
  const snippets = [...HTML.matchAll(/data-insert="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(snippets.length >= 8,
    '快捷插入模板至少 8 个（实际 ' + snippets.length + '）');
  for (const want of ['\\midrule', '\\sys{}', '\\cite{}', '\\ref{}', '\\label{sec:}',
    '\\fact{}', '\\footnote{}']) {
    assert.ok(snippets.includes(want), '要有模板：' + want);
  }
  const table = snippets.find((s) => s.includes('\\toprule'));
  assert.ok(table, '表格模板要有三线表骨架');
  assert.match(table, /\\midrule/, '三线表要有 midrule');
  assert.match(table, /\\bottomrule/, '三线表要有 bottomrule');
  assert.match(CSS, /\.wb-snippets\s*\{[^}]*overflow-x:\s*auto/, '不换行时横向滚动');
  assert.match(CSS, /\.wb-snippet\s*\{[^}]*font-family:[^}]*monospace/, '按钮用等宽字体');
});

test('插入在光标处：槽位落到花括号里', () => {
  assert.match(JS, /function insertSnippet/, '要有插入实现');
  const block = JS.slice(JS.indexOf('function insertSnippet'), JS.indexOf('function renderWbSide'));
  assert.ok(block.length > 0, '应有插入函数');
  assert.match(block, /selectionStart/, '要取光标位置');
  assert.match(block, /setSelectionRange/, '插入后要把光标放到槽位');
  assert.match(JS, /function snippetSlot/, '要认得出模板里的槽位');
  const slot = JS.slice(JS.indexOf('function snippetSlot'), JS.indexOf('function snippetCaret'));
  assert.match(slot, /\{\}/, '空的 {} 就是槽位');
  assert.match(JS, /\(begin\|end\)\$/, '环境参数不算槽位');
});

test('右栏两个面板互斥：问题 / AI 聊天', () => {
  for (const id of ['btn-wb-side-issues', 'btn-wb-side-ai', 'wb-side-issues', 'wb-side-ai']) {
    assert.match(HTML, new RegExp('id="' + id + '"'), '右栏要有 #' + id);
  }
  assert.match(HTML, /id="wb-side-ai" class="wb-side-panel" hidden/, 'AI 面板默认藏着');
  assert.match(HTML, /id="btn-wb-side-issues"[^>]*is-active/, '默认停在问题面板');
  const side = JS.slice(JS.indexOf('function renderWbSide'), JS.indexOf('function chatStorageKey'));
  assert.ok(side.length > 0, '应有右栏切换函数');
  assert.match(side, /issues\.hidden = side !== 'issues'/, '问题面板要跟着切换显隐');
  assert.match(side, /ai\.hidden = side !== 'ai'/, 'AI 面板要跟着切换显隐');
  assert.match(CSS, /\.wb-side-panel\s*\{[^}]*height:\s*100%/, '聊天窗口与左栏等高');
});

test('AI 聊天：记录 / 输入 / 发送，历史按项目存在本地', () => {
  assert.match(HTML, /id="wb-chat-log"/, '要有聊天记录区');
  assert.match(HTML, /id="wb-chat-input"/, '要有聊天输入');
  assert.match(HTML, /id="wb-chat-send"/, '要有发送按钮');
  assert.match(JS, /factscribe\.chat\./, 'localStorage 键要含 factscribe.chat.');
  assert.match(JS, /localStorage\.setItem\(key/, '历史要写进 localStorage');
  assert.match(JS, /localStorage\.getItem\(key/, '刷新后要读得回来');
  assert.match(JS, /chat:\s*\[\]/, '聊天历史放在 state.chat 里');
  assert.match(JS, /role === 'user' \|\| m\.role === 'assistant'/, '历史项要分清角色');
  assert.match(JS, /wb-msg-'\s*\+\s*\(m\.role === 'user'/, '消息按角色分左右');
  assert.match(CSS, /\.wb-msg-user\s*\{[^}]*align-self:\s*flex-end/, '用户消息靠右');
  assert.match(CSS, /\.wb-msg-ai\s*\{[^}]*align-self:\s*flex-start/, '助手消息靠左');
});

test('聊天调宿主 agent：提示带当前节与事实账，流式追加', () => {
  assert.match(JS, /agent\.run/, '聊天要调宿主 agent');
  assert.match(JS, /text\.delta/, '聊天要流式接收');
  const prompt = JS.slice(JS.indexOf('function buildSectionPrompt'), JS.indexOf('function aiPrompt'));
  assert.ok(prompt.length > 0, '应有拼提示的函数');
  assert.match(prompt, /当前节/, '提示里要有当前节');
  assert.match(prompt, /事实账/, '提示里要有事实账');
  assert.match(JS, /buildSectionPrompt\(text\)/, '聊天要复用 AI 起草那套提示');
});

test('原来的「和 AI 说」小输入框删干净了：聊天窗口取代它', () => {
  assert.doesNotMatch(HTML, /id="wb-ai-input"/, '不该再有那个小输入框');
  assert.doesNotMatch(JS, /wb-ai-input/, '也不该再有它的引用');
  assert.doesNotMatch(HTML, /id="btn-wb-ai-send"/, '旧的发送按钮要删');
  assert.doesNotMatch(JS, /sendWbToAi|openAiTab/, '旧的两个入口函数要删');
});

test('审计跑完不再写状态行：状态行只留错误与明确动作', () => {
  assert.doesNotMatch(JS, /工作台审计完成/, '这句没有信息量，要整个删掉');
  const block = JS.slice(JS.indexOf('async function runWorkbenchAudit'),
    JS.indexOf('function wire'));
  assert.ok(block.length > 0, '应有审计函数');
  assert.match(block, /workbench-status'\)\.textContent = ''/, '跑完状态行回到空');
});


test('证据冻结/解冻按钮在右栏问题面板顶部', () => {
  const issues = HTML.slice(HTML.indexOf('id="wb-side-issues"'),
    HTML.indexOf('id="wb-side-ai"'));
  assert.match(issues, /id="btn-wb-freeze"/, '冻结按钮在问题面板里');
  assert.match(issues, /id="btn-wb-unfreeze"/, '解冻按钮在问题面板里');
  assert.match(issues, /id="wb-evidence-meta"/, '证据状态也在顶部');
});

// --------------------------------------------- 9. 读图 / MathML / 语法高亮
//
// 三件事各自要成立：
//   1. 论文里的图要真的看得见（走 /api/asset，MiniApp 走 Node 代理）；
//   2. 公式要渲染成 <math>，不是一堆反斜杠；
//   3. 源码面板要分颜色：注释、命令、环境、花括号、数学、数字。

/**
 * 从 app.js 里取出一个顶层函数的源码。
 *
 * 结束位置找的是「顶格的 }」——app.js 里的顶层函数都这么写，
 * 嵌套的括号都在缩进里。比数花括号可靠：函数体里有字符串也有正则，
 * 两者都带花括号，数��会数错。
 */
function functionSource(name) {
  const start = JS.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'app.js 里找不到 ' + name);
  const end = JS.indexOf('\n}\n', start);
  assert.notEqual(end, -1, name + ' 的函数体没有闭合');
  return JS.slice(start, end + 2);
}

/**
 * 取一个 const 箭头的源码（esc / has 这种）。
 *
 * 结尾找的是「空行之前最后一个分号」：这两条里都带分号（'&#39;'），
 * 按分号截会截断。
 */
function constSource(prefix) {
  const start = JS.indexOf(prefix);
  assert.notEqual(start, -1, 'app.js 里找不到 ' + prefix);
  const stop = JS.indexOf('\n\n', start);
  const chunk = JS.slice(start, stop);
  return chunk.slice(0, chunk.lastIndexOf(';') + 1);
}

/**
 * 把 app.js 里的纯函数拿到 node 里跑：不引第三方，也不起浏览器。
 * 只取没有副作用的那几个（预览渲染、高亮、地址拼接）。
 */
function loadPure() {
  const src = [
    'const MODE = { mini: false, dev: false, showHostUi: false };',
    'const state = { token: "t" };',
    constSource('const esc ='),
    constSource('const has ='),
    constSource('const TEX_GREEK ='),
    constSource('const TEX_OPS ='),
    constSource('const TEX_ESCAPED ='),
    functionSource('wb'),
    functionSource('assetUrl'),
    functionSource('texMathParse'),
    functionSource('texMathToMathML'),
    functionSource('highlightTex'),
    functionSource('stripTexComment'),
    functionSource('texBlockStart'),
    functionSource('latexInline'),
    functionSource('texMathBlockHtml'),
    functionSource('texFigureBody'),
    functionSource('latexToHtml'),
    'return { latexToHtml, texMathToMathML, highlightTex, assetUrl, latexInline };',
  ].join('\n');
  return new Function(src)();
}

test('源码编辑器是叠加结构：高亮层在底下，输入框在上层', () => {
  assert.match(HTML, /id="wb-editor-wrap"/, '要有叠加层的容器');
  assert.match(HTML, /class="wb-editor-wrap"/, '容器也要有样式类');
  assert.match(
    HTML,
    /<pre id="wb-highlight" class="wb-highlight" aria-hidden="true"><code><\/code><\/pre>/,
    '高亮层是 pre > code，且对读屏软件隐藏'
  );
  assert.match(
    HTML,
    /<textarea id="workbench-section-text" class="editor wb-editor-input"/,
    '输入框要带叠加层的类'
  );
  const wrap = HTML.slice(HTML.indexOf('id="wb-editor-wrap"'), HTML.indexOf('id="workbench-section-text"'));
  assert.ok(wrap.includes('id="wb-highlight"'), '高亮层要在输入框前面（底下那层）');
});

test('输入框文字透明、光标留着：高亮层与输入框字体行高一致', () => {
  const rule = CSS.slice(CSS.indexOf('.wb-editor-input {'), CSS.indexOf('.wb-editor-input:focus'));
  assert.match(rule, /color:\s*transparent/, '输入框文字要透明');
  assert.match(rule, /caret-color:\s*var\(--mcode-text\)/, '光标要看得见');
  assert.match(rule, /background:\s*transparent/, '输入框底色要透明，让底下那层透出来');
  assert.match(CSS, /\.wb-highlight\s*\{[^}]*position:\s*absolute/, '高亮层要绝对定位叠在底下');
  // 两层的字体与行高必须是同一套值，否则光标会跟字错行。
  const pre = CSS.slice(CSS.indexOf('.wb-highlight,'), CSS.indexOf('.wb-highlight {'));
  assert.match(pre, /font-family:\s*'JetBrains Mono'/, '两层用同一个字体');
  assert.match(pre, /line-height:\s*1\.8/, '两层用同一个行高');
  assert.match(pre, /padding:\s*12px 14px/, '两层用同一份内边距');
});

test('高亮配色在浅色与深色下各有一份', () => {
  const names = ['comment', 'command', 'env', 'brace', 'math', 'number'];
  for (const name of names) {
    const hits = CSS.match(new RegExp('--mcode-tex-' + name + ':\\s*(#[0-9a-f]{6})', 'gi')) || [];
    assert.equal(hits.length, 4, name + ' 应在四套主题里各定义一次');
  }
  assert.match(CSS, /\.tx-comment\s*\{[^}]*color:\s*var\(--mcode-tex-comment\)/, '注释要有颜色');
  assert.match(CSS, /\.tx-cmd\s*\{[^}]*color:\s*var\(--mcode-tex-command\)/, '命令要有颜色');
  assert.match(CSS, /\.tx-env\s*\{[^}]*color:\s*var\(--mcode-tex-env\)/, '环境要有颜色');
  assert.match(CSS, /\.tx-math\s*\{[^}]*color:\s*var\(--mcode-tex-math\)/, '数学要有颜色');
});

test('读图地址：网页走 /api/asset，MiniApp 走 Node 代理', () => {
  const pure = loadPure();
  assert.match(pure.assetUrl('figs/a.png'), /^\/api\/asset\?path=figs%2Fa\.png/, '网页直连 Python');
  assert.match(JS, /MODE\.mini \? '\/api\/workbench' : '\/api'/, 'MiniApp 走 Node 代理');
  assert.match(JS, /wb\('\/asset'\)/, '读图也要走 wb 适配');
  assert.match(SERVER, /'\/api\/workbench\/asset'/, 'Node 侧要有读图代理');
});

test('预览里的公式是 math 元素，不是纯文本', () => {
  const pure = loadPure();
  const html = pure.latexToHtml('代价是 $x^2 + \\alpha$ 这么大。');
  assert.match(html, /<math/, '行内公式要渲染成 math 元素');
  assert.match(html, /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/, '上标要用 msup，数字不能丢');
  assert.match(html, /<mi>α<\/mi>/, '希腊字母要认出来');
  assert.doesNotMatch(html, /\$\^2/, '不该再留原始的 $…$');
});

test('分数、根号与上下标都认得', () => {
  const pure = loadPure();
  const out = pure.texMathToMathML('\\frac{a_1}{x^2} + \\sqrt{y}');
  assert.match(out, /<mfrac>/, '分数要用 mfrac');
  assert.match(out, /<msub><mi>a<\/mi><mn>1<\/mn><\/msub>/, '下标要用 msub');
  assert.match(out, /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/, '上标要用 msup');
  assert.match(out, /<msqrt>/, '根号要用 msqrt');
});

test('块级公式独立成行：$$…$$ 与 equation 环境都算', () => {
  const pure = loadPure();
  const inline = pure.latexToHtml('$$E = mc^2$$');
  assert.match(inline, /display="block"/, '$$…$$ 要独立成行');
  const env = pure.latexToHtml('\\begin{equation}\nE = mc^2\n\\end{equation}');
  assert.match(env, /display="block"/, 'equation 环境要独立成行');
  assert.match(env, /class="tex-math-block"/, '块级样式要留着');
});

test('认不出的命令原样显示，不崩', () => {
  const pure = loadPure();
  const out = pure.texMathToMathML('\\foo{x}');
  assert.match(out, /<mtext class="tex-math-raw">\\foo<\/mtext>/, '认不出的命令要原样显示');
  assert.match(CSS, /\.tex-math-raw\s*\{[^}]*font-family/, '原样显示的要用等宽小字');
});

test('预览里的图走读图接口，坏图有占位', () => {
  const pure = loadPure();
  const html = pure.latexToHtml('\\begin{figure}\n  \\includegraphics{figs/a.png}\n  \\caption{结果}\n\\end{figure}');
  assert.match(html, /<img class="tex-img"/, '图要渲染成 img');
  assert.match(html, /\/api\/asset\?path=figs%2Fa\.png/, '图片地址走读图接口');
  assert.match(html, /onerror=/, '读不出来时要给占位');
  assert.match(html, /data-missing="figs\/a\.png"/, '占位要显示文件名');
});

test('高亮分得出注释、命令、环境、花括号、数学、数字', () => {
  const pure = loadPure();
  const out = pure.highlightTex('% 这是注释\n\\begin{figure}\n\\caption{x}\n$y^2$ { } 42');
  assert.match(out, /<span class="tx-comment">% 这是注释<\/span>/, '注释要单独一段');
  assert.match(out, /<span class="tx-env">\\begin\{figure\}<\/span>/, '环境要整体一个颜色');
  assert.match(out, /<span class="tx-cmd">\\caption<\/span>/, '命令要有颜色');
  assert.match(out, /<span class="tx-math">\$y\^2\$<\/span>/, '数学要有颜色');
  assert.match(out, /<span class="tx-brace">\{<\/span>/, '花括号要有颜色');
  assert.match(out, /<span class="tx-num">42<\/span>/, '数字要有颜色');
});

test('高亮先转义：源码里的尖括号不能变成真的标签', () => {
  const pure = loadPure();
  const out = pure.highlightTex('a < b && c > d');
  assert.doesNotMatch(out, /<b\b/, '不能吐出真的标签');
  assert.match(out, /&lt;/, '尖括号要转义');
});

test('输入时更新高亮，滚动时两层同步', () => {
  assert.match(JS, /addEventListener\('input', \(\) => updateHighlight\(\)\)/, '输入要更新高亮');
  assert.match(JS, /addEventListener\('scroll', \(\) => syncHighlightScroll\(\)\)/, '滚动要同步');
  assert.match(JS, /pre\.scrollTop = ta\.scrollTop/, '滚动同步的方向要对');
  assert.match(JS, /insertSnippet[\s\S]{0,900}updateHighlight\(\)/, '插入片段后也要更新');
});

test('太大的文件关闭高亮并说清楚为什么', () => {
  assert.match(JS, /HIGHLIGHT_MAX_CHARS = 200 \* 1024/, '超过 200 KB 就关掉高亮');
  assert.match(HTML, /id="wb-highlight-note"/, '提示元素要在页面里');
  assert.match(JS, /wb-highlight-note/, '要有一行提示');
});

// ------------------------------------------------- 15. 三个页面的顶部操作
//
// 事实账、实验报告、引用这三页各自缺一个「从这里开始」的动作：
//   - 事实账：追加事实的表单藏在页面下方，右上角没有入口；
//   - 实验报告：下拉一直是空的，用户不知道报告从哪来；
//   - 引用：只能看不能改。
// 这一组钉住三个右上角按钮与它们各自的接口。

test('事实账右上角有「追加事实」：点了展开表单并把焦点放到 ID 栏', () => {
  const head = HTML.slice(HTML.indexOf('id="panel-facts"'),
    HTML.indexOf('id="panel-reports"'));
  assert.match(head, /class="panel-head"/, '事实页要有页头');
  assert.match(head, /id="btn-wb-fact-add"/, '页头右侧要有追加按钮');
  assert.match(JS, /function openFactForm/, '要有展开表单的函数');
  const block = JS.slice(JS.indexOf('function openFactForm'),
    JS.indexOf('async function addWorkbenchFact'));
  assert.ok(block.length > 0, '应有 openFactForm');
  assert.match(block, /wb-fact-card/, '要展开 #wb-fact-card');
  assert.match(block, /\.open = true/, 'details 要真的打开');
  assert.match(block, /scrollIntoView/, '要滚到可见');
  assert.match(block, /wb-fact-id/, '焦点要放到 ID 栏');
  assert.match(JS, /#btn-wb-fact-add'\)\.addEventListener\('click', openFactForm\)/,
    '按钮要接上展开动作');
});

test('报告页右上角能新建报告模板：问 id、POST 模板接口、刷完选中新报告', () => {
  const head = HTML.slice(HTML.indexOf('id="panel-reports"'),
    HTML.indexOf('id="panel-citations"'));
  assert.match(head, /id="btn-report-new"/, '报告页头要有新建按钮');
  assert.match(JS, /wb\('\/reports\/template'\)/, '要走工作台模板接口');
  assert.match(JS, /method:\s*'POST'[\s\S]{0,200}reports\/template|reports\/template[\s\S]{0,200}method:\s*'POST'/,
    '建模板是 POST');
  const block = JS.slice(JS.indexOf('async function newReportTemplate'),
    JS.indexOf('function citeStatusChip'));
  assert.ok(block.length > 0, '应有 newReportTemplate');
  assert.match(block, /prompt\(/, '要用 prompt 问报告 id');
  assert.match(block, /report-/, '默认 id 是 report-YYYYMMDD');
  assert.match(block, /loadWorkbenchReports\(\)/, '建完要刷新报告列表');
  assert.match(block, /select\.value = data\.path/, '要选中新报告');
  assert.match(block, /report\.templateCreated/, '状态行要提示下一步');
  assert.match(JS, /'report\.templateCreated':\s*'模板已建，填好 metrics 后检查\/封存\/签收'/,
    '提示语要写清下一步做什么');
});

test('报告空状态说人话：报告从哪来 + 还能自己建一份', () => {
  assert.match(JS, /还没有报告。报告由实验脚本产出/, '空状态要说清报告从哪来');
  assert.match(JS, /experiments\/<实验>\/reports\/\*\.report\.toml/, '要给出报告文件的位置');
  assert.match(JS, /新建报告模板/, '要告诉人还能自己建一份');
});

test('引用页右上角能添加引用：内联表单六个字段 + 提交走工作台接口', () => {
  const panel = HTML.slice(HTML.indexOf('id="panel-citations"'),
    HTML.indexOf('id="panel-project"'));
  assert.match(panel, /id="btn-cite-add"/, '引用页头要有添加按钮');
  assert.match(panel, /id="cite-form"/, '要有内联表单');
  for (const id of ['cite-key', 'cite-title', 'cite-author', 'cite-year',
    'cite-doi', 'cite-arxiv']) {
    assert.match(panel, new RegExp('id="' + id + '"'), '表单里要有 ' + id);
  }
  assert.match(JS, /wb\('\/citations\/add'\)/, '要走工作台添加接口');
  assert.match(JS, /wb\('\/citations\/delete'\)/, '要走工作台删除接口');
  assert.match(JS, /method:\s*'POST'[\s\S]{0,240}citations\/add|citations\/add[\s\S]{0,240}method:\s*'POST'/,
    '加引用是 POST');
});

test('每条引用都有删除按钮：先确认再删，删完刷新列表', () => {
  assert.match(JS, /data-cite-delete=/, '每行都要有删除按钮');
  const block = JS.slice(JS.indexOf('async function deleteCitation'),
    JS.indexOf('const REPORT_ACTION_LABEL'));
  assert.ok(block.length > 0, '应有 deleteCitation');
  assert.match(block, /confirm\(/, '删之前要先问人');
  assert.match(block, /loadCitations\(\)/, '删完要刷新列表');
  assert.match(JS, /data-cite-delete/, '按钮要带 data-cite-delete');
});

test('只读工作台：新建模板、加引用、删引用都灰掉', () => {
  const reports = JS.slice(JS.indexOf('function renderWorkbenchReports'),
    JS.indexOf('function renderReportState'));
  assert.match(reports, /btn-report-new/, '报告页要管新建按钮');
  assert.match(reports, /disabled/, '只读时要禁用按钮');
  const cites = JS.slice(JS.indexOf('function renderCitations'),
    JS.indexOf('async function loadCitations'));
  assert.match(cites, /btn-cite-add/, '引用页要管添加按钮');
  assert.match(cites, /read_only/, '只读来自服务端的 read_only');
  assert.match(cites, /disabled/, '只读时要禁用按钮');
});

test('MiniApp 走 Node 代理：三条新接口都要有对应的代理路由', () => {
  assert.match(SERVER, /'\/api\/workbench\/reports\/template'/, 'Node 侧要有建模板代理');
  assert.match(SERVER, /'\/api\/workbench\/citations\/add'/, 'Node 侧要有加引用代理');
  assert.match(SERVER, /'\/api\/workbench\/citations\/delete'/, 'Node 侧要有删引用代理');
});
