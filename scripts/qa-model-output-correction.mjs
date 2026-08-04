import path from 'node:path';

import { app, safeStorage } from 'electron';

import {
  enhancePrompt,
  maxAllowedResultLength,
  MAX_MODEL_REPAIR_RETRIES,
  MODEL_STYLES,
  PROMPT_MODES,
  PROMPT_PROTOCOL_VERSION,
} from '../src/core/promptEnhancer.mjs';
import { createEncryptedModelConfigStore } from '../src/core/modelConfigStore.mjs';

const PERMISSION_SEEKING = /(?:是否|要不要|需不需要)(?:需要)?我.{0,24}(?:继续|开始|处理|执行|开发|优化)|(?:would you like me to|should i|shall i|do you want me to)/iu;
const FALSE_COMPLETION = /(?:已|已经).{0,80}(?:完成|审计|检查|测试)|(?:have|has)\s+(?:already\s+)?been\s+(?:completed|audited|inspected|tested)/iu;
const META_OUTPUT = /SOURCE_MATERIAL_JSON|系统提示词规范|System prompt protocol|请(?:将|把)以下.{0,24}(?:优化|改写|润色)|rewrite the following/iu;

const SOURCES = Object.freeze({
  zh: {
    [PROMPT_MODES.enhance]: [
      '请审计仓库 https://github.com/xiaoqiuqiu889/promptlift/tree/codex/prompt-tier-mascots，',
      '从 Prompt Engine 与 UI/UX 两个维度输出一份按 P0/P1/P2 排序的报告。',
      '当前工作尚未开始，不要声称已经访问、审计或发现问题；建议优先核对真实代码、测试和界面证据。',
    ].join(''),
    [PROMPT_MODES.upwardCommunication]: [
      '结论：S5 赛季发布方案建议在 8月6日 评审，目前仍未完成数据核对。',
      '已知转化率为 23%，可能存在样本偏差。下一步建议产品与运营共同复核，不要承诺上线日期。',
    ].join(''),
    [PROMPT_MODES.chatPolish]: [
      '王经理，S5 赛季方案可能要到 8月6日 才能评审，目前转化率 23% 的数据还没核对完。',
      '建议我们先复核一下，不要先承诺上线时间，谢谢。',
    ].join(''),
    [PROMPT_MODES.pptCopy]: [
      'S5 赛季方案将在 8月6日 进入评审；当前转化率为 23%，但数据核对尚未完成，可能存在样本偏差。',
      '建议先完成产品与运营联合复核，不要在证据齐备前承诺上线日期。',
    ].join(''),
  },
  en: {
    [PROMPT_MODES.enhance]: [
      'Please audit https://github.com/xiaoqiuqiu889/promptlift/tree/codex/prompt-tier-mascots and produce a report ',
      'covering Prompt Engine and UI/UX findings prioritized as P0/P1/P2. The work has not started; do not claim the ',
      'repository was accessed or audited. Consider checking real code, tests, and interface evidence first.',
    ].join(''),
    [PROMPT_MODES.upwardCommunication]: [
      'Conclusion: consider reviewing the S5 release plan on August 6. Data verification is not complete. ',
      'The known conversion rate is 23%, but sampling bias may remain. Next, product and operations should review it together; ',
      'do not commit to a launch date.',
    ].join(''),
    [PROMPT_MODES.chatPolish]: [
      'Hi Morgan, the S5 plan may not be ready for review until August 6. The 23% conversion figure is still unverified. ',
      'I suggest we check it first and do not commit to a launch date yet. Thank you.',
    ].join(''),
    [PROMPT_MODES.pptCopy]: [
      'The S5 plan enters review on August 6. Conversion is currently 23%, but verification is incomplete and sampling bias may remain. ',
      'Consider a joint product and operations review first; do not commit to a launch date before evidence is ready.',
    ].join(''),
  },
});

const REQUIRED = Object.freeze({
  zh: {
    [PROMPT_MODES.enhance]: [/https:\/\/github\.com\/xiaoqiuqiu889\/promptlift\/tree\/codex\/prompt-tier-mascots/u, /P0/u, /P1/u, /P2/u, /报告/u],
    [PROMPT_MODES.upwardCommunication]: [/S5/u, /8月6日/u, /23%/u, /未|尚未|没/u],
    [PROMPT_MODES.chatPolish]: [/王经理/u, /S5/u, /8月6日/u, /23%/u],
    [PROMPT_MODES.pptCopy]: [/S5/u, /8月6日/u, /23%/u, /未|尚未|不/u],
  },
  en: {
    [PROMPT_MODES.enhance]: [/https:\/\/github\.com\/xiaoqiuqiu889\/promptlift\/tree\/codex\/prompt-tier-mascots/u, /P0/u, /P1/u, /P2/u, /report/iu],
    [PROMPT_MODES.upwardCommunication]: [/S5/u, /August 6/iu, /23%/u, /not complete|incomplete|unverified/iu],
    [PROMPT_MODES.chatPolish]: [/Morgan/u, /S5/u, /August 6/iu, /23%/u],
    [PROMPT_MODES.pptCopy]: [
      /S5/u,
      /August 6/iu,
      /23%/u,
      /incomplete|not complete|unverified|verification pending/iu,
      /do not|don't|no launch date(?: commitment)?|no (?:launch|date) commitment|without.{0,24}commitment|not.{0,24}commit/iu,
    ],
  },
});

const promptLiftUserDataPath = path.join(app.getPath('appData'), 'Prompt Lift');
app.setPath('userData', promptLiftUserDataPath);

function rawProtocolSummary(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return { validJson: false, exactFields: false, protocolMatch: false };
  }
  try {
    const parsed = JSON.parse(content);
    const fields = Object.keys(parsed).sort();
    return {
      validJson: true,
      exactFields: JSON.stringify(fields) === JSON.stringify(
        ['language', 'mode', 'protocol', 'result', 'status'].sort(),
      ),
      protocolMatch: parsed.protocol === PROMPT_PROTOCOL_VERSION,
    };
  } catch {
    return { validJson: false, exactFields: false, protocolMatch: false };
  }
}

function validateAcceptedResult({ source, result, language, mode, style }) {
  const affirmativeText = result
    .split(/[。！？.!?;\n]/u)
    .filter((sentence) => !/(?:不要|不得|不能|不可|尚未|未完成|do not|must not|cannot|not complete|incomplete)/iu.test(sentence))
    .join('\n');
  const checks = {
    nonEmpty: result.trim().length > 0,
    withinTierBudget: result.length <= maxAllowedResultLength(source, style),
    requiredAnchors: REQUIRED[language][mode].every((pattern) => pattern.test(result)),
    noPermissionQuestion: !PERMISSION_SEEKING.test(result),
    noFalseCompletion: !FALSE_COMPLETION.test(affirmativeText),
    noMetaOutput: !META_OUTPUT.test(result),
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

async function run() {
  await app.whenReady();
  const store = createEncryptedModelConfigStore({
    userDataPath: app.getPath('userData'),
    safeStorage,
  });
  const config = await store.load();
  if (!config.apiKeySaved || !config.apiKey) {
    throw Object.assign(new Error('No usable saved model credential is available.'), {
      code: 'QA_MODEL_KEY_MISSING',
    });
  }

  const cases = [];
  const casePattern = process.env.QA_CASE_PATTERN
    ? new RegExp(process.env.QA_CASE_PATTERN, 'iu')
    : null;
  for (const language of ['zh', 'en']) {
    for (const mode of Object.values(PROMPT_MODES)) {
      for (const style of Object.values(MODEL_STYLES)) {
        const contractCase = {
          name: `${language}/${mode}/${style}`,
          language,
          mode,
          style,
          source: SOURCES[language][mode],
        };
        if (!casePattern || casePattern.test(contractCase.name)) {
          cases.push(contractCase);
        }
      }
    }
  }

  const results = [];
  for (const contractCase of cases) {
    const rawAttempts = [];
    const debugResults = [];
    const tracedFetch = async (...args) => {
      const response = await globalThis.fetch(...args);
      try {
        const payload = await response.clone().json();
        rawAttempts.push(rawProtocolSummary(payload));
        if (process.env.QA_DEBUG_SYNTHETIC === '1') {
          try {
            const parsed = JSON.parse(payload?.choices?.[0]?.message?.content ?? '');
            debugResults.push({
              status: parsed.status,
              result: parsed.result,
            });
          } catch {
            debugResults.push({ status: 'invalid_json' });
          }
        }
      } catch {
        rawAttempts.push({ validJson: false, exactFields: false, protocolMatch: false });
      }
      return response;
    };
    try {
      const result = await enhancePrompt(contractCase.source, {
        endpoint: config.endpoint,
        model: config.model,
        apiKey: config.apiKey,
        mode: contractCase.mode,
        style: contractCase.style,
        useModel: true,
        timeoutMs: 60_000,
        fetchImpl: tracedFetch,
      });
      const validation = validateAcceptedResult({ ...contractCase, result });
      const withinRetryLimit = rawAttempts.length <= MAX_MODEL_REPAIR_RETRIES + 1;
      results.push({
        name: contractCase.name,
        passed: validation.passed && withinRetryLimit,
        outcome: rawAttempts.length === 1 ? 'first_pass' : 'repaired',
        attempts: rawAttempts.length,
        resultCharacters: result.length,
        lengthRatio: Number((result.length / contractCase.source.length).toFixed(4)),
        rawProtocol: {
          allValidJson: rawAttempts.every(({ validJson }) => validJson),
          allExactFields: rawAttempts.every(({ exactFields }) => exactFields),
          allProtocolMatch: rawAttempts.every(({ protocolMatch }) => protocolMatch),
        },
        checks: {
          ...validation.checks,
          withinRetryLimit,
        },
        ...(process.env.QA_DEBUG_SYNTHETIC === '1' ? { debugResults } : {}),
      });
    } catch (error) {
      results.push({
        name: contractCase.name,
        passed: false,
        outcome: 'blocked_original_preserved',
        attempts: rawAttempts.length,
        errorCode: String(error?.code ?? 'UNKNOWN'),
        rawProtocol: {
          allValidJson: rawAttempts.length > 0 && rawAttempts.every(({ validJson }) => validJson),
          allExactFields: rawAttempts.length > 0 && rawAttempts.every(({ exactFields }) => exactFields),
          allProtocolMatch: rawAttempts.length > 0 && rawAttempts.every(({ protocolMatch }) => protocolMatch),
        },
        ...(process.env.QA_DEBUG_SYNTHETIC === '1'
          ? { debugResults, debugErrorDetails: error?.details ?? null }
          : {}),
      });
    }
  }

  const passed = results.every(({ passed: itemPassed }) => itemPassed);
  const summary = {
    passed,
    evidenceType: 'real_model_predictions',
    model: config.model,
    endpoint: config.endpoint,
    matrix: {
      total: results.length,
      passed: results.filter(({ passed: itemPassed }) => itemPassed).length,
      firstPass: results.filter(({ outcome }) => outcome === 'first_pass').length,
      repaired: results.filter(({ outcome }) => outcome === 'repaired').length,
      blockedOriginalPreserved: results.filter(({ outcome }) => outcome === 'blocked_original_preserved').length,
      maxRepairRetries: MAX_MODEL_REPAIR_RETRIES,
    },
    results,
    privacy: {
      apiKeyPersisted: false,
      rawSourcePersisted: false,
      rawResultPersisted: false,
    },
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (!passed) {
    throw Object.assign(new Error('One or more real-model prediction cases failed.'), {
      code: 'QA_REAL_MODEL_CORRECTION_FAILED',
      summaryWritten: true,
    });
  }
}

run()
  .then(() => app.exit(0))
  .catch((error) => {
    if (error?.summaryWritten !== true) {
      process.stderr.write(`${JSON.stringify({
        passed: false,
        evidenceType: 'real_model_predictions',
        code: String(error?.code ?? 'QA_REAL_MODEL_CORRECTION_FAILED'),
        message: String(error?.message ?? error),
      })}\n`);
    }
    app.exit(1);
  });
