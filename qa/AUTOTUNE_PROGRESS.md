# Prompt Lift 自主调优记录

> 状态：持续进行，直到用户明确喊停。每轮均遵循“审计 → RED → GREEN → 全量验收 → 沉淀”。

## 第 1 轮：Windows 输入事务与高频反馈

- 修复捕获完成或失败时覆盖用户新剪贴板内容的问题：仅恢复仍由 Prompt Lift 持有的哨兵或本次捕获值。
- 修复连续左键优化时沿用上一轮文本作为 CAS 基线的问题：每次新捕获都重置为刚捕获的原文。
- 模式切换的紧凑反馈显示具体模式名，不再只提示笼统的“已完成”。
- 验收：
  - `npm test`：114/114。
  - 完整视觉与交互 QA：64 个快照、98 次点击、105 次手势、275 次 API 调用，几何与工作流错误均为 0。
  - Windows x64 打包通过。

## 第 2 轮：模型输出语言一致性

- 新增高置信度正文语种校验，阻止模型声明中文却输出完整英文、或声明英文却输出完整中文。
- 校验会忽略 URL、Windows 路径、代码块和行内代码；短句、中英产品名、API/SDK/CLI 等技术混排在证据不足时放行，避免误伤。
- 验收：
  - `npm test`：115/115。
  - `npm run check`：通过。
  - 模型核心模块：行覆盖率 85.16%，分支覆盖率 80.78%。
  - 真实 `deepseek-v4-flash` 协议调用：通过，直接结果、无元提示词泄漏。
  - 双 Alt 回归与 Windows x64 打包：通过。
  - EXE：`release/Prompt Lift-win32-x64/Prompt Lift.exe`
  - SHA-256：`34E78D4F067F678AC187E9A6BC57B13E28F0A6B5A265F333DCCF30D2006DEBE1`

## 第 3 轮：协议状态语义与发行卫生

- `status=unchanged` 现在要求 `result` 与源文逐字一致；任何改写、空白或标点变化都以 `MODEL_OUTPUT_STATUS_MISMATCH` 阻止回填。
- 中英文系统提示词同步明确 `ok`、`unchanged`、`needs_input` 的触发条件和正文合同。
- `.gitignore` 增加 `release-*/`，避免 7 个历史发行目录被误提交或误交付。
- 验收：116/116、真实模型协议、双 Alt 与 Windows x64 打包均通过。

## 第 4 轮：主进程可信替换事务

- 将仅保存 ID 的活跃集合升级为主进程 `replacementTransactions`：
  - token 绑定捕获时目标窗口、原文与可信 CAS 基线；
  - renderer 不再通过 apply/restore IPC 提交目标或 `expectedText`；
  - 每次确认应用后由主进程推进 CAS 基线，恢复只使用事务中保存的原文；
  - 新捕获、取消、恢复、失败会清理事务；
  - 15 分钟空闲过期、2 小时绝对过期，过期后要求重新读取输入框。
- 验收：
  - `npm test`：119/119。
  - 事务存储：行覆盖率 98.68%，分支覆盖率 100%。
  - 完整视觉与交互 QA：通过。
  - 真实 `deepseek-v4-flash` 协议、双 Alt、Windows x64 打包：通过。
  - EXE SHA-256：`3C930F5EB6A409A298B75E3F3ED0B97E5B4533AC58ADC2C45F497B50FA92A1BA`
  - app.asar SHA-256：`4E8C6924BB726DD92FB4662D64C2203AD2C5ADE787EFE84A062EC4616BB84663`
  - 便携 ZIP：`deliverables/Prompt-Lift-cycle-5-win32-x64.zip`
  - ZIP SHA-256：`548955B9083BF97912443E848C60B952AAACAA8D528390AD3FC110E74BE54079`

## 第 5 轮：post-package 发行面闸门

- 新增实际 app.asar 审计器，并在替换正式 `release/` 之前强制执行：
  - 归档文件集合必须等于 `package.json + 当前 src/`；
  - 禁止测试、QA、文档、历史 release、开发依赖、日志、source map、密钥材料与符号链接；
  - 归档元数据必须是精简运行时合同；
  - 每个归档源码必须与本次审阅的工作区源码 SHA-256 一致；
  - 高置信 secret-shaped 字面量会阻断，错误信息不回显疑似凭据。
- 增加四类 fixture：合法最小包、禁止路径与开发元数据、疑似密钥、源码漂移。
- 修复 `@electron/asar` 在 fixture 与 Electron packager 产物中使用不同 Windows 路径分隔符的问题；规则比较使用规范化路径，归档读取保留原始分隔符。
- 交付验收：
  - `npm test`：123/123。
  - 审计器：行覆盖率 92.22%，分支覆盖率 83.78%。
  - 真实 `deepseek-v4-flash` 协议与双 Alt：通过。
  - 实际发行面：17 个文件、16 个审阅源码、0 源码差异、0 secret finding。
  - 发行 EXE 隔离启动 3 秒保持运行，随后结束测试进程。
  - EXE SHA-256：`3C930F5EB6A409A298B75E3F3ED0B97E5B4533AC58ADC2C45F497B50FA92A1BA`
  - app.asar SHA-256：`4E8C6924BB726DD92FB4662D64C2203AD2C5ADE787EFE84A062EC4616BB84663`
