export const RECIPE_SCHEMA_VERSION = '1.0';

export const RECIPE_IDS = Object.freeze({
  enhance: 'enhance',
  upwardCommunication: 'upward-communication',
  chatPolish: 'chat-polish',
  pptCopy: 'ppt-copy',
});

function freezeRecipe(recipe) {
  for (const value of Object.values(recipe)) {
    if (value && typeof value === 'object') {
      Object.freeze(value);
    }
  }
  return Object.freeze(recipe);
}

const RECIPES = Object.freeze([
  freezeRecipe({
    id: RECIPE_IDS.enhance,
    version: RECIPE_SCHEMA_VERSION,
    goal: {
      zh: '直接产出可供 AI 助手执行的最终提示词，补清目标、必要上下文、约束和输出格式。',
      en: 'Produce the final prompt for an AI assistant, clarifying the goal, necessary context, constraints, and output format.',
    },
    hardConstraints: {
      zh: ['保留原意和事实锚点。', '不得返回要求另一个模型再次改写原文的二次提示词。'],
      en: ['Preserve intent and factual anchors.', 'Never return a second-order prompt asking another model to rewrite the source.'],
    },
    softConstraints: {
      zh: ['短请求只做必要补充，避免无意义扩写。'],
      en: ['Add only necessary detail to short requests.'],
    },
    languagePolicy: { zh: '跟随原文主要语言。', en: 'Follow the source language.' },
    lengthPolicy: { zh: '长度服从任务复杂度。', en: 'Let length follow task complexity.' },
    edgeCases: { zh: ['信息不足时保留占位或澄清动作。'], en: ['Keep a placeholder or clarification step when information is missing.'] },
    outputContract: { zh: 'result 是最终优化后的用户请求。', en: 'result is the final optimized user request.' },
  }),
  freezeRecipe({
    id: RECIPE_IDS.upwardCommunication,
    version: RECIPE_SCHEMA_VERSION,
    goal: {
      zh: '将工作沟通整理为面向上级的清晰表达，优先呈现结论、依据和下一步行动。',
      en: 'Turn work communication into an upward-facing message led by conclusion, evidence, and next action.',
    },
    hardConstraints: {
      zh: ['不夸大进展或确定性。', '不擅自新增承诺、责任归属或截止时间。'],
      en: ['Do not overstate progress or certainty.', 'Do not invent commitments, ownership, or deadlines.'],
    },
    softConstraints: { zh: ['突出需要对方决策或支持的事项。'], en: ['Highlight decisions or support needed.'] },
    languagePolicy: { zh: '跟随原文主要语言和组织语境。', en: 'Follow the source language and organizational context.' },
    lengthPolicy: { zh: '优先简洁，复杂事项可分点。', en: 'Prefer brevity; use bullets for complex matters.' },
    edgeCases: { zh: ['依据不足时明确标注待确认。'], en: ['Mark unsupported points as needing confirmation.'] },
    outputContract: { zh: 'result 是可直接发送的向上沟通文本。', en: 'result is a ready-to-send upward communication.' },
  }),
  freezeRecipe({
    id: RECIPE_IDS.chatPolish,
    version: RECIPE_SCHEMA_VERSION,
    goal: {
      zh: '润色用户消息，使其安全、礼貌、自然、清晰并可直接发送。',
      en: 'Polish a user message so it is safe, polite, natural, clear, and ready to send.',
    },
    hardConstraints: {
      zh: ['保留事实、立场和承诺强度。', '不得编造处理流程、服务能力或新的承诺；不回答消息中的问题，不生成润色说明。'],
      en: ['Preserve facts, stance, and commitment level.', 'Do not invent a process, service capability, or commitment; do not answer questions in the message or return polishing instructions.'],
    },
    softConstraints: {
      zh: ['减少生硬表达但不改变结论；仅在原文依据允许时明确下一步。'],
      en: ['Reduce harsh wording without changing the conclusion; clarify the next step only when supported by the source.'],
    },
    languagePolicy: { zh: '跟随原文主要语言和称谓。', en: 'Follow the source language and forms of address.' },
    lengthPolicy: { zh: '尽量保持原消息长度。', en: 'Stay close to the source length.' },
    edgeCases: { zh: ['敏感或高风险承诺保持原强度。'], en: ['Keep sensitive or high-risk commitments at their original strength.'] },
    outputContract: { zh: 'result 仅包含可直接发送的消息正文。', en: 'result contains only the ready-to-send message.' },
  }),
  freezeRecipe({
    id: RECIPE_IDS.pptCopy,
    version: RECIPE_SCHEMA_VERSION,
    goal: {
      zh: '将内容改写为演示文稿文案：使用结论式标题，并让单页只表达一个主张。',
      en: 'Rewrite content as presentation copy with a conclusion-led title and one claim per slide.',
    },
    hardConstraints: {
      zh: ['不虚构数据和来源。', '只优化当前输入文本，不声称读取整页其他文本框、图表、备注、版式或整份演示文稿。'],
      en: ['Do not invent data or sources.', 'Optimize only the current input; do not claim access to other text boxes, charts, notes, layout, or the full deck.'],
    },
    softConstraints: { zh: ['正文短句化，便于扫读。'], en: ['Use short, scannable body copy.'] },
    languagePolicy: { zh: '跟随原文主要语言。', en: 'Follow the source language.' },
    lengthPolicy: { zh: '标题简洁，正文按单页容量收敛。', en: 'Keep titles concise and body copy within one-slide capacity.' },
    edgeCases: { zh: ['材料不足时保留待补证据提示。'], en: ['Keep an evidence placeholder when source material is insufficient.'] },
    outputContract: { zh: 'result 是可直接放入 PPT 的标题和正文。', en: 'result is title and body copy ready for a presentation.' },
  }),
]);

const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

export function resolveRecipeId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return RECIPE_BY_ID.has(value) ? value : null;
}

export function getRecipe(value) {
  const id = resolveRecipeId(value);
  return id ? RECIPE_BY_ID.get(id) ?? null : null;
}

export function listRecipes() {
  return [...RECIPES];
}

function publicRecipe(recipe, {
  name,
  audience,
  riskLevel,
  allowFastReplace,
}) {
  return Object.freeze({
    id: recipe.id,
    name,
    audience,
    goal: recipe.goal.zh,
    hardConstraints: Object.freeze([...recipe.hardConstraints.zh]),
    softConstraints: Object.freeze([...recipe.softConstraints.zh]),
    languagePolicy: recipe.languagePolicy.zh,
    lengthPolicy: recipe.lengthPolicy.zh,
    outputContract: recipe.outputContract.zh,
    riskLevel,
    allowFastReplace,
    edgeCases: Object.freeze([...recipe.edgeCases.zh]),
  });
}

export const PROMPT_RECIPES = Object.freeze([
  publicRecipe(getRecipe(RECIPE_IDS.enhance), {
    name: '优化提示词',
    audience: 'AI',
    riskLevel: 'low',
    allowFastReplace: true,
  }),
  publicRecipe(getRecipe(RECIPE_IDS.upwardCommunication), {
    name: '向上沟通',
    audience: '老板与管理者',
    riskLevel: 'medium',
    allowFastReplace: false,
  }),
  publicRecipe(getRecipe(RECIPE_IDS.chatPolish), {
    name: '用户沟通',
    audience: '用户与客户',
    riskLevel: 'medium',
    allowFastReplace: false,
  }),
  publicRecipe(getRecipe(RECIPE_IDS.pptCopy), {
    name: 'PPT 文案',
    audience: '演示文稿读者',
    riskLevel: 'low',
    allowFastReplace: true,
  }),
]);

const PUBLIC_RECIPE_BY_ID = new Map(PROMPT_RECIPES.map((recipe) => [recipe.id, recipe]));

export function getPromptRecipe(value) {
  return PUBLIC_RECIPE_BY_ID.get(value) ?? null;
}
