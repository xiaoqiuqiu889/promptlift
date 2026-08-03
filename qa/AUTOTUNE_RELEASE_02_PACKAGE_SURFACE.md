# Prompt Lift Windows 发行包表面审计

- 审计对象：`release/Prompt Lift-win32-x64/resources/app.asar`
- 审计时间：2026-08-03（Asia/Shanghai）
- 审计性质：只读；未修改生产代码、打包配置或发行包
- app.asar SHA-256：`5D10C4E123B79853746491757EFB76CFD7C97E9C0F7C2B22417DD9C1B4DEC579`

## 结论

当前 `app.asar` 的发行表面是干净的：没有测试、QA、文档、历史 release、`.env`、日志、source map、开发依赖或明文密钥。归档仅包含精简后的 `package.json` 与 15 个运行时源码文件，且 15 个源码文件逐一与当前工作区内容哈希一致。

打包脚本采用“临时 staging 白名单”而不是从项目根目录排除文件：仅复制 `src/`，并移除 `scripts`、`devDependencies` 后写入 `package.json`。这使当前包不依赖一组容易漏项的 packager ignore 规则。主要缺口不在当前产物，而在交付闸门与仓库卫生：

1. 没有自动化的 post-package 归档表面断言，未来 staging 范围变化时无法自动阻断泄漏。
2. 工作区存在 7 个未被 `.gitignore` 覆盖的历史 `release-*` 目录，共 2,550,378,833 字节（2.375 GiB），可能被误提交或与正式发行包混淆。

## 审计范围与方法

### 检查范围

- 当前 Windows x64 包的 `resources/` 与 `app.asar` 实际文件清单。
- 归档内 `package.json` 的实际内容。
- 归档文本文件中的常见凭据特征：
  - PEM 私钥头；
  - `apiKey`、`secret`、`password`、`accessToken` 等带长字面量的赋值；
  - 明文 Bearer token；
  - `sk-` 风格 token。
- 打包脚本的 staging、metadata 精简、asar 与 prune 配置。
- 项目根目录历史 release 的 Git ignore 状态。
- 归档内源码与当前 `src/` 的逐文件 SHA-256 一致性。

### 判定限制

- 正则扫描只能证明未发现所检查形态的明文凭据，不能替代专用 secret scanner。
- `app.asar` 是归档而不是加密容器；其中的客户端源码和系统提示词应视为可被最终用户读取。
- 本审计不评价 Electron/Chromium 运行时 DLL 的 CVE、代码签名或安装器供应链。

## 实际文件证据

### 当前 resources

`release/Prompt Lift-win32-x64/resources/` 仅有：

| 文件 | 大小 |
| --- | ---: |
| `app.asar` | 217,206 bytes |

### app.asar 清单

归档共有 20 个路径节点，其中 16 个文件：

```text
package.json
src/core/capturePayload.mjs
src/core/ipcProtocol.mjs
src/core/modelConfigStore.mjs
src/core/operationDeadline.mjs
src/core/promptEnhancer.mjs
src/core/recipeRegistry.mjs
src/core/windowDrag.mjs
src/core/windowStateStore.mjs
src/main.mjs
src/platform/windowsAltShortcut.mjs
src/platform/windowsBridge.mjs
src/preload.mjs
src/renderer/index.html
src/renderer/renderer.mjs
src/renderer/styles.css
```

以下禁止类别均为 0：

- `test/`、`tests/`
- `qa/`
- `docs/`、`doc/`
- `release/`、`release-*`
- `dist/`、`coverage/`、`.git/`
- `.env`、`.env.*`
- `*.map`、`*.log`

归档内 15 个 `src/` 文件与当前工作区对应文件逐一计算 SHA-256，差异数为 0。

### 归档内 package.json

实际归档 metadata 只包含：

```json
{
  "name": "prompt-lift-desktop",
  "productName": "Prompt Lift",
  "version": "0.1.0",
  "description": "A lightweight prompt enhancer companion for Codex and Claude desktop apps.",
  "private": true,
  "type": "module",
  "main": "src/main.mjs"
}
```

确认不含：

- `scripts`
- `devDependencies`
- `dependencies`
- 测试、QA 或打包命令

### 打包规则证据

`scripts/package-win.mjs` 的关键行为：

- 第 12–14 行：在系统临时目录创建构建根并定义 staging/output 路径。
- 第 18–22 行：只把项目 `src/` 复制到 staging。
- 第 27–29 行：显式剥离 `scripts` 与 `devDependencies`。
- 第 41 行：packager 的 `dir` 指向 staging，而不是项目根目录。
- 第 48–49 行：`prune: false`、`asar: true`。
- 第 67 行：在 `finally` 中清理临时 staging。

没有设置 packager `ignore`，但当前设计不靠 ignore 保证边界：staging 本身就是正向白名单。`prune: false` 在 staging 没有 `node_modules`、归档 metadata 没有 dependencies 的现状下不会带入开发依赖。

### 凭据与配置证据

对当前 app.asar 内所有 `.mjs`、`.js`、`.json`、`.html`、`.css`、`.txt`、`.md` 文本执行上述凭据特征扫描，命中数为 0。

源码中存在正常的动态 API Key 处理与默认模型端点：

- API Key 由用户输入，并以运行时变量写入 `Authorization`。
- 持久化通过 Electron `safeStorage` 加密；归档中没有用户 `userData`。
- `https://tokenhub.tencentmaas.com/v1` 是公开服务端点，不是凭据。

## 风险排序

## 🔴 严重 / 🟠 高危

未发现。

## 🟡 中危

### M1：缺少 post-package 发行表面闸门

**现状**：`prepackage:win` 会运行单测、语法、真实模型协议与双 Alt 验收，但打包完成后没有检查实际 app.asar 清单或敏感字面量。当前 staging 白名单有效，但这是实现事实，不是被测试锁死的交付合同。

**风险场景**：后续为了加入资源、图标或依赖而扩大 `fs.cp` 范围，测试、`.env`、QA 证据或开发依赖进入 app.asar，功能测试仍可全部通过。

**最小修复**：

1. 新增只读 `scripts/qa-package-surface.mjs`。
2. 在 `package-win.mjs` 复制到正式 `release/` 之前，对临时产物的 app.asar 执行审计；失败则不发布。
3. 断言实际 package metadata 不含 `scripts`、`devDependencies`，并对路径 denylist、扩展名和 secret patterns 做失败封锁。

### M2：历史 release 目录未被 Git 忽略

**现状**：项目根目录存在 7 个 `release-*` 目录：

```text
release-alt-fix
release-double-alt-fix
release-drag-model-fix
release-hotfix
release-interaction-fix
release-latest
release-single-page
```

总大小为 2.375 GiB。`.gitignore` 第 3 行只覆盖 `release/`；`git check-ignore release-latest` 无结果，且 `git status --short` 将上述目录全部列为未跟踪。

**风险场景**：

- 误执行宽范围 `git add .`，将多个陈旧的可执行包提交或推送。
- 人工交付时从名称相近的历史目录选择错误版本。
- 二进制膨胀降低仓库审查与供应链溯源能力。

**最小修复**：

- 在 `.gitignore` 增加 `release-*/`；若历史包必须保留，移至项目外的版本化制品目录。
- 正式交付只认可 `release/Prompt Lift-win32-x64/`，并记录 EXE/app.asar SHA-256。

## 🟢 低风险 / 防御性建议

### L1：app.asar 中的客户端提示词与协议可被读取

**现状**：`promptEnhancer.mjs`、`recipeRegistry.mjs` 等客户端实现位于 app.asar。asar 不提供机密性，任何本地用户都能解包查看。

**判断**：这不是凭据泄漏；桌面客户端代码天然应按公开材料建模。但模型安全不能依赖系统提示词“藏在包里”。

**建议**：

- 继续把事实锚点、语言、JSON envelope、CAS 等本地验证作为安全边界。
- 不在客户端源码内加入秘密策略、私钥或不可公开的服务端凭据。

### L2：`prune: false` 是未来依赖变更的审计点

**现状**：当前 staging 不含 `node_modules`，因此没有实际泄漏。

**建议**：如果以后引入运行时 npm 依赖，应同时明确 staging 的依赖安装方式，并在归档表面测试中断言只包含生产依赖；不要单独依赖 `prune: false` 的当前偶然安全性。

## 建议的自动化验收

### 1. 实际归档 allowlist / denylist

对刚生成的 app.asar 使用 `@electron/asar` 的 `listPackage()`：

- 允许根路径只有 `package.json`、`src/`。
- 禁止任意路径段：
  - `test`、`tests`、`qa`、`docs`、`coverage`、`.git`、`release`、`dist`、`node_modules`。
- 禁止文件：
  - `.env*`、`*.log`、`*.map`、编辑器临时文件、私钥/证书私密材料。
- 归档内 `src/` 文件集合必须等于构建时批准的运行时清单。

仅使用 denylist 不足以防止新命名的敏感文件；应同时维护正向运行时清单或精确的资源 manifest。

### 2. package metadata 合同

提取归档 `package.json` 并断言：

- `main === "src/main.mjs"`；
- 不存在 `scripts`、`devDependencies`；
- 若存在 `dependencies`，每个依赖必须在生产依赖 allowlist 中；
- `name`、`productName`、`version` 与构建输入一致。

### 3. 凭据扫描

扫描“实际 app.asar 内容”而非只扫描源码目录：

- PEM 私钥；
- 高置信度 token 前缀；
- Bearer 字面量；
- 密钥字段与长字符串赋值；
- 可选接入 Gitleaks/TruffleHog，并维护明确的公开端点/测试占位符 allowlist。

错误报告只输出文件与规则名称，避免把疑似凭据完整打印到日志。

### 4. 源码一致性

对 staging 认可的每个源码文件：

- 比较归档内容与构建输入 SHA-256；
- 禁止归档缺文件或多文件；
- 输出 app.asar 与 EXE 的最终 SHA-256 到发行 manifest。

这能阻止“测试的是 A、交付的是 B”。

### 5. 负向测试

在系统临时目录构造假的 asar fixture，并确认审计脚本非零退出：

- 加入 `qa/evidence.json`；
- 加入 `.env`;
- 加入 `src/debug.log`；
- 加入假的 `Authorization: Bearer TEST_ONLY_NOT_A_REAL_SECRET_...`；
- 在 package metadata 加入 `devDependencies`。

fixture 必须使用显式测试占位符，不得写入真实凭据。测试完成后验证临时目录位于系统 Temp 且前缀正确，再清理。

### 6. Git 仓库卫生

在交付检查中断言：

```powershell
git check-ignore release
git check-ignore release-latest
```

两者都应被忽略；同时禁止除正式 `release/` 外的 `release-*` 目录出现在工作区，或将历史制品改由外部制品库管理。

## 已确认安全

- 当前 app.asar 没有测试、QA、文档、历史 release 或开发产物。
- 当前 app.asar 没有 `.env`、日志或 source map。
- 当前 app.asar 没有 `node_modules` 或开发依赖。
- 当前归档 package metadata 已移除 scripts 与 devDependencies。
- 当前 app.asar 的常见明文凭据特征扫描为 0 命中。
- API Key 不在发行包中，运行时持久化通过 `safeStorage`。
- 当前归档的 15 个运行时源码文件与工作区逐一哈希一致。
- 打包 staging 在 `finally` 中清理。
