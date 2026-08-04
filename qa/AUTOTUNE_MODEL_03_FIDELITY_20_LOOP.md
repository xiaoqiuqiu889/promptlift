# 模型提示词校准：20 轮 looping engine 记录

## 运行方式

```text
npm run qa:prompt-loop
```

该循环使用本地 mock OpenAI-compatible 响应，只验证项目真实的输入构造、协议解析和结果校验，不读取 API Key，不访问外部模型服务，也不记录原始敏感文本。

## 结果

2026-08-04：20/20 轮通过，失败数 0。对可修复的范围错误和候选稿错误均验证了“最多一次纠错重试”；事实、长度、状态、模式和信息不足错误不执行覆盖。

同日真实模型契约检查通过：`direct-feedback` 与 `product-feedback-scope` 两个合成场景均通过直接性、范围、模式与档位检查；结果仅记录字符数和布尔校验。

| 轮次 | 场景 | 预期结果 | 实际结果 |
| ---: | --- | --- | --- |
| 01 | faithful 直接改写 | 成功 | 成功 |
| 02 | faithful 丢失邮箱、Issue ID、日期 | `MODEL_OUTPUT_FACT_LOSS` | 通过 |
| 03 | faithful 新增 Word 上下文 | `MODEL_OUTPUT_SCOPE_INVENTION` | 通过 |
| 04 | concise 新增移动用户群 | `MODEL_OUTPUT_SCOPE_INVENTION` | 通过 |
| 05 | professional 将 consider 升级为 must | `MODEL_OUTPUT_SEMANTIC_ESCALATION` | 通过 |
| 06 | professional 保留 may 不确定性 | 成功 | 成功 |
| 07 | creative 受控扩写 | 成功 | 成功 |
| 08 | creative 超过原文 350% | `MODEL_OUTPUT_TOO_LONG` | 通过 |
| 09 | creative 保留 URL 与 Windows 路径 | 成功 | 成功 |
| 10 | creative 丢失 URL | `MODEL_OUTPUT_FACT_LOSS` | 通过 |
| 11 | 向上沟通新增移动端平台 | `MODEL_OUTPUT_SCOPE_INVENTION` | 通过 |
| 12 | 向上沟通保留 may | 成功 | 成功 |
| 13 | 用户沟通新增保证性交付承诺 | `MODEL_OUTPUT_SEMANTIC_ESCALATION` | 通过 |
| 14 | 用户沟通礼貌润色且不新增承诺 | 成功 | 成功 |
| 15 | PPT 文案新增图表数据来源 | `MODEL_OUTPUT_SCOPE_INVENTION` | 通过 |
| 16 | `status=unchanged` 且逐字相同 | 成功 | 成功 |
| 17 | 修改后的文本误标 unchanged | `MODEL_OUTPUT_STATUS_MISMATCH` | 通过 |
| 18 | 返回错误 mode | `MODEL_OUTPUT_MODE_MISMATCH` | 通过 |
| 19 | 信息不足返回一个澄清问题 | `MODEL_NEEDS_INPUT` | 通过 |
| 20 | 非创意档位返回 Option A/B | `MODEL_OUTPUT_MULTIPLE_CANDIDATES` | 通过 |

## 本轮固化的回归闸门

- `RECIPE_SCHEMA_VERSION` 升级为 `1.2`，四个档位共享可审计的范围、长度、事实锚点和语义强度策略。
- creative 的结果长度在 `validateProtocolResult` 中按 `floor(source.length × 3.5)` 硬校验。
- 非创意档位的范围校验覆盖产品/平台、用户群、应用场景、部署环境和证据来源等常见扩散方式。
- 新增 `MODEL_OUTPUT_SEMANTIC_ESCALATION` 与 `MODEL_OUTPUT_MULTIPLE_CANDIDATES`，并在渲染层显示为安全失败，不触发原文覆盖。
- 模型输入明确“一次一个已配置模型、一个 source payload、一个最终 result”；纠错重试最多一次。
- 真实模型契约 canary 固定使用 `faithful` 档位验证稳定范围与直接性；creative 的 350% 硬上限由本地 looping engine 覆盖，避免短样本把 canary 变成长度压力测试。
