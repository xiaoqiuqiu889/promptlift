import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROMPT_PROTOCOL_VERSION,
  buildModelInstruction,
  enhancePrompt,
  MODEL_STYLES,
  PROMPT_MODES,
} from '../../src/core/promptEnhancer.mjs';

const AUDIT_SOURCE = [
  'https://github.com/xiaoqiuqiu889/promptlift/tree/codex/prompt-tier-mascots',
  '你审计一下这个工程仓库，从 prompt engine 角度（提示词写作、测评等维度）、界面 UIUX 角度（参考微信 like 的简约应用风格及交互便利度上），给出一份完整的审计报告。',
  '拆分具体的优化点及优先级。',
].join('\n');

const FALSE_AUDIT_ANSWER = [
  '【结论】已对仓库 https://github.com/xiaoqiuqiu889/promptlift/tree/codex/prompt-tier-mascots 完成初步审计，发现若干可优化点，需进一步确认范围与优先级。',
  '【现状】当前仓库的提示词写作与测评机制尚未明确，缺少测评标准、用例集或自动化验证流程。',
  '【证据】当前界面风格与微信类简约应用有差距，交互便利度可提升。',
  '【需决策事项】项目当前阶段目标是什么？是否并行推进？',
].join('\n');

const EXPECTED_AUDIT_PROMPT = [
  '请审计以下工程仓库：',
  'https://github.com/xiaoqiuqiu889/promptlift/tree/codex/prompt-tier-mascots',
  '',
  '从两个维度检查实际代码、配置、测试与界面证据：',
  '1. Prompt Engine：系统提示词设计、场景与档位差异、事实与语义保护、badcase 修复机制、测试用例及自动化测评。',
  '2. UI/UX：参照微信-like 的简约风格，评估信息层级、字体与间距、状态反馈、操作路径和交互便利度。',
  '',
  '输出一份完整审计报告。每个问题都需标明代码或界面证据、影响、可执行优化方案和 P0/P1/P2 优先级；未实际验证的内容不得写成既定事实。',
].join('\n');

const MODES = Object.values(PROMPT_MODES);
const STYLES = Object.values(MODEL_STYLES);

function completion(mode, result, status = 'ok') {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              protocol: PROMPT_PROTOCOL_VERSION,
              mode,
              language: 'zh',
              status,
              result,
            }),
          },
        }],
      };
    },
  };
}

function modelOptions(mode, style, fetchImpl) {
  return {
    endpoint: 'https://tokenhub.tencentmaas.com/v1',
    model: 'deepseek-v4-flash',
    apiKey: 'secret-test-key',
    mode,
    style,
    fetchImpl,
  };
}

test('all sixteen scene-tier prompts preserve pending task state and treat links as anchors, not evidence', () => {
  for (const mode of MODES) {
    for (const style of STYLES) {
      const chinese = buildModelInstruction('zh', style, mode);
      const english = buildModelInstruction('en', style, mode);

      assert.match(chinese, /事实状态闸门/u, `${mode}:${style} missing fact-state gate`);
      assert.match(chinese, /待执行任务.*保持.*未完成/su);
      assert.match(chinese, /链接.*事实锚点.*不代表.*访问|链接.*不是.*证据/su);
      assert.match(chinese, /不得.*声称.*已(?:完成|审计|检查|读取|访问)/su);

      assert.match(english, /fact-state gate/iu);
      assert.match(english, /pending task.*remain pending/isu);
      assert.match(english, /link.*factual anchor.*not.*access|link.*not evidence/isu);
      assert.match(english, /must not claim.*(?:completed|audited|inspected|read|visited)/isu);
    }
  }
});

test('repository audit badcase is repaired from a fabricated report into an executable audit request', async () => {
  const calls = [];
  const responses = [FALSE_AUDIT_ANSWER, EXPECTED_AUDIT_PROMPT];

  const result = await enhancePrompt(AUDIT_SOURCE, modelOptions(
    PROMPT_MODES.enhance,
    MODEL_STYLES.professional,
    async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return completion(PROMPT_MODES.enhance, responses[calls.length - 1]);
    },
  ));

  assert.equal(result, EXPECTED_AUDIT_PROMPT);
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages[0].content, /事实状态|伪造|已完成审计|链接.*证据/su);
});

test('every scene-tier rejects a repeated fabricated execution claim', async () => {
  for (const mode of MODES) {
    for (const style of STYLES) {
      let calls = 0;
      await assert.rejects(
        enhancePrompt(AUDIT_SOURCE, modelOptions(mode, style, async () => {
          calls += 1;
          return completion(mode, FALSE_AUDIT_ANSWER);
        })),
        (error) => error.code === 'MODEL_OUTPUT_FALSE_EXECUTION_CLAIM',
        `${mode}:${style} must reject fabricated completion and findings`,
      );
      assert.equal(calls, 2, `${mode}:${style} must perform one bounded repair`);
    }
  }
});

test('clear executable audit requests cannot gain non-blocking decision questions', async () => {
  const invalid = [
    EXPECTED_AUDIT_PROMPT,
    '',
    '【需决策事项】请确认项目阶段、资源规模，以及是否先做 Prompt Engine。',
  ].join('\n');
  let calls = 0;

  await assert.rejects(
    enhancePrompt(AUDIT_SOURCE, modelOptions(
      PROMPT_MODES.enhance,
      MODEL_STYLES.professional,
      async () => {
        calls += 1;
        return completion(PROMPT_MODES.enhance, invalid);
      },
    )),
    (error) => error.code === 'MODEL_OUTPUT_UNNECESSARY_CLARIFICATION',
  );
  assert.equal(calls, 2);
});

test('a completion claim remains valid when the source explicitly states it', async () => {
  const source = '我已完成仓库审计，发现提示词回归用例不足。下一步建议补齐用例集。';
  const expected = '结论：仓库审计已完成，目前发现提示词回归用例不足。建议下一步补齐用例集。';

  assert.equal(
    await enhancePrompt(source, modelOptions(
      PROMPT_MODES.upwardCommunication,
      MODEL_STYLES.concise,
      async () => completion(PROMPT_MODES.upwardCommunication, expected),
    )),
    expected,
  );
});
