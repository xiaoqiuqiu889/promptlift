# AUTOTUNE UX 01：左键连续使用会携带上一轮 CAS 期望值

## 审计结论

**本轮值得做：是。优先级：P0。**

最高价值缺口不是视觉样式，而是左键高频入口的第二次使用可能被上一轮状态误伤：

> 用户第一次自动回填成功后，直接在目标输入框里改成新内容，再左键点击桌宠。第二次操作已经成功读取新内容，最终仍可能因使用上一轮结果作为 `expectedText` 而触发 `TARGET_CONTENT_CHANGED`。

修复不增加任何用户步骤，只需调整 renderer 计算 CAS 期望文本的时机。它不放宽主进程的窗口、进程、原文或令牌校验。

## 审计范围

### 交互入口

| 入口 | 当前路径 | 本缺口是否影响 |
| --- | --- | --- |
| 左键桌宠 | `handleEnhance()` 内部发起 capture | **影响** |
| 双击 Alt | main capture → renderer `onCaptured` → `handleEnhance({ capturedSource })` | 不影响；进入增强前已接收新捕获 |
| 右键切模式 | 只变更默认 Recipe，不执行回填 | 不直接影响 |
| 托盘“一键处理” | main capture → renderer `onCaptured` | 不受本状态顺序影响 |
| 审阅后应用 | 使用当前 `originalText` 或 `appliedText` 做 CAS | 单轮路径正常 |
| 恢复原文 | 使用已确认的 `appliedText` 做 CAS | 当前实现正常 |

### 64 张视觉 QA 证据

审计目录：

`qa/evidence/ui/run-1785767164757-59168-scale-1/screenshots`

目录内共有 64 张 PNG，覆盖：

- `004` → `006`：一次左键的 idle → loading → success；
- `018`：生成结果、差异、编辑与应用控件；
- `020`：成功恢复；
- `022`：延迟应用完成；
- `024` → `045`：结果入口及四个工作模式；
- `046` → `060`：配置、风格、启动和关闭；
- `061` → `064`：拖动、覆盖命中与缩放失败证据。

这些证据证明首轮左键流程和单轮恢复路径可见，但没有覆盖“首轮成功 → 用户直接改写目标输入 → 第二次左键”的连续会话。因此 64 张截图均可通过，而本缺口仍然存在。

对应 QA 脚本也只在 `scripts/qa-ui-visual.mjs:1056-1065` 验证一次左键 capture/enhance/apply；`1159-1184` 验证查看结果、恢复和延迟应用，没有在不恢复的情况下修改外部目标并再次左键。

## 复现步骤

前置条件：

- 使用默认极速模式；
- 模型和 Windows bridge 可正常工作；
- 当前 Recipe 任意。

步骤：

1. 在外部输入框输入文本 A。
2. 左键点击桌宠。
3. 等待自动回填 A′，状态显示成功。
4. 不点击“恢复原文”，直接在外部输入框把内容改成文本 B。
5. 再次左键点击桌宠。
6. capture 成功读到 B，模型也成功生成 B′。
7. apply 阶段以 A′ 作为 `expectedText`，而目标输入框实际为 B。

预期：

- 第二轮以刚刚捕获的 B 作为 CAS 期望值，并安全回填 B′。

实际：

- bridge 正确拒绝 A′ ≠ B，第二轮报 `TARGET_CONTENT_CHANGED`；
- 用户会误以为刚才的编辑与工具冲突，尽管 B 已在本轮被重新捕获。

## 根因

根因位于 `src/renderer/renderer.mjs` 的状态读取顺序：

1. `handleEnhance` 在发起新 capture **之前**读取上一轮状态：
   - `renderer.mjs:727-729`：`expectedTargetText` 优先取旧的 `state.appliedText`；
2. 随后立即清空展示状态：
   - `renderer.mjs:736-737`：清除 `replacementConfirmed` 和 `appliedText`；
3. 左键路径直到后面才真正 capture：
   - `renderer.mjs:754`：`await captureSource()`；
4. `acceptCapturedPayload` 已把 B 保存为新的 `state.originalText`：
   - `renderer.mjs:618-624`；
5. apply 仍优先使用函数开头缓存的 A′：
   - `renderer.mjs:794`：`expectedTargetText || state.originalText`。

因此状态机实际形成：

```text
上一轮 appliedText=A′
→ 提前缓存 expectedTargetText=A′
→ 本轮捕获 originalText=B
→ 生成 B′
→ CAS(A′ → B′)
→ 正确但令人困惑地失败
```

双击 Alt 和托盘路径之所以不复现，是因为它们先由 main 捕获，再通过 `onCaptured` 调用 `acceptCapturedPayload`，然后才进入 `handleEnhance({ capturedSource })`。左键是唯一把 capture 放在 `handleEnhance` 内部的高频入口。

## 最小改法

不要取消 CAS，也不要在失败后盲目重试。只修正“本轮 CAS 基线”的来源。

建议：

1. 在进入函数时保留上一轮目标值，仅供“重新生成”这种不重新 capture 的路径使用；
2. 若本轮执行了 fresh capture，则在 capture 完成后强制以新 `state.originalText` 作为 `expectedTargetText`；
3. 若传入 `capturedSource`：
   - 双击 Alt/托盘：使用已经被 `acceptCapturedPayload` 接纳的 `state.originalText`；
   - 重新生成：使用调用前保存的 `appliedText`，目标未重新捕获时仍能正确 CAS；
4. apply 继续提交 HWND、PID、`expectedText` 和 `operationId`，主进程安全策略不变。

推荐的最小结构：

```js
const previousTargetText = state.replacementConfirmed
  ? state.appliedText
  : state.originalText;
const performsFreshCapture = capturedSource === undefined;

// 清理展示状态、设置 loading

const sourceText = capturedSource?.text ?? await captureSource();
const expectedTargetText = performsFreshCapture
  ? state.originalText
  : previousTargetText || state.originalText;
```

若希望进一步消除隐式分支，可让 `handleRegenerate` 显式传入 `expectedTargetText`；但这不是本轮最小修复所必需。

## 验收测试

### 必须新增

1. **连续左键回归**
   - 第一次 capture 返回 A，apply 记录 `expectedText=A`；
   - 第一次成功后，把 mock 外部输入改成 B；
   - 第二次左键重新 capture；
   - 断言第二次 apply 的 `expectedText === B`，不是 A′。

2. **重新生成不回退**
   - 首轮已回填 A′；
   - 点击“重新生成”，目标输入框仍为 A′；
   - 断言新结果 apply 的 `expectedText === A′`。

3. **双击 Alt 不回退**
   - 发送 `loading → captured(B, autoEnhance=true)`；
   - 断言 apply 使用 B；
   - 保留 cancel → retry 的现有终态测试。

4. **目标真实变化仍被拒绝**
   - 本轮 capture B 后，在 apply 前把目标改成 C；
   - 仍必须返回 `TARGET_CONTENT_CHANGED`；
   - 不允许用自动重捕获或盲目覆盖让测试转绿。

### 视觉 QA 补点

不需要为修复增加新控件或改变布局。可在脚本中加入连续操作记录，不必增加截图数量：

```text
首次左键成功
→ mock 外部输入改为 B
→ 第二次左键
→ 记录第二次 capture/apply 参数与 success 终态
```

### 回归命令

```powershell
node --test test/desktopAssistant.contract.test.mjs
npm test
npm run check
```

真实 Windows 验收还需在普通输入框执行一次上述连续左键步骤，确认第二轮成功且原文保护仍生效。

## 本轮取舍

**建议本轮立即修。**

理由：

- 命中最高频入口；
- 用户无需学习新概念，也不增加一步；
- 失败发生在模型已经完成之后，等待成本高、挫败感强；
- 最小修复只改变 CAS 基线的取值时机，不降低安全等级；
- 当前 64 张视觉证据和静态契约都没有覆盖连续会话，补测收益明确。

本轮不同时调整托盘菜单、右键模式文案或结果区布局，避免把一个状态机修复扩展为多项交互改版。
