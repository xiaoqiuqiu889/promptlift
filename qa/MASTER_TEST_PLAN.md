# Prompt Lift 主测试计划

> 状态：仅设计，未执行。日期：2026-08-03。本文不证明任何测试已运行；执行记录、截图、几何 JSON、日志和缺陷单应在真实验收时另行生成。

## 1. 目标、范围与硬性规则

本计划覆盖 Prompt Lift 从首次启动、配置、目标窗口捕获、模型请求、预览/回填、复制、取消、恢复、托盘和开机启动，到打包 Windows EXE 的完整用户链路。特别覆盖两条此前被报告“完全不触发处理”的 P0 入口：

1. 双击 Alt：低级键盘 hook 收到第二次 Alt 的 key-up，进入 main 的捕获/增强路径。
2. 紧凑状态左键点击宠物头像：点击命中真实头像区域，进入 renderer 的增强路径，再由 main 捕获、调用真实模型并回填。

两条入口必须分开执行，不能用一次成功替代另一条。每条都必须观测 `入口事件 → main 捕获 → renderer loading → 目标文本捕获 → 真实模型非空返回 → 安全回填 → 原文恢复`。如果只能观测最终结果而不能证明中间事件，标记为“不充分证据”，不得判 PASS。

本轮测试设计不启动 GUI、不调用真实模型、不改产品源码。测试夹具、CDP 控制器、Windows 输入驱动、模型 mock 服务和报告文件必须置于产品源码之外；本仓库本轮只允许新增本文件与 `qa/TRACEABILITY_MATRIX.md`。

### 1.1 优先级

- **P0**：核心安全或主链路；任一失败即阻断发布。P0 必须 100% 通过。
- **P1**：发布前必须执行；不得留下未解释的阻断、数据丢失、UI 几何缺陷或错误恢复缺陷。
- **P2**：回归和体验质量；失败需要记录风险、影响和后续版本安排。

### 1.2 自动化能力边界

| 层 | 自动化可证明 | 不能单独证明 |
|---|---|---|
| 静态/单测 | 语法、协议、错误码、加密存储接口、PowerShell 脚本不插值、CAS 参数、打包 staging 规则 | Windows 焦点、真实剪贴板、真实窗口层级、真实 DPI、真实模型服务 |
| 确定性 mock | 401/429/500、超时、JSON/字段变体、协议拒绝、取消竞态、回填保护 | 真实 TokenHub 连接、真实 Codex/Claude/微信编辑控件 |
| Electron + CDP | DOM 状态、IPC 事件的 renderer 侧结果、可见文字 Range、元素矩形、键盘焦点、截图 | Windows 低级 hook 是否收到硬件事件、main 内部未暴露事件；这些需要 Windows 过程监视和端到端结果共同证明 |
| 真实桌面 | 真实 Alt/点击/拖拽、窗口激活、SendInput、剪贴板并发、托盘、显示器和 EXE | 模型协议每个分支的穷举；须由 mock 层补齐 |
| 真实模型 | 已加密保存配置能完成一次实际非空返回、回填和恢复 | 不得把一次真实成功当作所有错误分支的证据 |

### 1.3 敏感数据和原文保护

- `<USER_KEY>`、Bearer 值、TokenHub 响应中的认证信息永远只在用户已配置的安全 UI/OS 加密存储中出现；不得写入源码、测试、命令行、环境变量、报告、截图、日志、Git 或模型 mock。
- 真实模型用例只读取当前 Windows 用户已经由 `safeStorage` 加密保存的配置：打开设置时 Key 输入框保持空白，`getModelConfig` 只允许出现 `apiKeySaved`/`storageAvailable` 等布尔状态，不允许把明文 Key 回传 renderer。禁止通过命令行参数、stdin、脚本常量或临时明文配置注入 Key。
- 测试数据使用 `<SRC_ZH>`, `<SRC_EN>`, `<SRC_MIXED>`, `<TARGET_ORIGINAL>`, `<MODEL_RESULT>` 等占位名；实际报告可写长度、SHA-256 和脱敏截图，不写敏感原文。真实模型 canary 只使用非敏感、可复现的合成文本。
- 每条失败路径都要独立读取目标输入框并与捕获原文做 NFC、换行归一化后的精确比较：未得到安全成功回填时必须仍为原文；用户二次编辑后不得恢复或覆盖新内容；真实成功后才允许验证结果，再以独立读取验证恢复原文。
- 任何出现 API Key、未脱敏个人文本、剪贴板内容或认证响应的证据均为安全失败，应立即删除该证据并重跑脱敏流程，不得把它作为“测试通过”证据。

## 2. 测试架构和执行顺序

### 2.1 测试阶段

1. **S0 静态与核心**：先执行 `node --check`、`npm run check`、`npm test`，再执行 core/platform 确定性夹具。无 GUI、无网络、无真实 Key。
2. **S1 mock 桌面**：使用外部 Electron/CDP 驱动和本地 HTTPS mock 模型服务，覆盖 renderer/main 状态、窗口几何、所有面板和错误分支。mock 只使用临时测试值，不能读取用户 Key。
3. **S2 Windows 实机**：在隔离测试账户/目标应用中验证真实剪贴板、Codex/Claude/微信/企微、双击 Alt、头像点击、托盘、拖动、DPI 和多显示器。先执行 P0 入口，再执行其余链路。
4. **S3 真实模型**：仅在 S0/S1/S2 的前置通过后，使用用户已经安全保存的配置；分别执行 `E-ALT-001` 与 `E-AVATAR-001`，两者都必须有真实非空模型返回、成功回填和恢复。
5. **S4 打包复验**：运行 `npm run package:win`，把 `release/Prompt Lift-win32-x64/Prompt Lift.exe` 复制到无 Node/npm 的干净目录/机器，重复启动、P0 入口、托盘、配置和几何验收。

### 2.2 目标窗口和控件矩阵

每个实机链路至少在下列目标中各选一个可用窗口；同一用例不得用“看起来像输入框”的静态文本替代真实编辑控件。

| 目标 | 控件/内容 | 必测点 |
|---|---|---|
| Codex Desktop | 多行 textarea 或 contenteditable、中文/代码 | 当前焦点、路径/代码、Ctrl+A/C/V、回填和恢复 |
| Claude Desktop | 多行编辑器、英文/混合文本 | 窗口标题校验、焦点切换、英文保真 |
| WeChat | 多行聊天输入框 | `chat-polish`、原意/称谓/承诺强度 |
| WeCom | 多行企业微信输入框 | `chat-polish`、中文长文本、直接发送前不自动发送 |
| 控件边界夹具 | 普通 textarea、contenteditable、含换行的编辑器 | HWND/PID、focusHandle、换行归一化、非正常控件拒绝 |

### 2.3 分辨率、DPI 和显示器矩阵

每个有界面或几何用例必须记录：显示器布局、工作区矩形、Windows 缩放、Chrome CSS viewport、`devicePixelRatio`、截图物理像素和应用窗口 bounds。

| 矩阵 ID | 主显示器/布局 | Windows 缩放 | 最低截图 |
|---|---|---:|---:|
| G1 | 1920×1080 单屏 | 100% | 1920×1080 |
| G2 | 1920×1080 单屏 | 125% | 2400×1350 或记录系统缩放后的物理尺寸 |
| G3 | 1366×768 单屏 | 100% | 1366×768 |
| G4 | 1366×768 单屏 | 150% | 2049×1152 或记录系统缩放后的物理尺寸 |
| G5 | 2560×1440 单屏 | 200% | 5120×2880 或系统可稳定截图的等价物 |
| G6 | 主屏 1920×1080 + 左侧 1600×900（负坐标） | 100% | 两屏全景及各屏截图 |
| G7 | 主屏 1920×1080 + 右侧 2560×1440 | 125%/150% 混合 | 两屏全景及各屏截图 |
| G8 | 显示器拔出/分辨率变更后重启 | 100% | 变更前后窗口 bounds 与截图 |

## 3. 机器可判定的 UI 几何验收

### 3.1 采样状态和元素集合

在每个状态 `S0–S15`（见 `TRACEABILITY_MATRIX.md`）和 G1–G8 矩阵采集 DOM、截图和 JSON。可见元素至少包括：`petCard`, `petAvatar`, `petAction`, `petHint`, `compactModeBadge`, `compactFeedback`, `compactCancelButton`, `resizeHandle`, `collapseButton`, `closeButton`, `statusMessage`, `sourceInfo`, `resultPanel`, `enhancedPrompt`, `cancelButton`, `restoreButton`, `copyButton`, `contextMenu` 的全部 menuitem、`settingsPanel` 全部 label/input/button、`modePanel` 全部 option/close、`stylePanel` 全部 option/close。

### 3.2 几何规则

外部 CDP 几何检查器按 CSS 像素执行，边界容差 `EPS=1`；任何超出均失败，除非在下方白名单中并记录原因。

1. 对每个可见交互元素 `r`，要求 `r.left >= -EPS`, `r.top >= -EPS`, `r.right <= viewport.width + EPS`, `r.bottom <= viewport.height + EPS`。
2. 对 `.floating-panel`, `#contextMenu`, `#resultPanel`, `.pet-card` 等容器，要求其矩形完全位于 `.pet-shell` 可见工作区；弹窗不能落到屏幕工作区外，不能被祖先 `overflow:hidden` 裁掉。
3. 对可见文字节点，用 `Range.getClientRects()` 取每一行矩形；每个文字矩形必须完全落在其内容容器内。非滚动容器要求 `scrollWidth <= clientWidth + EPS` 且 `scrollHeight <= clientHeight + EPS`；允许滚动的 `.floating-panel`/`#enhancedPrompt` 只允许内容超出，不能允许容器本身或当前可见行被裁切。
4. 交互矩形集合（button、input、textarea、`[role=menuitem]`, `[data-style]`, `[data-mode]`）之间不得有面积大于 `EPS²` 的交集；文字矩形与**其他**交互元素不得相交。按钮自身包含自己的标签文字属于“祖先包含”白名单，不算遮挡；不同按钮、按钮与标题/说明、输入框与 label 的相交不在白名单内。
5. 通过 `elementFromPoint(center)` 检查每个交互元素中心点命中自身或允许的子节点；被不可见覆盖层、透明空白层或错误 z-index 截获即失败。
6. `visibility`, `display`, `opacity` 和 `aria-hidden` 的组合必须与状态一致；隐藏面板不得参与几何或文字检查，临时测量时先把目标页设为可见，不能把祖先的 `visibility:hidden` 传给被测元素。
7. 记录每个失败的 selector、状态、视口、DOMRect、文字内容的脱敏摘要、重叠对、截图路径；禁止只写“看起来正常”。

### 3.3 几何例外白名单

仅允许以下明确、非交互、非文字的设计重叠/越界：

| 选择器/关系 | 允许范围 | 原因和限制 |
|---|---|---|
| `.pet-sprite` 内火焰/披风/头盔/四肢 | 插画子元素可互相重叠 | 纯装饰，不承载文字、点击和键盘焦点；不能越出 `petAvatar` 可命中区域 |
| `.pet-card::after` | expanded 状态向下 7px 的装饰角 | 非交互、无文字；不能覆盖面板或按钮，也不能把面板推离视口 |
| 交互元素与其自身 label 子节点 | 仅限祖先-后代包含 | 这是按钮/输入的正常文字，不得扩展为兄弟元素重叠 |
| 滚动容器内部未显示的长内容 | 只允许在滚动内容区域 | 当前可见文字仍须完整；滚动框和滚动条必须在视口内 |

任何其他例外都必须在报告中写出 selector、像素范围、产品理由、截图和责任人；没有解释的越界/重叠为 P0/P1 几何失败。

## 4. 用例清单

下面每一行都包含：优先级、前置和精确步骤、测试数据、期望及失败时原文保护、证据、自动化方式。`AUTO` 表示不需要真实桌面；`DESKTOP` 表示必须在真实 Windows/Electron；`MODEL` 表示真实模型，仅 `E-ALT-001`、`E-AVATAR-001`、`M-001` 的 S3 变体允许使用已加密配置，其他模型用例必须 mock。

### 4.1 静态、核心和安全契约（11）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| C-001 P0 | 在仓库根运行 `npm run check`；逐项保留 exit code。 | 当前源码；不传 Key。 | 所有列出的 JS 模块语法通过；静态失败阻断。无运行时原文。 | 命令摘要、版本、退出码。 | AUTO：Node `--check`。 |
| C-002 P0 | 在无网络和空配置环境运行 `npm test`；保存失败测试名称。 | 现有 `test/*`。 | 现有 core/platform/contract 测试全通过；不能把静态通过当 GUI 通过。 | 测试报告、测试总数、exit code。 | AUTO：Node test runner。 |
| C-003 P0 | 调用 `createCapturedPayload`、`normalizeCapturedPrompt`、`hasVisiblePromptText`；分别传 canonical `text`、legacy `original`、字符串、空白、零宽字符。 | `<SRC_ZH>`、空格/换行、`​﻿`。 | canonical 优先，legacy 可兼容，空/零宽拒绝；任何失败都不触发替换，原文状态保持空或已有原文。 | 断言结果（只记录长度/布尔值）。 | AUTO：现有 capturePayload 单测。 |
| C-004 P0 | 使用假的 `safeStorage` 和内存文件适配器执行 save→load；检查临时文件→rename 顺序和文件模式；扫描落盘字符串。 | `<USER_KEY>` 仅在测试进程内存，报告不输出。 | 磁盘不含明文 Key，成功加载只能在 OS 加密可用时返回；写失败不破坏旧文件；无 Key 不写入。 | 加密布尔值、文件模式、rename 记录、脱敏内容扫描。 | AUTO：modelConfigStore 单测。 |
| C-005 P0 | 以合法值 `enhance/chat-polish` 和 6 个 style 值 round-trip；再传属性名 `chatPolish`、未知值和空值。 | 模式值而非对象键名；6 个 style。 | 合法值持久化/重载；属性名和未知值拒绝；不因非法状态覆盖原配置。 | 返回码、重载状态、旧配置快照摘要。 | AUTO：core + IPC 夹具。 |
| C-006 P1 | 保存合法/越界/损坏窗口 bounds，检查原子写入、可见范围归一化、显示器变化后的 clamp。 | 负坐标、最小/最大尺寸、超界尺寸、损坏 JSON。 | 只保存合法 bounds；越界和损坏值回退安全默认；窗口不因旧数据落到不可见区。 | bounds JSON、工作区矩形、变更前后截图。 | AUTO core；DESKTOP S2。 |
| C-007 P0 | 检查 preload 暴露对象、所有 `prompt:*` channel、IPC 成功/错误 envelope；模拟 `TARGET_CONTENT_CHANGED` 等错误。 | 结构化错误码、details；无 Key。 | renderer 只得到命名 API；`code/details` 跨 invoke 保留；nodeIntegration=false、contextIsolation=true；原文保护错误可识别。 | preload API 白名单、错误 envelope、BrowserWindow webPreferences。 | AUTO 静态 + IPC 单测。 |
| C-008 P0 | 对 `runPowerShell`/bridge 注入包含引号、换行、PowerShell 片段的 prompt/target；检查 script 与 argv；检查目标 HWND/PID/focusHandle、CAS 和 `SendInput`。 | `$(...)`, 引号、`;`, `<SRC_ZH>`；假 HWND/PID。 | 用户值只经 JSON stdin；不进入脚本/命令参数；身份变化、过期目标和未确认回填均拒绝；不盲目恢复新内容。 | script 不包含用户值的断言、调用输入、错误码。 | AUTO：windowsBridge 单测/源审计；真实 SendInput 在 I-011。 |
| C-009 P0 | 用协议样本验证 source material 序列化、语言检测、mode/style 指令、immutable anchors、否定约束、reasoning 污染和截断拒绝。 | 中文、英文、中英、数字、日期、金额、URL、路径、代码、专名、`不要发送`。 | 只接受 protocol v2、同 mode/language、非空 result；缺数字/链接/路径/代码/否定约束或混入 analysis 均拒绝，原文不变。 | request body 脱敏快照、错误码、锚点集合摘要。 | AUTO：promptEnhancer fixtures。 |
| C-010 P1 | 在无 endpoint 时调用 local fallback；比较短文本、中文、英文和混合文本。 | `<SRC_ZH>`, `<SRC_EN>`, `<SRC_MIXED>`, `总结`。 | fallback 保留原文并生成对应语言的结构；不把简单请求无限扩写；仅作 core 回归，不能替代真实模型。 | 结果长度、段落标题、语言断言。 | AUTO：promptEnhancer 单测。 |
| C-011 P0 | 扫描源码、测试、脚本、默认日志字符串和打包 staging；执行错误路径，检查 stdout/stderr。 | 仅扫描敏感词模式和运行时脱敏标记；不使用真实 Key。 | 不出现硬编码 Key、Bearer、用户原文和测试密钥；错误只带稳定 code/message，不泄密。 | 扫描结果、脱敏后的日志。 | AUTO：静态 secret scan + mock run。 |

### 4.2 首次启动、配置、生命周期和可见性（11）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| L-001 P0 | 清空专用测试用户数据目录但不清理产品源码；启动开发版和打包版各一次；观察 10 秒。 | 无 Key、无旧 bounds。 | 首次启动只出现一个 compact 宠物和一个托盘图标；默认尺寸约 120×140；窗口在工作区内；无命令窗口/重复宠物。无原文。 | 首屏截图、窗口/进程/托盘计数、bounds。 | DESKTOP：Windows UIA/CDP。 |
| L-002 P1 | 右键→模型与 Key 配置；逐个聚焦 endpoint、model、Key、标题关键词；关闭再打开。 | 默认 URL/model；Key 为空；标题关键词为空。 | 默认值正确；Key 是 password；说明“加密保存”；关闭/重开不泄露 Key；空 Key 不导致模型调用。无原文。 | 设置面板截图、DOM 属性、UIA 焦点序列。 | DESKTOP + CDP。 |
| L-003 P0 | 在专用账户的设置面板交互输入用户自己的 Key；点击“检查并保存”；等待成功；再次打开设置。 | `<USER_KEY>` 只手工输入，不记录；合法 endpoint/model。 | 检查成功后保存 verified 配置；Key 输入框被清空、只显示已保存状态；模型可在后续留空 Key 使用。报告不得记录 Key。 | 脱敏截图、`apiKeySaved=true`、配置文件权限/无明文扫描。 | DESKTOP；mock 预演 + MODEL 前置。 |
| L-004 P0 | 先保存合法旧配置；改 endpoint 为不合法 `http://...` 或让 mock 返回 401；点击“检查并保存”；关闭重开面板。 | 旧配置摘要；失败配置不含真实 Key。 | 检查/保存失败；旧 endpoint/model/style/mode/Key 保存状态仍在；失败过程中原文不触碰。 | 前后脱敏配置摘要、错误码、截图。 | AUTO main/store；DESKTOP UI。 |
| L-005 P0 | 完成 L-003 后完全退出并重新打开同一用户；不再次输入 Key；调用 `getModelConfig` 对照设置。 | 已加密配置；Key 输入框留空。 | endpoint/model/style/mode 和 `apiKeySaved` 恢复；renderer 永不拿到明文；真实模型前置成立。无原文。 | 重启前后脱敏状态、磁盘权限、renderer API 返回白名单。 | DESKTOP + AUTO store；不调用模型。 |
| L-006 P1 | 打开风格面板，依次点击严格保真、标准、简洁、详细、专业、创意；每次关闭/重开。 | 6 个 `data-style` 值。 | 每个 option 有 active/aria-pressed；label、持久化和下一次请求一致；处理期间切换被拒绝或延后，不改变当前请求。原文不变。 | 每项截图、style 值、配置重载。 | DESKTOP + CDP。 |
| L-007 P0 | 打开模式面板，点击“提示词增强”；重开并点击“微信 / 企业微信润色”；重启复核。 | `enhance`, `chat-polish`。 | 两个入口都可达，active/label/compact badge 一致；`chat-polish` 不被保存成 `chatPolish`；下一次请求使用选中模式。原文不变。 | 面板/紧凑 badge 截图、IPC payload、重启状态。 | DESKTOP + AUTO mode contract。 |
| L-008 P1 | 右键→开机自启动，记录关闭→开启→重启→关闭；读取 Windows Login Item 设置。 | enabled true/false。 | 菜单 label 和系统登录项一致；只注册一次；关闭后不再启动；不能影响当前窗口或原文。 | UI 截图、`getLoginItemSettings` 脱敏结果。 | DESKTOP；Windows API/PowerShell 只读核验。 |
| L-009 P0 | 点击关闭按钮；确认窗口隐藏而不是退出；托盘单击、双击分别恢复；再次关闭后退出菜单；执行恢复后继续做一次入口测试。 | 无敏感原文；合成 canary。 | 关闭后托盘仍在；单击/双击都显示同一窗口；显式退出才结束；恢复后布局、模式、结果状态和双击 Alt/头像入口仍有效。 | 托盘/窗口进程时间线、截图、入口成功证据。 | DESKTOP；托盘 UIA + E-TRAY-001 联测。 |
| L-010 P0 | 启动实例 A；再次从不同快捷方式/命令启动实例 B；再发送 second-instance；检查所有窗口和托盘。 | 同一用户、同一产品。 | 只有一个 `BrowserWindow`、一个宠物和一个 hook；第二实例使既有窗口显示/聚焦，不创建重复 UI；原文不变。 | `BrowserWindow`/进程计数、窗口句柄、截图。 | DESKTOP + CDP/Win32。 |
| L-011 P0 | 在目标窗口已有输入时依次触发捕获、模型等待、应用错误；全程观察 Prompt Lift 窗口。 | mock 延迟 3s、401、正常 result。 | 捕获/模型期间助手保持可见，不被 main 隐藏；错误后仍可查看结果/复制；失败原文仍为 `<TARGET_ORIGINAL>`。 | 状态时间线截图、窗口 visible/bounds、目标前后文本。 | DESKTOP + mock model。 |

### 4.3 新增 P0 入口、compact 命中、hook 和托盘（8）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| **E-ALT-001 P0** | 1) 用已加密保存配置，Key 输入框保持空白；2) 外部目标聚焦并写入 `<ALT_SRC>`；3) 记录 renderer 初始 `data-state=idle`、目标 HWND/PID；4) 用 Windows `SendInput` 产生第一次 Alt down/up，再在 500ms 内产生第二次 Alt down/up；5) 记录 hook 事件/子进程输出（若不可观测则不得宣称已证明 hook）；6) 通过 CDP 记录 renderer `idle→loading→success/error`、`compactFeedback`；7) 通过独立 capture 读取目标，确认模型返回非空并已回填；8) 点击恢复原文并独立读取。 | `<ALT_SRC>` 含合成中文、数字、日期、路径和否定约束；真实模型只使用安全保存配置。 | **双击 Alt 单独必须成功**：第二次 key-up 触发 hook；main 发出 capture/loading，renderer 进入 loading；目标捕获正确；真实模型有非空 response；CAS 回填结果；恢复精确得到原文。任一中间事件、loading、真实返回、回填或恢复缺失即 FAIL；异常或取消时原文不变。 | hook 事件/进程监视记录、`prompt:status`/DOM 时间线、目标 HWND/PID、模型请求/响应仅保留非认证元数据、前后文本 hash、回填和恢复截图。 | DESKTOP + MODEL；`SendInput`/Win32 watcher + CDP。 |
| **E-AVATAR-001 P0** | 1) 重置目标为 `<AVATAR_SRC>`；2) 关闭并从托盘恢复，确认 compact；3) 采集 `petAvatar.getBoundingClientRect()` 和中心命中；4) 只左键点击头像中心一次，不点击 action card；5) 记录 renderer/main 的 capture/loading 证据；6) 观察真实模型非空返回和回填；7) 独立恢复原文。与 E-ALT-001 使用不同的独立运行记录。 | `<AVATAR_SRC>` 含中英混合、URL、金额；Key 仅来自已加密配置。 | **左键头像单独必须成功**：点击事件到 renderer；main 收到 capture；renderer 进入 loading；捕获目标、真实模型返回、回填、恢复完整。不能用 action card 或先手动展开代替；点击失败时原文不变。 | avatar rect、`elementFromPoint`、click/IPC/status 时间线、模型非空元数据、前后文本 hash、截图。 | DESKTOP + MODEL；CDP + UIA/Win32。 |
| **E-COMPACT-001 P0** | 在 compact idle/loading/success 三态，分别对头像可见部分的四角内缩点和中心做点击；对角外 1px、badge、resize handle 做命中测试；记录所有 pointer/click 事件。 | compact 120×140 及用户保存尺寸；不使用 action button。 | 可点击头像区域全部能到达 handler；badge/resize handle 不误触发处理；compact 的透明壳不拦截；命中点不出 viewport。失败时目标原文不变。 | 每个点的 rect、hit target、事件序列、截图。 | DESKTOP + CDP `elementFromPoint`/Win32 click。 |
| **E-DRAG-001 P0** | 1) 从头像按下后移动 `<5 CSS px>` 后释放；2) 重置后移动 `>=5 CSS px` 并结束；3) 对每次检查 click 是否被抑制、`api.moveBy` 是否调用、目标是否变化；4) 在 compact/loading/success 重复。 | 4px、5px、6px 位移；屏幕坐标和 CSS 坐标均记录。 | 小于阈值是点击（若一次处理已被明确触发）；达到阈值才拖动并抑制后续 click；拖动不触发增强，不丢状态；目标输入原文不被误改。 | pointerdown/move/up/click 时间线、move delta、suppression 时间窗、截图。 | DESKTOP + CDP/Win32。 |
| **E-HOOK-001 P0** | 启动应用并记录 `powershell.exe` hook 子进程；关闭/显式退出确认 stop；重新启动、托盘隐藏→恢复、系统睡眠/唤醒后分别检查注册；人为结束测试 hook 子进程后记录是否有可观测错误及重注册行为；不允许悄悄跳过。 | 每次只允许一个 hook；进程命令行不得含 Key。 | 初次注册一次；退出后无残留；重新启动/恢复后再次只注册一个且双击 Alt 可用；异常终止必须有明确错误或按产品契约重注册，不能出现“看似运行但入口失效”。 | 进程 PID/父子关系、启动/关闭时间、hook 输出/错误、一次 Alt canary 结果。 | DESKTOP；Win32 process watcher + E-ALT 联测。 |
| **E-FILTER-001 P0** | 目标输入保持 `<FILTER_SRC>`；分别发送 AltGr（Ctrl+右 Alt/`VK_RMENU`）组合、Alt+Tab、单次 Alt、Alt+非 Alt 键；记录是否产生 `DOUBLE_ALT`、loading、capture 或模型请求。 | AltGr、Alt+Tab、单 Alt、Alt+A/其他键。 | 只有规定的左 Alt 双击才触发；AltGr、Alt+Tab、单 Alt 和含其他键组合不触发处理，不抢走系统切换；目标原文不变，助手无 loading。 | 低级 hook 事件、前台窗口变化、DOM 状态、目标文本、网络请求计数。 | DESKTOP；真实键盘/Win32 + CDP。 |
| **E-TRAY-001 P0** | 1) compact 关闭→托盘单击恢复→执行 E-AVATAR 的头像链；2) 再关闭→托盘双击恢复→执行 E-ALT 的双击 Alt 链；3) 反向顺序重复一次；4) 每次都以独立目标文本和恢复动作结束。 | `<TRAY_AVATAR_SRC>`, `<TRAY_ALT_SRC>`；真实模型只读加密配置。 | 托盘恢复不丢 renderer/main 监听、hook、模式或加密配置；两条入口恢复后仍各自完成 loading、捕获、真实非空返回、回填和恢复；无重复宠物。 | 托盘/窗口/hook PID 时间线、两套入口全链路截图和文本 hash。 | DESKTOP + MODEL；复用 E-ALT/E-AVATAR 断言但独立记录。 |
| E-RESIZE-001 P1 | 在 compact 拖 resize handle 至最小、默认、最大和超出边界；展开后收起；切换显示器/分辨率并重启。 | 112×112、120×140、700×820、越界拖动。 | 尺寸被 clamp；top-right anchor 不让底部跳出；compact size 持久化；展开收起恢复原 compact 尺寸；无文字裁切/重叠，目标原文不变。 | bounds、localStorage 脱敏、G1–G8 截图/几何 JSON。 | DESKTOP + CDP/Win32。 |

### 4.4 输入、回填、恢复与并发（12）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| I-001 P1 | 正常产生结果后点击“复制”；修改系统剪贴板为用户新值；再次查看 Prompt Lift/目标。 | `<MODEL_RESULT>`、`<USER_CLIPBOARD_NEW>`。 | 复制结果准确；复制不会改变目标输入；后续 bridge 只在仍归 Prompt Lift 所有时恢复剪贴板，用户新值不被覆盖。 | 剪贴板前后所有权标记、结果长度、目标文本。 | AUTO bridge；DESKTOP UI。 |
| I-002 P0 | 使用延迟 mock 在 capture 等待、model 等待两个时机点击紧凑反馈取消/展开取消；再让迟到 response 到达。 | 3s response、requestId；`<TARGET_ORIGINAL>`。 | UI 回到 idle/cancelled；main abort；迟到结果不更新 UI、不 apply、不恢复；目标保持原文。 | requestId、abort、DOM 状态、目标文本。 | AUTO race harness；DESKTOP 一次实机。 |
| I-003 P0 | 正常回填后点击“恢复原文”；再尝试复制/恢复按钮；重启窗口后检查结果面板和原文状态。 | `<TARGET_ORIGINAL>`, `<MODEL_RESULT>`。 | 恢复使用 captured target + expected result，目标精确回原文；按钮 disabled/状态清晰；不会把空结果覆盖目标。 | 前后文本 hash、IPC expectedText、恢复截图。 | DESKTOP；bridge 独立读取。 |
| I-004 P0 | 对空字符串、空格、换行、零宽字符输入点击两种入口；再用 `MAX_PROMPT_LENGTH+1` 通过 preload/bridge。 | `""`, `" \n"`, `\u200B`, 1,000,001 字符。 | 不调用模型、不回填；显示 EMPTY_PROMPT/TEXT_TOO_LARGE；已有目标原文不变。 | 网络调用计数、错误码、目标文本。 | AUTO + DESKTOP。 |
| I-005 P1 | 用“AAAAA”作为完整内容和前后缀；用含 U+FFFD、`锟斤拷`、混合不可见字符的文本；执行 capture→mock enhance→apply→restore。 | `AAAAA`, `AAAAA-保留`, `�锟斤拷-中文`。 | AAAAA 不被当 sentinel/空结果；乱码按真实字符保留，不被静默修复/丢弃；成功后可恢复原文，失败不覆盖。 | 原始/结果/恢复的长度、Unicode code point 摘要、截图。 | AUTO + DESKTOP。 |
| I-006 P0 | 依次运行中文、英文、中英混合、100k/999,999 字符边界文本；UI 使用安全合成内容，core 另测 1,000,000。 | `<SRC_ZH>`, `<SRC_EN>`, `<SRC_MIXED>`, long fixture。 | 语言检测/输出语言符合源文；长文本不截断/卡死；超限明确拒绝；成功/失败均满足原文保护。 | 长度、语言、耗时、错误码、前后 hash。 | AUTO boundary + DESKTOP 代表样本。 |
| I-007 P0 | 在源文加入 URL、Windows 路径、数字、日期、金额、反引号代码、专名和否定约束；mock 逐项制造保留/丢失版本。 | `https://example.invalid/a?x=1`, `C:\work\app.js`, `2026-08-03`, `¥1300`, `` `npm test` ``, `不要发送`。 | 全部 anchor 和否定约束保留才允许 apply；任一缺失/被反转/加新事实则拒绝，原文不变。 | anchor 比对报告、结果 error code、目标文本。 | AUTO protocol + DESKTOP apply gate。 |
| I-008 P0 | 捕获后把焦点切到另一窗口、同应用另一控件和 Prompt Lift 自身；在 apply 前恢复/不恢复焦点分别执行。 | 两个 HWND/PID、不同 focusHandle。 | 只操作捕获的同 HWND/PID/控件；焦点不一致、目标不存在或标题不匹配时拒绝；不得覆盖当前新焦点内容。 | HWND/PID/focusHandle 时间线、错误码、各窗口文本。 | DESKTOP Win32 + CDP。 |
| I-009 P0 | 捕获 `<TARGET_ORIGINAL>` 后，在模型等待期间用户改为 `<USER_NEW_TEXT>`；让模型返回；再测试 apply、cancel、restore。 | 原文和新文本均非敏感；延迟 3s。 | compare-and-swap 失败；新文本完整保留；不调用盲目 restore；Prompt Lift 可保留结果供复制但不可覆盖目标。 | capture/apply expectedText、目标前后 hash、错误码。 | AUTO race + DESKTOP。 |
| I-010 P0 | 捕获/回填期间另一个程序写入剪贴板；分别在 sentinel、replacement、verification、restore 四个时点注入。 | `<USER_CLIPBOARD_NEW>`。 | sentinel 失败不得当成旧剪贴板；用户新剪贴板不被覆盖；Prompt Lift 只恢复仍等于自己写入值的剪贴板。目标原文/新文本保护不变。 | 剪贴板所有权时间线、bridge 调用、目标文本。 | AUTO bridge race + DESKTOP。 |
| I-011 P0 | 在 Codex/Claude/WeChat/WeCom 的 textarea、contenteditable、多行编辑器各执行一次；对非编辑控件执行一次；再切换到不同窗口验证隔离。 | `<SRC_ZH>`, `<SRC_EN>`, `<SRC_MIXED>`。 | 正常编辑控件可捕获/回填/恢复；非编辑控件给可行动错误；不得选择第一个同标题窗口或不同窗口的内容；不自动发送。 | 每控件 HWND/PID、不同窗口隔离记录、截图、目标文本、错误码。 | DESKTOP；UIA/Win32 + CDP。 |
| I-012 P0 | 对 API 401/429/500、超时、畸形 JSON、协议拒绝、取消、目标变化、回填未确认逐项运行；每项独立重置目标。 | `<TARGET_ORIGINAL>`；错误 fixture。 | 每个失败只显示可行动错误，原文保持 exact；结果若已生成只能复制，不能假报成功；无重复 apply/restore。 | 错误码→UI message 映射、目标 hash、网络计数。 | AUTO model/bridge + DESKTOP smoke。 |

### 4.5 模型、协议和兼容性（11）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| **M-001 P0** | 先用 mock 验证非流式 OpenAI-compatible `choices[0].message.content`；再在 S3 只读取 L-005 的加密配置，Key 输入框保持空白，分别由 E-ALT-001/E-AVATAR-001 完成真实返回。 | mock protocol v2；真实 canary 不含敏感信息。 | mock 验证 `stream:false`, URL、Bearer 仅在内存请求头；真实两条入口各有一次非空模型返回、apply、restore。报告不写认证头/Key。 | mock body 脱敏；两条真实链路响应元数据和前后 hash。 | AUTO mock；MODEL/ DESKTOP 真实入口。 |
| M-002 P0 | mock 返回 HTTP 401；从检查配置和增强两条 UI 路径各执行一次。 | 无效测试认证状态，不记录值。 | 分类 AUTH_ERROR；设置失败不覆盖旧配置；增强失败不回填、不泄露 Key。 | status、error code/message、旧配置摘要、目标文本。 | AUTO + DESKTOP mock。 |
| M-003 P1 | mock 返回 429，可带 Retry-After；点击增强并等待。 | 429 response。 | 分类 HTTP_ERROR/可行动重试提示；不自动重复造成多次覆盖；原文不变。 | 请求计数、错误映射、目标文本。 | AUTO + DESKTOP mock。 |
| M-004 P1 | mock 返回 500/503；检查和增强分别执行。 | 500、503。 | 错误可识别、无 Key/原文泄露；旧配置和目标原文保护。 | status、日志脱敏扫描、目标 hash。 | AUTO + DESKTOP mock。 |
| M-005 P0 | mock fetch 永不结束；设置短 timeout；另测点击取消和超时自然结束。 | `timeoutMs` 10–100ms；requestId。 | 超时得到 TIMEOUT，AbortSignal 被触发；取消得到 CANCELLED；迟到响应不 apply；原文不变。 | signal.aborted、request timeline、DOM 状态、目标 hash。 | AUTO race + DESKTOP mock。 |
| M-006 P0 | `response.json()` 抛 SyntaxError；再返回空 body/非 JSON SSE。 | 畸形 JSON、HTML、SSE。 | INVALID_JSON 或安全兼容错误；不把 reasoning/半截文本当结果；原文不变。 | 响应类别、错误码、目标文本、无敏感日志。 | AUTO + DESKTOP mock。 |
| M-007 P1 | 逐项返回 `{result}`, `{text}`, `{content}`, `output_text`, nested output content、OpenAI choices；再返回 `{status:"ok"}`。 | 合法 field variants + missing result。 | 允许的兼容字段可在协议要求满足时生成结果；缺字段为 MISSING_RESULT；不回填空/未知字段。 | fixture 名、解析结果长度、目标 hash。 | AUTO + DESKTOP mock。 |
| M-008 P1 | 先返回明确 `stream:false` 完整 JSON；再发送 `stream:true`/SSE chunk（含半个 JSON、reasoning chunk、最终 done）。 | non-stream 和 stream fixtures。 | 当前非流式契约稳定；若未实现流式，必须明确拒绝且不 partial apply，不得把“未支持”宣称兼容；若实现了流式，必须等完整 envelope 后一次 apply。 | request `stream`、chunk 解析轨迹、目标 hash。 | AUTO + DESKTOP mock；是否支持流式以结果为准。 |
| M-009 P0 | 返回 protocol 版本错误、mode 错、language 错、`needs_input`、analysis/<think>、finish_reason=length、fact loss、too long。 | 每种错误一个 fixture；包含 anchor 的源文。 | 对应稳定错误码；不显示 reasoning、不应用部分结果；原文完全不变。 | fixture→error matrix、结果面板状态、目标 hash。 | AUTO + DESKTOP mock。 |
| M-010 P1 | 返回空字符串、仅空白、`AAAAA`、U+FFFD/乱码、Markdown wrapper、`<final>` wrapper；包含/不包含 immutable anchors。 | empty/wrapper/Unicode fixtures。 | wrapper 仅在安全规则允许时清理；空/不可用/anchor 丢失拒绝；AAAAA 和乱码不误判为空；失败原文不变。 | 原始响应类别、清理后长度、错误码。 | AUTO + DESKTOP mock。 |
| M-011 P0 | 检查 endpoint 非 HTTPS、model 为空、Key 缺失、Key 存储不可用、写盘失败；读取 renderer 错误和日志。 | 非法 URL、空 model、无 Key；不填真实值。 | 配置错误在请求前阻断；保存失败保留旧配置；存储不可用只允许本次内存语义并明确警告；任何错误不得含 Key/源文。 | 错误码、旧配置摘要、日志 secret scan。 | AUTO + DESKTOP mock。 |

### 4.6 二级界面、键盘和几何（11）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| U-001 P0 | 在 compact 和 expanded 分别右键；逐个点击 context menu 的 result（有结果时）、mode、configure、style、check、startup、quit；每次从目标面板返回。 | 7 个 menu action；quit 最后在专用实例执行。 | 每个入口一次命中、只打开预期面板/动作；无菜单越界、遮挡、死层；quit 不误触发前六项；不影响原文。 | 每项 action→state 时间线、菜单全量截图、geometry JSON。 | DESKTOP + CDP/UIA。 |
| U-002 P0 | 设置面板逐项 Tab/点击 endpoint、model、Key、title pattern、说明、检查并保存、保存配置、关闭；测试长 URL/长 model。 | 合法/非法 URL、长文本、Key 留空。 | label 与输入绑定；按钮可达；长文本不溢出；失败保留旧配置；Key 清空/不回显。 | 全控件截图、焦点顺序、rect/文字报告。 | DESKTOP + CDP。 |
| U-003 P1 | 模式面板点击两个 option、关闭按钮、Escape、面板外点击；每种模式返回 compact。 | enhance/chat-polish。 | 两个 option 可见可选、active 正确；关闭返回原状态；无点击穿透；原文不变。 | 面板截图、ARIA、hit test、geometry。 | DESKTOP + CDP/键盘。 |
| U-004 P1 | 风格面板点击全部 6 个 option、关闭按钮、Escape、面板外点击；窄视口长说明。 | 6 styles。 | 每项文字完整、无重叠/截断；active/aria-pressed 正确；返回路径一致。 | 6×截图、文字 Range/rect、状态。 | DESKTOP + CDP/键盘。 |
| U-005 P0 | 有结果时打开 result menu；检查 textarea、取消、恢复原文、复制；分别在 loading/success/error/cancelled 状态点击。 | `<MODEL_RESULT>`, `<TARGET_ORIGINAL>`。 | disabled/启用态正确；结果 textarea 可读可复制；loading 不可误恢复；恢复后 result panel 状态清空且目标为原文。 | 每态截图、按钮 disabled、clipboard/target hash、geometry。 | DESKTOP + mock。 |
| U-006 P0 | compact idle→loading→success→error；检查 mode badge、feedback 文案、compact cancel、resize handle、头像和关闭/收起的可见性。 | 中文长错误、短错误、chat-polish label。 | feedback 不截断关键错误；cancel 只在可取消时显示；不覆盖头像命中区；状态回到 idle/expanded 的路径清晰。 | 4 态截图、文字 Range、hit test。 | DESKTOP + CDP。 |
| U-007 P0 | 仅使用键盘从 body Tab 遍历所有可操作元素；Enter/Space 激活；Escape 关闭面板；检查 focus-visible、role、aria-label、aria-pressed。 | 所有菜单/面板/按钮；无鼠标。 | 所有交互可达且顺序合理；不可见/disabled 元素不进入焦点；无焦点被遮挡；不因键盘操作覆盖原文。 | 焦点序列、ARIA snapshot、键盘录像/截图。 | DESKTOP + CDP/Accessibility tree。 |
| U-008 P0 | 在 G1–G8、compact/expanded、每个二级界面打开状态运行 3.2 的 oracle；收集所有 rect、Range、scroll 和 hit test。 | G1–G8；状态 S0–S15。 | 所有交互/面板/可见文字满足边界、裁切、重叠、命中规则；无白名单外例外。 | 每状态 JSON 几何报告、截图、矩阵汇总。 | DESKTOP + CDP 自动判定。 |
| U-009 P0 | 对长中文、英文 URL、错误消息、长 model/endpoint、结果 textarea 滚动；放大到 200%，窄屏打开设置/模式/风格。 | 长度边界与长错误 fixture。 | 文字不得被裁切，按钮文字/标签不得相撞；允许滚动的内容仍在滚动框内且当前行可见；无 ellipsis 覆盖可读性要求。 | Range rectangles、scrollHeight/Width、近景截图。 | DESKTOP + CDP。 |
| U-010 P0 | 在每个浮层打开时从按钮中心、面板内输入、面板外空白、关闭按钮中心执行 `elementFromPoint`；检查 z-index 和 pointer-events。 | context/settings/mode/style/result 全部。 | 目标控件命中自身；透明层不截获；面板不被 petCard/compact 壳遮挡；面板外点击正确关闭；原文不变。 | hit-test 表、computed style、截图。 | DESKTOP + CDP。 |
| U-011 P1 | 按状态表逐一进入/退出 S0–S15；每个二级界面至少一张全窗口截图和一张重点截图；逐条核对返回路径。 | 所有状态、成功/错误/取消分支。 | 无孤立状态、无返回死路；结果、错误、托盘恢复和收起不丢关键状态；截图/几何报告齐全。 | 状态覆盖清单、截图索引、transition log。 | DESKTOP + CDP/UIA。 |

### 4.7 打包、EXE 和发布安全（8）

| ID / 优先级 | 前置条件与精确步骤 | 测试数据 | 期望结果；失败时原文保护 | 证据 | 自动化方式 |
|---|---|---|---|---|---|
| P-001 P0 | 运行 `npm run package:win`；检查临时 staging、asar 和 release 目录；对照 package contract。 | 当前版本；不使用 Key。 | staging 只包含 `src` 和运行时 package metadata，不含 test、qa、Git、devDependencies 和历史；生成 x64 EXE。无原文。 | package log、文件清单、EXE PE/架构/版本信息。 | AUTO + Windows packaging。 |
| P-002 P0 | 将 EXE 复制到无 Node/npm 的干净目录/机器，移除开发 PATH，双击启动；从不同快捷方式启动第二次。 | 干净 Windows x64。 | EXE 可独立启动、无命令窗、单实例；首次窗口和托盘正常；失败不修改目标原文。 | clean-machine 进程/窗口/截图、hash。 | DESKTOP/PACKAGED。 |
| P-003 P0 | 在打包 EXE 中完成配置保存/失败不覆盖/关闭重开；检查 app-data 文件和 Key 输入框。 | 用户安全输入 `<USER_KEY>`；不记录。 | safeStorage 加密持久化、无明文、重启可复用；失败保留旧配置；报告不含 Key。 | 脱敏 config metadata、文件 ACL、重启截图。 | DESKTOP/PACKAGED；不把 Key 写入命令。 |
| P-004 P0 | 打包 EXE 连接 S1 mock 走一条完整 capture→model→apply→restore，再执行一条取消/错误路径；S3 另执行 E-ALT/E-AVATAR。 | mock result 和合成原文；S3 只读加密配置。 | 打包行为与开发版一致；成功/失败原文保护一致；真实入口要求仍分别满足。 | 开发/打包对比时间线、截图、目标 hash。 | DESKTOP + mock；MODEL real signoff。 |
| P-005 P0 | 打包版关闭→托盘单/双击；第二实例；退出菜单；重启后检查 hook。 | 专用用户。 | tray/single-instance/hook 生命周期无回归、无重复宠物；目标原文不变。 | 进程/PID/托盘/窗口记录。 | DESKTOP/PACKAGED。 |
| P-006 P1 | 打包版在 G1–G8 完成 compact、expanded、五个浮层和结果状态几何检查。 | G1–G8；S0–S15。 | 通过同一几何 oracle；截图物理分辨率和 CSS viewport 记录一致；无未解释越界/重叠。 | 全量截图、几何 JSON、EXE hash。 | DESKTOP + CDP。 |
| P-007 P0 | 对 release、asar 解包审计、进程命令行、stdout/stderr、renderer API、网络 trace 执行 secret scan；检查 CSP、导航和窗口打开策略。 | 关键字/regex；不提供真实 Key 给扫描器。 | 无硬编码 Key/原文/认证头；CSP、contextIsolation、nodeIntegration、导航拦截满足契约；原文/Key 不外泄。 | 扫描报告、CSP/BrowserWindow 配置摘要、脱敏 trace。 | AUTO static + DESKTOP runtime。 |
| P-008 P0 | 仅在所有 P0/P1 用例和几何报告齐全后，执行 `npm run check`, `npm test`, 打包版 smoke、E-ALT-001、E-AVATAR-001；生成发布签收清单。 | 版本号、EXE SHA-256、证据目录。 | DoD 全部满足；P0 100% PASS、P1 无阻断、真实模型两入口均成功回填/恢复、所有二级界面有截图/几何报告、无未解释重叠/越界。 | 最终 manifest、测试汇总、EXE hash、缺陷/风险清单。 | AUTO 汇总 + DESKTOP/MODEL gate。 |

## 5. 最终 DoD 和报告格式

只有同时满足以下条件才可以在真实执行报告中写“验收通过”：

1. C-001/C-002 通过，**P0 100% 通过**；P1 已执行且无未解决阻断，P2 风险有责任人和版本计划。
2. `E-ALT-001` 和 `E-AVATAR-001` 两条独立入口都证明事件到达 main/renderer、进入 loading、捕获目标、得到至少一次真实非空模型返回、完成回填并恢复原文；因此 DoD 至少包含一次真实模型成功响应与成功回填/恢复，不能用 mock 或另一入口替代。
3. 双击 Alt 只在规定 key-up 触发；hook 注册、停止、重注册/异常处理有进程证据；AltGr、Alt+Tab、单 Alt 和拖拽均不误触发；头像 compact 命中和拖拽抑制阈值有像素/事件证据；托盘单击/双击恢复后两入口仍有效。
4. 所有二级界面（context menu、settings、mode、style、result，以及 compact feedback/tray 恢复状态）每个有全窗口截图、重点截图和状态/几何报告；所有按钮、菜单项、输入框和弹窗无未解释越界、文字裁切、跨控件重叠或错误命中。
5. 每个错误、取消、目标变化、剪贴板并发、模型不兼容路径均证明原文未被覆盖；真实成功路径证明结果和恢复后的原文均精确匹配。
6. 完成**打包 EXE 复验**：x64 EXE 在无 Node/npm 的干净环境完成启动、单实例、托盘、配置、P0 入口和几何复验；release 与构建源的版本/hash manifest 一致；敏感信息扫描为零。

每条用例的最小报告字段：`id`, `priority`, `status`, `startedAt`, `environment`, `displayMatrix`, `entry`, `requestId`（可脱敏）, `targetHandle/PID`（可脱敏）, `modelMode`（mock/real，不写 Key）, `expectedTextHash`, `observedTextHash`, `states`, `screenshots`, `geometryReport`, `failureCode`, `originalProtection`, `notes`。当前文档仅定义字段，不包含任何执行结果。
