# Prompt Lift r6 验收报告

验收日期：2026-08-04

## 需求逐项签收

- [x] **工作模式与场景合并**：界面只保留“场景”作为表达对象入口；内部继续兼容既有模式值，避免破坏模型协议与用户配置。契约测试：`test/sceneAndShortcutUi.contract.test.mjs`。
- [x] **UI 可读性升级**：默认展开尺寸提升为 420×620，放大标题、正文、列表行高与点击区域；360×520 仍可滚动操作。全量视觉报告：`qa/UI_VISUAL_RESULTS.md`。
- [x] **拥挤与重叠防回归**：视觉 QA 会检测列表标题、说明、右侧状态的内容越界与互相覆盖。86 个状态截图均通过，几何缺陷 0、流程缺陷 0。
- [x] **自定义全局快捷键**：支持在“我的 → 全局快捷键”录制、保存和恢复默认快捷键；自定义组合要求至少两个修饰键与一个主按键。实现：`src/core/shortcutConfig.mjs`、`src/core/globalShortcutController.mjs`。
- [x] **快捷键冲突保护**：先注册新快捷键，再释放旧快捷键；注册冲突或保存失败时保留原快捷键。测试：`test/core/globalShortcutController.test.mjs`、`test/core/shortcutConfigStore.test.mjs`。
- [x] **默认路径兼容**：未自定义时继续使用“双击左 Alt”，Windows 低级键盘钩子与取消后重试链路均通过。
- [x] **审阅放弃时序修复**：完成态结果在异步收尾期间仍可安全放弃；可信点击必须真实命中目标控件，不能误点下层小精灵。测试：`test/rendererProductVision.contract.test.mjs`、`test/qaUiVisual.contract.test.mjs`。
- [x] **系统提示词与安全替换无回退**：20 轮提示词回归全部通过；真实模型检查未出现元提示词泄漏或虚构应用场景；CAS 替换、锚点保护和审阅链路测试保持通过。

## 自动化结果

- `npm test`：204/204 通过。
- `npm run check`：全部源码、预加载脚本、QA 与打包脚本通过语法检查。
- `node scripts/qa-ui-visual.mjs`：86 个状态，缺陷 0。
- `node scripts/qa-ui-visual.mjs --shortcut-only`：默认双击 Alt 的 capture → model → apply → terminal 链路通过。
- `npm run qa:prompt-loop`：20/20 轮通过。
- `npm run qa:model-contract`：真实模型契约通过。
- `npm run package:win`：打包表面审计通过，23 个运行时文件、22 个已审查源码文件、2/2 精灵哈希一致。

## 可运行产物

- EXE：`deliverables/Prompt-Lift-20260804-r6/Prompt Lift-win32-x64/Prompt Lift.exe`
- ZIP：`deliverables/Prompt-Lift-20260804-r6-win32-x64.zip`
- EXE SHA-256：`34370C62B03C0784352123D69EF2A5919B0C3AA4549455581CCD462941BC1458`
- ZIP SHA-256：`C16FCAB93E1E438A3569AC82051BDA37A129786AC35D1D5F646E06F69529352F`
- 独立启动冒烟测试：通过；主进程与渲染、GPU、网络子进程均从 r6 交付目录启动。

运行时请解压完整 ZIP，并保留 `Prompt Lift.exe` 旁边的全部文件。
