import path from 'node:path';

import { app, safeStorage } from 'electron';

import {
  enhancePrompt,
  PROMPT_MODES,
} from '../src/core/promptEnhancer.mjs';
import { createEncryptedModelConfigStore } from '../src/core/modelConfigStore.mjs';

const CONTRACT_SOURCE = '拖动起来不够跟手，不够丝滑';
const META_OUTPUT = /请将以下|用户反馈原文|消息原文|待改写内容|本次改写要求|SOURCE_MATERIAL_JSON|系统提示词规范/iu;
const DIRECT_OUTPUT = /拖动|跟手|流畅|丝滑/iu;
const promptLiftUserDataPath = path.join(app.getPath('appData'), 'Prompt Lift');
app.setPath('userData', promptLiftUserDataPath);

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

  const result = await enhancePrompt(CONTRACT_SOURCE, {
    endpoint: config.endpoint,
    model: config.model,
    apiKey: config.apiKey,
    style: config.style,
    mode: PROMPT_MODES.enhance,
    useModel: true,
    timeoutMs: 45_000,
  });

  if (META_OUTPUT.test(result) || !DIRECT_OUTPUT.test(result)) {
    throw Object.assign(new Error('The model did not return a direct optimized request.'), {
      code: 'QA_MODEL_CONTRACT_FAILED',
    });
  }
  process.stdout.write(`${JSON.stringify({
    passed: true,
    model: config.model,
    endpoint: config.endpoint,
    resultChars: result.length,
    directResult: true,
    metaPromptLeak: false,
  })}\n`);
}

run()
  .then(() => app.exit(0))
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({
      passed: false,
      code: String(error?.code ?? 'QA_MODEL_CONTRACT_FAILED'),
      message: String(error?.message ?? error),
    })}\n`);
    app.exit(1);
  });
