# AUTOTUNE MODEL 01：校验结果正文的真实语言

## 结论

本轮最高价值、可低风险落地的缺口是：协议当前只校验模型自报的 `language` 字段，没有校验 `result` 正文是否真的遵循源语言。

四个候选方向中，本项优先级最高：

| 候选 | 用户影响 | 最小实现难度 | 误报风险 | 本轮判断 |
| --- | --- | --- | --- | --- |
| 正文语言真实性 | 覆盖全部 Recipe；错误结果可直接回填 | 低 | 可通过高置信阈值控制 | 选择 |
| `unchanged` 语义 | 主要是协议严谨性 | 很低 | 很低 | 下一轮 |
| 拒绝额外字段 | 主要是协议收紧，用户收益较弱 | 很低 | 很低 | 后续 |
| 否定／承诺锚点 | 安全价值高 | 中高 | 同义改写易误报 | 先做评测再实现 |

## 证据

- 源语言由 `detectLanguage` 判定为 `zh` 或 `en`：`src/core/promptEnhancer.mjs:879-895`。
- 系统提示词要求跟随原文主要语言：`src/core/promptEnhancer.mjs:570-571,616-617`。
- 输出协议要求模型回传 `language`：`src/core/promptEnhancer.mjs:578,624`。
- 运行时只比较 `envelope.language !== language`：`src/core/promptEnhancer.mjs:368-375`。
- `result` 清洗后直接进入元提示、长度和事实锚点校验，没有正文语言校验：`src/core/promptEnhancer.mjs:399-423`。
- Recipe 注册表的四个动作都要求跟随原文语言：`src/core/recipeRegistry.mjs:35,52,72,89`。
- 现有测试覆盖语言标签和中英系统指令，但没有“标签正确、正文语言错误”的失败样例：`test/core/promptEnhancer.test.mjs:33-85,416-470`。

## 当前可通过的失败样例

源文：

```text
请帮我整理这段工作汇报，让结论更清晰。
```

模型返回：

```json
{
  "protocol": "2.0",
  "mode": "upward-communication",
  "language": "zh",
  "status": "ok",
  "result": "Please rewrite this work update with a clearer conclusion and next action."
}
```

该结果满足当前协议版本、模式、语言标签、状态、长度和事实锚点校验，因此会被接受；但正文与源语言明显不一致。

## 建议的最小实现

在 `sanitizeModelOutput` 和 `assertDirectRewriteResult` 之后、长度与事实锚点校验之前，增加保守的 `assertResultLanguage(result, source, language)`：

1. 复用 `detectLanguage` 的自然语言清洗规则，先移除代码围栏、URL、Windows 路径和行内代码。
2. 只在源文语言证据充足时启用拒绝：
   - 中文源文至少 4 个中文字符；
   - 英文源文至少 4 个拉丁词。
3. 只拒绝高置信反向结果：
   - 期望中文：结果少于 2 个中文字符，且至少 4 个拉丁词；
   - 期望英文：结果至少 4 个中文字符，且少于 2 个拉丁词。
4. 命中时继续使用现有 `MODEL_OUTPUT_LANGUAGE_MISMATCH`，避免增加 UI 错误分支。
5. 短文本、中英混合文本、技术词、代码、URL、路径和专有名词证据不足时放行；宁可漏检，不做激进误杀。
6. 不改变现有协议、锚点、长度、元提示和截断校验的执行结果。

建议伪代码：

```js
const sourceStats = naturalLanguageStats(source);
const resultStats = naturalLanguageStats(result);

const clearZhToEnMismatch = language === 'zh'
  && sourceStats.chinese >= 4
  && resultStats.chinese < 2
  && resultStats.latinWords >= 4;

const clearEnToZhMismatch = language === 'en'
  && sourceStats.latinWords >= 4
  && resultStats.chinese >= 4
  && resultStats.latinWords < 2;

if (clearZhToEnMismatch || clearEnToZhMismatch) {
  throw createEnhancementError(
    'MODEL_OUTPUT_LANGUAGE_MISMATCH',
    language,
    '模型结果正文没有跟随原文语言，已阻止覆盖原文。',
    'The rewritten text did not follow the source language.',
  );
}
```

## 测试清单

- 中文源文 + `language: "zh"` + 全英文正文：拒绝为 `MODEL_OUTPUT_LANGUAGE_MISMATCH`。
- 英文源文 + `language: "en"` + 全中文正文：拒绝为 `MODEL_OUTPUT_LANGUAGE_MISMATCH`。
- 中文源文包含 API、SDK、CLI 等技术词，结果仍以中文为主：通过。
- 英文源文包含中文产品名或人名，结果仍以英文为主：通过。
- 代码围栏、URL、Windows 路径和行内代码不参与自然语言比例：通过。
- 两三个字的短中文和两三个词的短英文：不因证据不足而拒绝。
- 四个 Recipe 各跑一个语言匹配成功样例，确认新校验不改变模式行为。
- 现有事实锚点、元提示修复、截断、`needs_input` 和取消测试全部保持通过。

## 风险与控制

- **中英混合误报**：不直接复用 `detectLanguage(result)` 做硬判断，只拒绝高置信完全反向结果。
- **PPT 标题很短**：源文和结果均设置最低证据量；短结果不判错。
- **技术文本英文占比高**：先移除代码、URL 和路径；中文源文不足 4 字时不启用拒绝。
- **漏检**：保守阈值会放过部分混合语言错误，但适合作为第一轮安全增量，后续用真实匿名计数调整阈值。
- **错误语义混淆**：沿用 `MODEL_OUTPUT_LANGUAGE_MISMATCH`，但错误文案应明确是“正文”不一致，不再只说模型自报标签错误。

## 后续顺序

1. 下一轮收紧 `unchanged`：只有 `result` 与源文逐字一致时才接受该状态。
2. 再评估严格 JSON 字段白名单；优先记录再拒绝，避免兼容模型突然失败。
3. 否定和承诺保护先建立金样集，覆盖“不要／请勿”“无法保证／预计”“必须／建议”等同义表达，再决定词法或语义校验方案。
