# AUTOTUNE MODEL 02：收紧 `unchanged` 状态语义

## 结论

本轮最高收益且可直接测试的问题是：协议接受 `status: "unchanged"`，却没有要求 `result` 与源文一致。模型可以把已经改写、甚至新增承诺的文本标记为“未修改”，客户端仍会把该结果当作正常改写返回。

这不是单纯的字段洁癖，而是状态与实际副作用不一致：

- `unchanged` 按产品合同表示“原文已满足要求，不应改写”；
- 运行时只校验状态值属于 `ok | unchanged`，随后对两者执行完全相同的结果返回路径；
- 调用方只拿到字符串，状态本身被丢弃，无法在回填前再次纠正；
- 对“向上沟通”和“用户沟通”等中风险 Recipe，错误结果可能新增原文没有的结论、批准请求或承诺，而现有锚点校验无法覆盖这些语义变化。

建议下一轮建立硬不变量：`status === "unchanged"` 时，清洗后的 `result` 必须与源文逐字相等；否则以稳定错误码拒绝，不回填。

## 候选项比较

| 候选 | 当前行为 | 用户影响 | 实现与误报风险 | 本轮判断 |
| --- | --- | --- | --- | --- |
| `unchanged` 与正文不一致 | 被接受并返回改写文本 | 状态掩盖真实改写，可直接回填 | 实现极低；逐字比较无语义误报 | **最高优先** |
| `needs_input` 的 `result` 非字符串 | 会被转为字符串或回退问题 | 澄清质量下降，但不会自动回填 | 低 | 后续收紧 |
| 额外 JSON 字段 | 被忽略 | 当前没有字段被执行，直接用户风险较低 | 极低，但可能影响模型兼容 | 后续随协议小版本处理 |
| `ok` 返回原文 | 被接受为成功 | 可能造成无效调用和错误指标 | 低 | 可与状态指标一起治理 |
| 未知 `finish_reason` | 有正文时可能继续校验 | 依赖供应商语义，需先建立兼容表 | 中 | 先观测 |

## 代码与合同证据

- 产品文档明确规定：原文已清楚时返回 `unchanged`，不得为了显得有工作量而改写：`docs/prompt-lift-product-vision.md:355,365`。
- 产品文档也明确记录当前缺口：尚未强制 `unchanged.result` 逐字等于原文：`docs/prompt-lift-product-vision.md:357`。
- 中英文系统提示词只列出状态枚举，没有解释三种状态的触发条件及 `unchanged` 的正文不变量：`src/core/promptEnhancer.mjs:612,658`。
- 解析器只检查状态是否属于 `ok | unchanged`：`src/core/promptEnhancer.mjs:423-430`。
- 两种状态随后共用同一清洗、语言、长度和锚点校验，最后直接返回 `result`：`src/core/promptEnhancer.mjs:432-457`。
- 现有测试覆盖 `needs_input`、非法状态、模式、语言、截断和事实锚点，但没有 `unchanged + changed result` 失败样例：`test/core/promptEnhancer.test.mjs:87-160,482-538`。

## 已复现的当前行为

源文：

```text
请把周报写清楚。
```

模型返回：

```json
{
  "protocol": "2.0",
  "mode": "upward-communication",
  "language": "zh",
  "status": "unchanged",
  "result": "结论：本周工作已完成，请批准下周继续推进。",
  "hiddenEvaluation": "extra field accepted"
}
```

只读 mock 调用实测结果：

```json
{
  "accepted": true,
  "source": "请把周报写清楚。",
  "result": "结论：本周工作已完成，请批准下周继续推进。",
  "changed": true
}
```

该输出通过当前版本、模式、语言、状态、长度和锚点校验。新增的“本周工作已完成”和“请批准”没有对应的不可变词法锚点，因此会作为成功结果返回。

## 建议的最小修复

### 1. 明确系统提示词语义

在中英文公共协议层补充状态定义，放在 JSON 输出格式之前：

```text
status=ok：result 是经过改写的最终文本。
status=unchanged：仅当原文已经满足当前 Recipe 时使用，result 必须逐字等于 sourceText。
status=needs_input：仅当缺少会实质改变事实、责任、承诺或输出对象的必要信息时使用，result 是一个最小必要澄清问题。
```

英文版本保持同样语义。Recipe 不应自行重新定义状态。

### 2. 在客户端建立硬校验

建议在 `sanitizeModelOutput` 之后、其余正文校验之前执行：

```js
if (envelope.status === 'unchanged' && result !== source) {
  throw createEnhancementError(
    'MODEL_OUTPUT_STATUS_MISMATCH',
    language,
    '模型把已改写内容错误标记为未修改，已阻止覆盖原文。',
    'The model marked changed text as unchanged, so the original input was not replaced.',
  );
}
```

选择逐字相等而不是 `trim`、空白归一化或语义相等，原因是：

- 状态名称就是“未修改”，任何空白、标点或正文变化都不应隐藏在该状态下；
- 原始输入的前后空白、换行或排版可能有用户意图；
- 如果模型确实做了有价值的格式调整，应使用 `status: "ok"`；
- 精确比较确定性强，测试成本低，不引入语言或语义模型误报。

### 3. 使用独立错误码

推荐新增 `MODEL_OUTPUT_STATUS_MISMATCH`，并与现有 `MODEL_OUTPUT_MODE_MISMATCH`、`MODEL_OUTPUT_LANGUAGE_MISMATCH` 一样归入协议错误。这样可区分：

- `INVALID_MODEL_OUTPUT`：缺字段、非法枚举、错误版本等结构错误；
- `MODEL_OUTPUT_STATUS_MISMATCH`：字段结构合法，但状态与正文事实不一致。

Renderer 可暂时沿用“模型结果未通过安全校验”的通用文案，但应把新错误码加入同一安全校验分支，避免落入未知错误。

## RED 测试设计

在 `test/core/promptEnhancer.test.mjs` 增加一个行为测试：

```js
test('model protocol rejects changed text declared as unchanged', async () => {
  const source = '请把周报写清楚。';

  await assert.rejects(
    enhancePrompt(source, {
      endpoint: 'https://tokenhub.tencentmaas.com/v1',
      model: 'deepseek-v4-flash',
      apiKey: 'secret-test-key',
      mode: PROMPT_MODES.upwardCommunication,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  protocol: PROMPT_PROTOCOL_VERSION,
                  mode: PROMPT_MODES.upwardCommunication,
                  language: 'zh',
                  status: 'unchanged',
                  result: '结论：本周工作已完成，请批准下周继续推进。',
                }),
              },
            }],
          };
        },
      }),
    }),
    (error) => error.code === 'MODEL_OUTPUT_STATUS_MISMATCH',
  );
});
```

当前实现会解析成功并返回改写后的字符串，因此该测试先红，能够精确锁定缺口。

配套 GREEN 回归样例：

1. `unchanged + result === source`：通过并返回原文。
2. `ok + result !== source`：继续按现有硬校验通过。
3. `ok + result === source`：当前保持兼容；后续如要治理无效调用，应另立指标，不在本修复中拒绝。
4. `unchanged + 仅标点或空白变化`：拒绝为 `MODEL_OUTPUT_STATUS_MISMATCH`。
5. 四个 Recipe 各跑一个精确 `unchanged` 样例。
6. 现有 `needs_input`、语言、模式、元提示、事实锚点和截断测试保持通过。
7. Renderer 的错误映射契约应断言新错误码仍显示通用安全校验文案。

## 其他审计观察

### `needs_input`

当前流程先验证协议、模式和语言，再把 `result` 清洗为最长 240 字的纯文本澄清问题，并通过 `MODEL_NEEDS_INPUT` 阻止自动回填，安全边界基本合理：`src/core/promptEnhancer.mjs:314-338,409-421`。但 `result` 缺失、对象或数组时仍可能退化为兜底问题；后续应在进入 `safeClarificationQuestion` 前要求原始 `result` 为非空字符串。

### 语言

语言标签在 `src/core/promptEnhancer.mjs:401-408` 校验，正文也已有高置信语言反向检测：`src/core/promptEnhancer.mjs:340-359,436-437`。短文本与技术词采取保守放行，符合降低误杀的原则。

### 输出格式

协议要求单个 JSON 对象，但当前不拒绝额外字段。由于额外字段没有被执行或透传到 UI，风险低于 `unchanged` 状态失真。建议未来随协议小版本引入精确字段白名单，并先用真实模型 canary 统计额外字段率。

### 错误代码

现有错误码已经区分响应层、模式、语言、截断、长度、锚点与信息不足。缺少的主要是“状态枚举合法但语义不一致”的专用码。新增该码比复用 `INVALID_MODEL_OUTPUT` 更利于自动调优统计，也与现有 `MODEL_OUTPUT_*_MISMATCH` 命名体系一致。

## 验收标准

- [x] 文档只读审计，不修改 `src/`、`test/` 或打包产物。
- [x] 明确指出一个最高收益问题，而不是罗列没有取舍的清单。
- [x] 问题可由当前代码和一次 mock 调用复现。
- [x] RED 用例在当前实现下必然失败，修复后有确定的 GREEN 条件。
- [x] 修复建议同时覆盖系统提示词语义、客户端硬校验和错误码。
- [x] 说明与 `needs_input`、语言、额外字段和边界情况的优先级关系。
