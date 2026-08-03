# Prompt Lift 持续调优：安全与可靠性审计 01

> 审计方式：只读代码审计 + 无落盘最小复现。
> 范围：operation token 生命周期、取消/恢复/重新生成竞态、剪贴板所有权、错误与日志隐私、Windows 打包内容。
> 结论：发现 1 个 P0 实际缺口；本轮未修改生产文件。

## 1. P0 缺口：捕获完成时可能覆盖用户刚复制的新剪贴板内容

### 1.1 现象

`capturePrompt()` 在开始捕获前保存旧剪贴板，写入哨兵并读取目标输入框文本；但 `finally` 无条件把捕获前的旧值写回剪贴板。

如果用户在 Prompt Lift 已读取目标文本、但 `finally` 恢复旧值之前复制了其他内容，Prompt Lift 会把用户的新内容覆盖掉。

这违反项目既有安全约束：

> Preserve user clipboard updates by restoring only clipboard values still owned by Prompt Lift.

### 1.2 代码证据

文件：`src/platform/windowsBridge.mjs`

- 第 786 行：保存 `previousClipboard`；
- 第 787–790 行：生成并写入 `captureSentinel`；
- 第 804 行：读取捕获文本；
- 第 817–820 行：`finally` 中无条件执行 `writeClipboard(clipboard, previousClipboard, timeoutMs)`。

捕获路径没有在恢复前读取当前剪贴板，也没有判断当前值是否仍是：

1. Prompt Lift 写入的哨兵；或
2. 本次 `Ctrl+C` 捕获到的目标文本。

对照同文件的替换路径：

- 第 889 行先读取 `currentClipboard`；
- 第 890–894 行计算 `bridgeOwnedClipboard`；
- 只有确认当前值仍属于本次操作时，第 895 行才恢复旧剪贴板。

因此所有权保护已经存在于 `replacePrompt()`，但没有复用于 `capturePrompt()`。

### 1.3 可复现证据

使用注入式 clipboard adapter 模拟以下时序：

```text
初始剪贴板 = "previous clipboard"
→ Prompt Lift 写入 capture sentinel
→ 目标输入框 Ctrl+C，捕获结果 = "target input"
→ 用户同时复制 "user copied this while capture was finishing"
→ capturePrompt finally 恢复旧值
```

本轮实际执行结果：

```json
{
  "captured": "target input",
  "finalClipboard": "previous clipboard"
}
```

期望结果：

```json
{
  "captured": "target input",
  "finalClipboard": "user copied this while capture was finishing"
}
```

该问题不影响已捕获文本，却会造成用户剪贴板数据丢失，属于高频入口上的非破坏性原则违约，定级 P0。

### 1.4 建议修复

在 `capturePrompt()` 中记录本次捕获文本，并在 `finally` 恢复前读取当前剪贴板：

```text
owned =
  currentClipboard 等于 captureSentinel
  或 currentClipboard 等于本次捕获文本

if owned:
  恢复 previousClipboard
else:
  保留用户当前剪贴板
```

比较时可复用替换路径的 `normalizeComparableText()`，兼容 CRLF、BOM、NBSP 等无害规范化。

需要保留现有失败语义：

- 捕获失败且当前剪贴板仍是哨兵时，恢复旧值；
- 捕获成功且当前剪贴板仍是目标文本时，恢复旧值；
- 捕获或恢复期间用户写入新值时，不覆盖新值；
- 若读取当前剪贴板失败，应保留主要捕获错误；不可用次级恢复错误掩盖主要错误。

注意：读取后到写回之间仍存在极小竞态窗口。Electron clipboard API 不提供原子 compare-and-swap；当前可行目标是把覆盖窗口缩小，并保证已观测到用户更新时绝不恢复。

### 1.5 建议测试

在 `test/platform/windowsBridge.test.mjs` 新增行为测试：

```js
test("capturePrompt preserves a user clipboard update made while capture is finishing", async () => {
  // 第一次 readText 返回捕获前旧值。
  // 第二次 readText 返回捕获文本，但 adapter 同时把内部当前值切成用户新值。
  // 所有权复核必须看到用户新值并跳过旧值恢复。
  // 断言 captured.text === target input。
  // 断言 clipboard.value === user copied value。
});
```

另增加三个邻接回归：

1. 当前剪贴板仍是捕获文本时，恢复捕获前旧值；
2. `Ctrl+C` 失败、当前仍是 sentinel 时，恢复旧值；
3. 捕获抛错且用户已更新剪贴板时，保留用户新值并继续抛主要捕获错误。

## 2. 其他审计项

### 2.1 operation token 生命周期

已确认的防护：

- 新捕获时 `activeReplacementOperations.clear()`；
- 新模型请求开始时清除旧 token，再注册新 `requestId`；
- 模型失败时删除 token；
- 重新生成前通过 `api.cancel(generationOperationId)` 失效旧 token；
- apply 要求 token 非空、未取消且仍在 active set；
- restore 成功后清空 active set；
- cancel 会 abort 模型并删除对应 replacement token；
- apply 与 restore 都把 `expectedText` 交给 Windows bridge 执行目标文本 CAS。

剩余风险：

- apply 成功后 token 会保留，以支持“快速回填后继续编辑并再次应用”；目前没有 TTL。新捕获、重新生成、恢复和显式取消均可使其失效，且 `expectedText` 仍阻止覆盖已变化文本，因此本轮不将其判定为独立 P0。
- 建议后续把 active set 升级为带创建时间、目标摘要和有限状态的 operation record，并增加超时失效测试。

### 2.2 取消、恢复与重新生成

- `handleRegenerate()` 会先取消旧 generation token，再生成新结果；
- `handleApplyEdited()` 使用最后实际应用文本或原文作为 `expectedText`，不会把 textarea 中未应用的内容误当目标现状；
- `handleRestore()` 使用 `appliedText` 做 CAS，目标已被用户编辑时会失败；
- apply 进行中 UI 禁止取消，避免 Windows 输入事务执行一半时假定已经中断。

本轮未发现能够绕过 CAS 的确定性路径。

### 2.3 错误与日志隐私

- `src` 中唯一运行时控制台日志是双 Alt listener 启动失败的错误摘要；
- 未发现打印原文、结果、Authorization header 或 API Key 的运行时代码；
- renderer 只展示正文，不写日志；
- API Key 仍由 `safeStorage` 加密保存，配置返回 renderer 的只有 `apiKeySaved` 状态。

残余建议：对 listener 的底层错误消息维持固定错误码/固定摘要，不直接透传未来可能含命令参数的异常。

### 2.4 Windows 打包内容

- `scripts/package-win.mjs` 只把 `src/` 与裁剪后的运行时 `package.json` 放入 staging；
- `scripts`、`test`、`qa`、`docs`、Git 历史和开发依赖不会进入应用 staging；
- 打包输出日志只包含生成的 EXE 路径。

本轮未发现原文、测试夹具或明文凭据被打包的证据。

残余建议：为最终 `app.asar` 增加内容白名单检查，验证实际归档内容等于预期运行时文件集合，而不只静态检查 staging 构造代码。

## 3. EFCC 逐条签收

- ✅ **activeReplacementOperations 生命周期**：已核对注册、清理、取消、apply、restore 和 regenerate 路径；已说明成功 apply 后保留 token 的用途与 TTL 残余风险。
- ✅ **取消/恢复/重新生成竞态**：已逐条核对 renderer 与 main 的 operation id、`expectedText` 和状态约束；未发现确定性 CAS 绕过。
- ❌ **剪贴板所有权**：捕获路径缺少所有权复核；最小复现证明用户并发更新会被旧值覆盖，证据充分，定级 P0。
- ✅ **错误/日志隐私**：已扫描运行时日志、正文、结果、Authorization 与 API Key 使用点；未发现正文或凭据日志泄露。
- ✅ **打包内容**：已核对 staging 来源和运行时文件集合；开发文件不进入 staging，实际 `app.asar` 白名单仍建议作为发布测试补充。
- ✅ **缺口可执行性**：已给出具体修复条件、失败语义和 4 条可自动化回归测试，没有依赖人工主观判断。

签收结论：本轮安全审计证据充分；在捕获路径完成剪贴板所有权修复并通过建议测试前，不应把“用户并发更新剪贴板永不被覆盖”标记为通过。
