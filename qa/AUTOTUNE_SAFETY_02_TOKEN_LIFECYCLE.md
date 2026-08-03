# Prompt Lift 自动调优安全审计 02：Operation Token 生命周期

审计范围：`src/main.mjs`、`src/preload.mjs`、`src/renderer/renderer.mjs`、`src/platform/windowsBridge.mjs` 及相关契约测试。仅检查 operation token 的签发、复用、失效、内存占用和 CAS 事务；未记录原始用户文本、模型输出或凭据。

## 验收标准

- [x] 追踪 token 从创建、激活、成功复用到取消/失败/恢复/新捕获失效的完整路径。
- [x] 检查 token 是否绑定捕获目标、原文基线和最后一次成功应用文本。
- [x] 检查 token 是否有明确有效期，并覆盖超时后的拒绝行为。
- [x] 检查相关 `Set` / `Map` 是否可能无界增长。
- [x] 检查 CAS 是否由主进程持有可信基线，而非完全信任 renderer 参数。

## 🟠 高危（P1）—— token 未绑定事务，主进程信任 renderer 提供的目标和 CAS 基线

**位置**

- `src/main.mjs:53, 675-680`：`activeReplacementOperations` 只保存字符串 ID。
- `src/main.mjs:725-750`：应用时只检查 ID 是否活跃，随后直接采用 `input.target` 和 `input.expectedText`。
- `src/preload.mjs:287-295`：renderer 可同时提交 operation ID、目标窗口和 expected text。
- `src/platform/windowsBridge.mjs:852-903`：底层正确执行 HWND/PID 与文本 CAS，但其 expected text 仍来自上述不可信调用参数。

**影响**

operation token 当前只表达“这个字符串在集合里”，没有证明“它属于哪一个 HWND/PID、捕获了哪段原文、上次成功写入了什么”。因此 renderer 状态错误、被注入或未来出现 IPC 调用缺陷时，可在持有任一活跃 ID 后替换目标和 expected text；底层 CAS 会验证攻击者/错误调用自己声明的基线，而不是捕获时由主进程保存的可信基线。这不满足项目约束中的“同一 HWND/PID + 捕获原文 + live token”三者绑定。

`prompt:restore` 也没有 token，并完全接受 renderer 提交的 `text`、`target` 和 `expectedText`（`src/main.mjs:754-766`），属于同一事务可信边界缺口。

**可复现路径**

1. 正常捕获目标 A，并用请求 ID `T` 完成模型请求，使 `T` 进入活跃集合。
2. 在 renderer/测试桩中调用 `apply(replacement, targetB, { operationId: T, expectedText: currentTextOfB })`。
3. 主进程仅验证 `T` 活跃；若 B 的 HWND/PID 有效且文本等于调用方提交的 expected text，底层 CAS 会允许写入 B。

**最小修复**

- 将集合改为主进程持有的 `Map<operationId, transaction>`，transaction 至少包含：
  - `targetIdentity: { handle, processId, focusHandle? }`
  - `capturedOriginal`
  - `expectedText`（首次为捕获原文；每次成功应用后更新为主进程确认写入的文本）
  - `createdAt`、`lastAppliedAt`
- `prompt:apply` 不再信任 renderer 提交的 target/expected text；只接受 `operationId` 和 replacement text，并从 transaction 读取目标及当前基线。
- `prompt:restore` 必须要求同一 operation ID，并使用 transaction 中的 `capturedOriginal` 与 `expectedText`。
- 新捕获、取消、恢复、应用失败和过期均原子删除 transaction；应用成功仅更新可信基线，以保留“编辑后再次应用”能力。

**测试建议**

- 活跃 token + 不同 HWND/PID：拒绝且不调用 `replacePrompt`。
- 活跃 token + 伪造 expected text：拒绝且不调用 `replacePrompt`。
- 首次成功应用后，第二次应用只能以主进程保存的第一次结果作为 CAS 基线。
- restore 只能恢复同一 transaction 的原文，不能替换目标或恢复任意文本。

## 🟡 中危（P1）—— token 没有有效期，可在进程存活期间长期复用

**位置**

- `src/main.mjs:53, 679, 725-750`：活跃记录没有签发时间或 TTL。
- 成功应用后故意不删除 token，以支持“编辑后再次应用”；但也没有空闲过期或绝对过期。
- 只有新捕获成功、下一次 enhance、明确取消对应 ID、恢复成功或应用失败才会清理。

**影响**

用户将审阅结果留在界面数小时或数天后，旧 token 仍被视为 live。诚实路径仍受文本 CAS 保护，但目标文本若恰好保持/恢复到旧基线，旧操作仍可执行；与上面的事务未绑定问题组合后风险更高。窗口隐藏、捕获失败和模型结果成功后单纯闲置都不会使其过期。

**可复现路径**

1. 生成审阅结果但不恢复、不取消、不发起新捕获。
2. 任意等待后再次调用 `apply`，只要进程未重启且目标文本符合提交的 expected text，旧 ID 仍被接受。

**最小修复**

- transaction 增加较短的空闲 TTL 和有界绝对 TTL；每次成功应用只刷新空闲时间，不突破绝对上限。
- 在 `prompt:apply` 和 `prompt:restore` 的主进程入口先检查过期，再删除并返回 `REPLACEMENT_EXPIRED`。
- 窗口隐藏是否立即失效可作为产品策略；至少应用退出、目标重新捕获和明确取消必须失效。

**测试建议**

- 使用可注入时钟验证 TTL 前允许、TTL 后拒绝并清理。
- 过期 token 的 apply/restore 均不得调用 Windows bridge。
- 成功二次应用可以刷新空闲期，但不能绕过绝对有效期。

## 🟡 中危（P2）—— 取消只按调用方给出的 request ID 清理，无法可靠撤销已有 transaction

**位置**

- `src/main.mjs:769-780`：空或错误 request ID 只增加 `captureSequence`，不会清理 `activeReplacementOperations`。
- `src/renderer/renderer.mjs:1056-1077`：取消 loading 状态时发送 `state.requestId`；由主进程触发的捕获 loading 可能尚无 renderer request ID。

**影响**

在已有审阅 token 的情况下开始新的快捷键捕获，并在捕获完成前取消，旧 token 可能继续活跃。是否保留旧审阅结果可由产品决定，但当前主进程同时清空通用 `state`，生命周期语义不一致，容易形成“界面认为取消了，主进程凭证仍有效”的状态。

**最小修复**

- transaction 绑定 renderer/webContents 会话与当前捕获代次。
- 取消 IPC 明确区分 `cancelCapture` 与 `cancelTransaction`；如果产品语义是“取消当前处理”，主进程应撤销该会话的活跃 transaction，而不是依赖可缺失的 request ID。

**测试建议**

- 旧审阅结果 → 新捕获 loading → 无 request ID 取消：根据明确产品策略断言旧 transaction 被保留或失效；主进程与 renderer 必须一致。
- 错误/陌生 request ID 不应影响其他会话，也不能留下当前会话的半失效状态。

## ✅ 已确认安全 / 有界

- `activeReplacementOperations` 在每次 enhance 和成功捕获时会 `clear()`，正常 renderer 路径下最多保留一个 ID，不会无界增长。
- `cancelledRequestIds` 超过 64 条会淘汰最旧记录（`src/main.mjs:777-779`）。
- `activeModelRequests` 在请求 `finally` 中按 controller 身份删除，取消时也会 abort + delete；正常单请求 renderer 路径下有界。
- 应用失败会删除 operation ID，避免在 CAS 或回填错误后盲目重试。
- Windows bridge 会核验目标 HWND/PID、读取目标当前文本后再替换，并在写入后重新捕获确认；底层 CAS 实现是有效的。核心缺口是可信 transaction 数据没有在主进程与 token 绑定。

## 建议修复顺序

1. **先做 P1 事务绑定**：主进程 Map 持有目标、原文与滚动 CAS 基线；apply/restore 不再信任 renderer 的事务字段。
2. **同批加入 TTL**：用可注入时钟写确定性测试，避免之后迁移数据结构两次。
3. **最后统一取消语义**：区分捕获取消与 transaction 撤销，并补完整 Electron IPC 回归。

## EFCC 签收

- [x] 严重度、位置、影响、复现、最小修复与测试建议均已给出。
- [x] 同时记录了已确认安全的有界集合和底层 CAS，避免夸大风险。
- [x] 审计未修改生产文件，未记录原始用户文本、完整模型输出或密钥。
