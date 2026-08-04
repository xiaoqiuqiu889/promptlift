import { enhancePrompt, maxAllowedResultLength, MODEL_STYLES, PROMPT_MODES, PROMPT_PROTOCOL_VERSION } from '../src/core/promptEnhancer.mjs';

const MODEL_OPTIONS = Object.freeze({
  endpoint: 'https://loopback.invalid/v1',
  model: 'loopback-test-model',
  apiKey: 'loopback-test-key',
});

function completionResponse({ mode, language, result, status = 'ok' }) {
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
              language,
              status,
              result,
            }),
          },
        }],
      };
    },
  };
}

const sourceForCreative = 'Rewrite the release note for clarity.';
const creativeLimit = maxAllowedResultLength(sourceForCreative, MODEL_STYLES.creative);

const CASES = [
  {
    name: 'faithful-direct-rewrite',
    source: 'Rewrite the release note for clarity.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.faithful,
    result: 'Rewrite the release note for clarity and preserve the original intent.',
    expected: 'ok',
  },
  {
    name: 'faithful-anchor-loss',
    source: 'Contact owner@example.com about PROJ-42 on 2026-08-10.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.faithful,
    result: 'Contact the owner about the issue.',
    expected: 'MODEL_OUTPUT_FACT_LOSS',
  },
  {
    name: 'faithful-new-product-context',
    source: 'Rewrite this request clearly and preserve its original goal.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.faithful,
    result: 'Rewrite this request for Word review clearly and preserve its original goal.',
    expected: 'MODEL_OUTPUT_SCOPE_INVENTION',
  },
  {
    name: 'concise-new-user-segment',
    source: 'Summarize the request in one clear sentence.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    result: 'Summarize the request in one clear sentence for mobile users.',
    expected: 'MODEL_OUTPUT_SCOPE_INVENTION',
  },
  {
    name: 'professional-modality-escalation',
    source: 'Please consider adding a short note about the next step.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.professional,
    result: 'You must add a detailed note about the next step.',
    expected: 'MODEL_OUTPUT_SEMANTIC_ESCALATION',
  },
  {
    name: 'professional-preserves-possibility',
    source: 'The test may finish today; please confirm the next step.',
    mode: PROMPT_MODES.upwardCommunication,
    style: MODEL_STYLES.professional,
    result: 'The test may finish today; please confirm the next step and keep the update concise.',
    expected: 'ok',
  },
  {
    name: 'creative-bounded-expansion',
    source: sourceForCreative,
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result: 'Rewrite the release note for clarity and add one optional creative direction.',
    expected: 'ok',
  },
  {
    name: 'creative-over-350-percent',
    source: sourceForCreative,
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result: 'A '.repeat(creativeLimit + 1),
    expected: 'MODEL_OUTPUT_TOO_LONG',
  },
  {
    name: 'creative-preserves-url-and-path',
    source: 'Keep URL https://example.test/a and file C:\\Temp\\a.txt',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result: 'Keep URL https://example.test/a and file C:\\Temp\\a.txt; add one optional visual direction.',
    expected: 'ok',
  },
  {
    name: 'creative-anchor-loss',
    source: 'Keep URL https://example.test/a in the final request.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result: 'Keep the link in the final request and add one optional direction.',
    expected: 'MODEL_OUTPUT_FACT_LOSS',
  },
  {
    name: 'upward-new-platform-context',
    source: 'Report the conclusion and the next action.',
    mode: PROMPT_MODES.upwardCommunication,
    style: MODEL_STYLES.concise,
    result: 'Report the conclusion and the next action for the mobile app.',
    expected: 'MODEL_OUTPUT_SCOPE_INVENTION',
  },
  {
    name: 'upward-uncertainty-preserved',
    source: 'The test may finish today; please confirm the next step.',
    mode: PROMPT_MODES.upwardCommunication,
    style: MODEL_STYLES.concise,
    result: 'The test may finish today; please confirm the next step.',
    expected: 'ok',
  },
  {
    name: 'chat-promise-invention',
    source: 'We could review this tomorrow if needed.',
    mode: PROMPT_MODES.chatPolish,
    style: MODEL_STYLES.concise,
    result: 'We will guarantee delivery tomorrow.',
    expected: 'MODEL_OUTPUT_SEMANTIC_ESCALATION',
  },
  {
    name: 'chat-polite-without-new-commitment',
    source: 'Could you share the file when convenient?',
    mode: PROMPT_MODES.chatPolish,
    style: MODEL_STYLES.concise,
    result: 'Could you please share the file when convenient?',
    expected: 'ok',
  },
  {
    name: 'ppt-new-evidence-context',
    source: 'Create a conclusion-led title for this slide.',
    mode: PROMPT_MODES.pptCopy,
    style: MODEL_STYLES.professional,
    result: 'Create a conclusion-led title and add chart data sources.',
    expected: 'MODEL_OUTPUT_SCOPE_INVENTION',
  },
  {
    name: 'unchanged-status-exact',
    source: 'This request already has a clear goal.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    result: 'This request already has a clear goal.',
    status: 'unchanged',
    expected: 'ok',
  },
  {
    name: 'unchanged-status-with-edit',
    source: 'This request already has a clear goal.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    result: 'This request now has a clearer goal.',
    status: 'unchanged',
    expected: 'MODEL_OUTPUT_STATUS_MISMATCH',
  },
  {
    name: 'wrong-mode-envelope',
    source: 'Rewrite the request clearly.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.faithful,
    result: 'Rewrite the request clearly.',
    responseMode: PROMPT_MODES.chatPolish,
    expected: 'MODEL_OUTPUT_MODE_MISMATCH',
  },
  {
    name: 'minimal-clarification',
    source: 'Make it better.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.professional,
    result: 'What should be improved, and who will use the result?',
    status: 'needs_input',
    expected: 'MODEL_NEEDS_INPUT',
  },
  {
    name: 'multiple-candidate-drafts',
    source: 'Rewrite the request clearly.',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    result: 'Option A: rewrite the request clearly. Option B: rewrite it with more detail.',
    expected: 'MODEL_OUTPUT_MULTIPLE_CANDIDATES',
  },
];

async function runCase(item) {
  let calls = 0;
  try {
    const value = await enhancePrompt(item.source, {
      ...MODEL_OPTIONS,
      mode: item.mode,
      style: item.style,
      fetchImpl: async () => {
        calls += 1;
        return completionResponse({
          mode: item.responseMode ?? item.mode,
          language: 'en',
          result: item.result,
          status: item.status ?? 'ok',
        });
      },
    });
    return {
      name: item.name,
      expected: item.expected,
      actual: 'ok',
      passed: item.expected === 'ok' && typeof value === 'string' && value.length > 0,
      calls,
    };
  } catch (error) {
    return {
      name: item.name,
      expected: item.expected,
      actual: error?.code ?? 'UNKNOWN_ERROR',
      passed: error?.code === item.expected,
      calls,
    };
  }
}

const summary = [];
for (const item of CASES) {
  summary.push(await runCase(item));
}

const failures = summary.filter((item) => !item.passed);
const report = {
  passed: failures.length === 0,
  rounds: summary.length,
  failures: failures.length,
  summary,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
