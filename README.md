# Prompt Lift

> Windows 与 macOS 上的 WorkBuddy 风格表达助手。聚焦当前输入框，用一个快捷键把模糊表达整理成清晰、可执行、可直接发送的文本。

[Windows x64](deliverables/Prompt-Lift-latest-win32-x64.zip) · [Mac Apple Silicon](deliverables/Prompt-Lift-latest-darwin-arm64.zip) · [Mac Intel](deliverables/Prompt-Lift-latest-darwin-x64.zip) · [SHA-256](deliverables/SHA256SUMS.txt)

![Prompt Lift 绿色骑士小精灵](src/renderer/assets/mascots/green-knight-pup.png)

## 它解决什么问题

很多时候，不是没有想法，而是还没把目标、上下文、判断标准和输出要求组织清楚。

Prompt Lift 常驻在桌面，不替你聊天，也不替你执行原任务。它只处理当前输入框中的整段文字，将其优化为一个更容易被人或 AI 正确理解的结果，然后由你决定预览、复制、应用、重试或恢复原文。

当前版本只保留 **WorkBuddy** 一套优化引擎。四个表达场景共用它的上下文理解方式，同时各自使用独立的场景规则。

## 为什么只保留 WorkBuddy

WorkBuddy 的优势不只是“文案写得更长”，而是能理解当前对话里的连续上下文。

例如输入：

> 其他agent给我提了这个建议，你评估下是否值得采纳？采纳后的结果是否会有提升

Prompt Lift 会保留“这个建议”对当前会话内容的指代，不会机械地要求你重新粘贴建议。优化后的请求会明确要求下游 Agent：

1. 先给出是否采纳的结论；
2. 说明预期收益或提升；
3. 评估实施成本、风险和兼容性；
4. 比较采纳前后的可能结果；
5. 区分已知事实、合理推断、建议和仍待验证的信息。

只有当缺失信息会实质改变任务对象、权限、承诺或交付物时，才应要求补充。

## 四个表达场景

| 场景 | 适合处理 | WorkBuddy 的优化重点 |
| --- | --- | --- |
| AI 提示词 | 发给 Codex、Claude 或其他 Agent 的任务 | 目标、上下文、约束、证据、决策标准和输出格式 |
| 向上沟通 | 发给负责人、管理者或跨团队伙伴的消息 | 结论、依据、影响、风险、选项和下一步 |
| 用户沟通 | 客服、运营、销售及日常对外表达 | 清晰、礼貌、责任边界、承诺边界和可执行下一步 |
| PPT 文案 | 当前输入框中的标题或正文 | 结论型标题、单页主张和最小必要信息层级 |

切换场景不会切换成另一套档位。所有场景始终使用 WorkBuddy。

## 快速开始

### 1. 下载对应版本

Windows x64：

下载 [Prompt-Lift-latest-win32-x64.zip](deliverables/Prompt-Lift-latest-win32-x64.zip)，将整个 ZIP 解压到有写入权限的目录。

运行：

```text
Prompt Lift-win32-x64/Prompt Lift.exe
```

这是包含 Electron 运行时的 Windows x64 便携包，不需要另外安装 Node.js。请保留解压后的完整目录，不能只复制其中的 EXE 单独运行。

macOS：

- M1、M2、M3、M4 等 Apple 芯片下载 [Apple Silicon arm64 版](deliverables/Prompt-Lift-latest-darwin-arm64.zip)；
- Intel 芯片下载 [Intel x64 版](deliverables/Prompt-Lift-latest-darwin-x64.zip)。

解压后将 `Prompt Lift.app` 拖入“应用程序”。当前 macOS 包尚未经过 Apple Developer ID 签名和公证；首次启动请右键应用并选择“打开”。若系统仍阻止启动，请前往“系统设置 → 隐私与安全性”选择“仍要打开”。

第一次读取输入框时，macOS 会要求辅助功能权限。请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Prompt Lift，否则应用不会模拟复制和粘贴。

### 2. 配置模型

第一次运行时，打开：

```text
我的 → 模型与 Key 配置
```

填写：

- HTTPS 模型接口地址；
- 模型名称；
- API Key。

点击“检查并保存”。API Key 通过 Electron `safeStorage` 使用当前系统账户的安全存储加密保存，不会写入源码、日志或发布包。

### 3. 优化当前输入框

1. 聚焦任意桌面应用中的文本输入框；
2. Windows 双击左 `Alt`；macOS 按 `⌘⇧P`；也可以单击桌面小精灵；
3. Prompt Lift 读取当前整段输入；
4. WorkBuddy 按所选表达场景生成一个结果；
5. 直接应用，或在审阅模式中查看差异后再决定。

默认快捷键可以在“我的 → 全局快捷键”中修改。

## 两种使用方式

### 快速应用

适合低风险、可随时恢复的日常表达。处理成功后直接回填目标输入框。

### 审阅后应用

先查看优化结果和差异，再选择：

- 应用编辑后的结果；
- 重新生成；
- 复制；
- 恢复原文；
- 放弃本次操作。

审阅结果尚未处理时，主操作会继续当前事务，不会悄悄发起另一轮生成。

## 安全边界

Prompt Lift 将输入框替换视为一次受保护的事务：

- 应用前重新核对目标窗口、进程、原始文本和操作令牌；
- 输入框内容已被其他操作修改时，拒绝盲目覆盖；
- 取消、失败或过期结果不会偷偷回填；
- 只在剪贴板仍由 Prompt Lift 持有时恢复旧内容，用户新复制的内容优先；
- 不把“待检查、待开发、待审计”改写成“已经完成”；
- 不把文件路径、链接或截图描述成已经访问过的证据；
- 任务已经明确时，不在结尾追加“是否需要我继续”等许可式追问；
- WorkBuddy 返回自然文本，但窗口校验、取消和恢复仍由本地安全链路负责。

Prompt Lift 是输入文本优化工具，不会自动发送消息，不会读取完整聊天历史，也不会自行打开仓库、文件、网页或整份 PPT。

## 系统提示词

在“我的 → 系统提示词”中，可以查看当前场景真正使用的 WorkBuddy 提示词。

每个场景支持一段有长度上限的自定义补充规则。补充规则按“场景 × WorkBuddy”独立保存，并以低优先级附加；它不能绕过安全协议，也不应虚构事实、扩大承诺或改变任务状态。

## PPT 文案场景的边界

PPT 文案场景只优化当前输入框中的整段标题或正文，适合将描述型内容整理成“结论型标题 + 单页主张 + 支持层级”。

它不会假装读取：

- 其他文本框；
- 图表；
- 演讲者备注；
- 页面布局；
- 整份演示文稿。

如果要处理整份 PPT，请先把需要优化的文字汇总到当前输入框。

## 桌面小精灵

内置三种形象：

- 可卡布犬；
- 透明绿色骑士小狗；
- CSS 绿色骑士。

紧凑状态下可以拖动小精灵移动窗口，也可以通过右上角缩放入口等比例调整大小。关闭按钮会隐藏到系统托盘，折叠按钮只恢复紧凑状态，不会清空当前结果。

## 本地开发

需要 Node.js 与 npm：

```powershell
npm install
npm start
```

常用检查：

```powershell
npm test
npm run check
npm run qa:prompt-loop
npm run qa:model-contract
npm run qa:double-alt
```

生成 Windows x64 便携包：

```powershell
npm run package:win
```

生成 macOS Apple Silicon 与 Intel 两个 ZIP：

```powershell
npm run package:mac
```

macOS 包可从 Windows 交叉构建，但 Apple 签名与公证必须在具备相应证书的 macOS 环境完成；当前仓库没有声称这两个 ZIP 已签名或已公证。

打包产物写入：

```text
release/Prompt Lift-win32-x64/
release-mac/Prompt Lift-darwin-arm64/
release-mac/Prompt Lift-darwin-x64/
```

GitHub 只跟踪三个当前平台 ZIP 和对应校验文件：

```text
deliverables/Prompt-Lift-latest-win32-x64.zip
deliverables/Prompt-Lift-latest-darwin-arm64.zip
deliverables/Prompt-Lift-latest-darwin-x64.zip
deliverables/SHA256SUMS.txt
```

ZIP 通过 Git LFS 管理。`release/`、`qa/evidence/`、解压运行时和历史发布包不会提交到仓库。

## 当前版本验收

当前 WorkBuddy-only 版本已通过：

- 343 项自动化测试；
- 24 轮提示词协议回归；
- 4 个表达场景 × 1 个 WorkBuddy 引擎的系统提示词矩阵；
- 真实生产模型的上下文指代与评估结构验证；
- 双击 `Alt` 的 Windows 监听和完整处理链路；
- 82 张 UI 状态截图、181 次可信点击和 193 次交互手势；
- 0 个 UI 几何缺陷、0 个工作流缺陷；
- 正式包文件清单、`app.asar` 内容和 Git LFS 下载校验。

macOS 双架构包还额外通过了：

- Apple Silicon `arm64` 与 Intel `x64` 主程序架构检查；
- `.app` 主程序和 Framework 可执行权限检查；
- macOS 抓取、替换、内容变更拦截和剪贴板恢复的行为测试；
- 辅助功能权限错误的可操作提示验证。

当前 Windows ZIP 的 SHA-256：

```text
FDC9C46960F49D7E9B2F56809AF177463AE5F81258ACE9589FFAE288B0370961
```

当前 macOS ZIP 的 SHA-256：

```text
DCE3534D301FAFDA0D2E3848D3C88BF14467EDBA4C4059F0EA20EB8F3A60DDFF  Apple Silicon arm64
992E5D8D354BF4BF74070845E68AF330BC68DB496AE7D599C49E532C2C6ECB5B  Intel x64
```

## 项目结构

```text
src/core/             WorkBuddy 提示词、场景规则、模型调用与安全协议
src/main.mjs          Electron 主进程、IPC、窗口与替换事务
src/renderer/         桌面小精灵、设置页和审阅界面
scripts/              打包、真实模型检查和 UI 验收脚本
test/                 单元测试与产品契约测试
deliverables/         最新 Windows/macOS ZIP 与 SHA-256
```

## 参与改进

欢迎提交 Issue 或 Pull Request。反馈提示词问题时，建议提供：

- 原始输入；
- 使用的表达场景；
- 实际优化结果；
- 你认为更合理的结果；
- 是否发生了不必要追问、事实变化或承诺升级。

请勿上传 API Key、真实客户隐私、公司机密或其他敏感业务内容。
