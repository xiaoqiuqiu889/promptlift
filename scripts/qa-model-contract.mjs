import path from 'node:path';

import { app, safeStorage } from 'electron';

import {
  enhancePrompt,
  PROMPT_MODES,
} from '../src/core/promptEnhancer.mjs';
import { createEncryptedModelConfigStore } from '../src/core/modelConfigStore.mjs';

const DIRECT_FEEDBACK_SOURCE = '请优化桌面宠物的拖动交互：当前拖动起来不够跟手、不够丝滑。请降低指针移动与窗口响应之间的延迟，减少卡顿和跳动，并保持结果可直接执行。';
const PRODUCT_FEEDBACK_SOURCE = [
  '1. 我没有开启审阅后应用，但生成后仍进入审阅界面',
  '2. 审阅状态缺少取消、恢复原文、重新生成、复制、应用',
  '3. 四种沟通模式需要使用不同的优化档位',
].join('\n') + '\nReturn one concise direct request with no explanation.';
const DECISIVE_PRODUCT_FEEDBACK_SOURCE = [
  '结论：当前设置中的工作模式与场景存在重复，建议合并保留一个。',
  '界面 UI 文字过小且拥挤，需要整体升级。',
  '下一步行动：优先处理 UI 升级并指定合并方案，同时明确自定义快捷键的技术实现范围。',
].join('\n') + '\n请保留建议语气，不要把建议改写为强制要求；只返回一份紧凑、可执行的直接请求。';
const META_OUTPUT = /请将以下(?:内容|文本|用户反馈).{0,32}(?:优化为|改写|润色|重写|增强)|待改写内容|本次改写要求|SOURCE_MATERIAL_JSON|系统提示词规范/iu;
const DIRECT_OUTPUT = /拖动|跟手|流畅|丝滑/iu;
const PRODUCT_SCOPE_OUTPUT = /审阅后应用/iu;
const REVIEW_ACTION_OUTPUT = /取消|放弃/iu;
const MODE_TIER_OUTPUT = /四种沟通模式|沟通模式.{0,24}优化档位/iu;
const FORBIDDEN_PRODUCT_CONTEXT = /Microsoft\s*Word|Word\s*审阅|第三方插件|版本差异|权限设置|模板问题/iu;
const PERMISSION_SEEKING_OUTPUT = /(?:是否|要不要|需不需要)(?:需要)?我.{0,24}(?:继续|开始|优先|进一步|处理|执行|修改|开发|优化|推进)|(?:would you like me to|should i|shall i|do you want me to)/iu;
const promptLiftUserDataPath = path.join(app.getPath('appData'), 'Prompt Lift');
app.setPath('userData', promptLiftUserDataPath);
let activeCase = 'configuration';

async function run() {
  await app.whenReady();
  const store = createEncryptedModelConfigStore({
    userDataPath: app.getPath('userData'),
    safeStorage,
  });
  const config = await store.load();
  if (!config.apiKeySaved || !config.apiKey) {
    throw Object.assign(new Error(
      `No usable saved API key is available (storageAvailable=${config.storageAvailable === true}, loadError=${config.loadError ?? 'none'}).`,
    ), {
      code: 'QA_MODEL_KEY_MISSING',
    });
  }

  const cases = [
    {
      name: 'direct-feedback',
      source: DIRECT_FEEDBACK_SOURCE,
      style: 'concise',
      validate(result) {
        return {
          directResult: DIRECT_OUTPUT.test(result),
          metaPromptLeak: META_OUTPUT.test(result),
        };
      },
    },
    {
      name: 'product-feedback-scope',
      source: PRODUCT_FEEDBACK_SOURCE,
      style: 'concise',
      validate(result) {
        return {
          productScopePreserved: PRODUCT_SCOPE_OUTPUT.test(result)
            && REVIEW_ACTION_OUTPUT.test(result)
            && MODE_TIER_OUTPUT.test(result),
          inventedProductContext: FORBIDDEN_PRODUCT_CONTEXT.test(result),
          metaPromptLeak: META_OUTPUT.test(result),
        };
      },
    },
    {
      name: 'decisive-product-feedback',
      source: DECISIVE_PRODUCT_FEEDBACK_SOURCE,
      style: 'professional',
      validate(result) {
        return {
          mergedModeAndScene: /工作模式/u.test(result) && /场景/u.test(result),
          uiUpgradePreserved: /UI|界面/u.test(result) && /升级|优化/u.test(result),
          shortcutScopePreserved: /快捷键/u.test(result) && /技术实现范围|实现范围/u.test(result),
          permissionSeeking: PERMISSION_SEEKING_OUTPUT.test(result),
          metaPromptLeak: META_OUTPUT.test(result),
        };
      },
    },
  ];
  const caseResults = [];
  for (const contractCase of cases) {
    activeCase = contractCase.name;
    const result = await enhancePrompt(contractCase.source, {
      endpoint: config.endpoint,
      model: config.model,
      apiKey: config.apiKey,
      style: contractCase.style,
      mode: PROMPT_MODES.enhance,
      useModel: true,
      timeoutMs: 45_000,
    });
    const checks = contractCase.validate(result);
    const failed = Object.entries(checks).some(([key, value]) => (
      key.startsWith('invented') || key.endsWith('Leak') || key === 'permissionSeeking'
        ? value
        : !value
    ));
    caseResults.push({
      name: contractCase.name,
      resultChars: result.length,
      ...checks,
    });
    if (failed) {
      throw Object.assign(new Error(
        `Model contract case failed: ${contractCase.name} ${JSON.stringify(checks)} resultChars=${result.length}.`,
      ), {
        code: 'QA_MODEL_CONTRACT_FAILED',
        qaCase: contractCase.name,
      });
    }
  }
  process.stdout.write(`${JSON.stringify({
    passed: true,
    model: config.model,
    endpoint: config.endpoint,
    cases: caseResults,
  })}\n`);
}

run()
  .then(() => app.exit(0))
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({
      passed: false,
      case: String(error?.qaCase ?? activeCase),
      code: String(error?.code ?? 'QA_MODEL_CONTRACT_FAILED'),
      message: String(error?.message ?? error),
    })}\n`);
    app.exit(1);
  });
