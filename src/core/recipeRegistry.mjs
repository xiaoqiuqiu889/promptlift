export const RECIPE_SCHEMA_VERSION = '1.1';

export const RECIPE_IDS = Object.freeze({
  enhance: 'enhance',
  upwardCommunication: 'upward-communication',
  chatPolish: 'chat-polish',
  pptCopy: 'ppt-copy',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function tier(name, goal, changeBudget, structure, forbidden) {
  return { name, goal, changeBudget, structure, forbidden };
}

function freezeRecipe(recipe) {
  return deepFreeze(recipe);
}

const RECIPES = Object.freeze([
  freezeRecipe({
    id: RECIPE_IDS.enhance,
    version: RECIPE_SCHEMA_VERSION,
    goal: {
      zh: '直接产出可供 AI 助手执行的最终提示词，补清目标、必要上下文、约束和输出格式。',
      en: 'Produce the final prompt for an AI assistant, clarifying the goal, necessary context, constraints, and output format.',
    },
    styleContracts: {
      zh: {
        faithful: tier(
          '原意守护',
          '只消除妨碍执行的歧义，最大限度保持用户原始任务。',
          '最小必要改动；不主动扩写，长度和信息顺序尽量贴近原文。',
          '沿用原结构；仅在缺失会阻碍执行时补一个明确占位或澄清动作。',
          '不得新增任务范围、专业框架、平台、产品、参数、验收事实或创意方向。',
        ),
        concise: tier(
          '清晰直达',
          '把原文收敛成目标明确、可直接交给 AI 执行的紧凑请求。',
          '允许删除重复并重排信息；只补目标、必要上下文、关键约束和输出要求。',
          '使用少量短段落或短列表，优先按目标、约束、输出组织。',
          '不得增加非必要背景、方法论、未经提供的工具或实现假设。',
        ),
        professional: tier(
          '专业展开',
          '形成可交付给专业执行者的完整任务简报。',
          '可在原意支持范围内展开执行细节、质量标准、边界情况和风险，并对缺失信息保留待确认项。',
          '按目标、背景、要求、约束、输出格式、验收标准形成分层结构。',
          '不得把待确认项写成事实，不得擅自指定产品、平台、技术栈、参数或期限。',
        ),
        creative: tier(
          '创意策划',
          '在专业任务简报基础上提供受控的探索空间和差异化方向。',
          '允许补充二至三个可选创意方向、评价维度或组合方式，但每项必须服务原任务。',
          '先完整定义目标、约束和交付，再列可比较的创意方向及选择标准。',
          '不得把创意建议伪装为事实，不得虚构数据、来源、用户结论、产品能力或业务前提。',
        ),
      },
      en: {
        faithful: tier(
          'Meaning Guardian',
          'Remove only ambiguity that blocks execution while preserving the user’s original task.',
          'Make the minimum necessary edits; avoid proactive expansion and stay close to the source length and order.',
          'Keep the source structure; add one placeholder or clarification step only when execution would otherwise be blocked.',
          'Do not introduce scope, frameworks, platforms, products, parameters, acceptance facts, or creative directions.',
        ),
        concise: tier(
          'Clear and Direct',
          'Condense the source into a compact request that an AI can execute directly.',
          'Remove repetition and reorder information; add only the goal, essential context, key constraints, and output requirement.',
          'Use a few short paragraphs or bullets, preferably organized by goal, constraints, and output.',
          'Do not add optional background, methodology, unprovided tools, or implementation assumptions.',
        ),
        professional: tier(
          'Professional Expansion',
          'Create a complete task brief for a skilled executor.',
          'Where supported by intent, expand execution details, quality criteria, edge cases, and risks while marking missing information To Confirm.',
          'Use a hierarchy of objective, background, requirements, constraints, output format, and acceptance criteria.',
          'Do not present unknowns as facts or choose a product, platform, stack, parameter, or deadline without source support.',
        ),
        creative: tier(
          'Creative Planning',
          'Add bounded exploration and differentiated directions on top of a professional task brief.',
          'Add two or three optional creative directions, evaluation dimensions, or combinations only when they serve the source task.',
          'Define the objective, constraints, and deliverable first, then comparable creative directions and selection criteria.',
          'Do not present suggestions as facts or invent data, sources, user conclusions, product capabilities, or business premises.',
        ),
      },
    },
    hardConstraints: {
      zh: [
        '保留原意和事实锚点。',
        '不得返回要求另一个模型再次改写原文的二次提示词。',
        '产品名、功能名、模式名、界面文案和指代默认按原文保留；仅在原文明确时指定产品或平台。',
      ],
      en: [
        'Preserve intent and factual anchors.',
        'Never return a second-order prompt asking another model to rewrite the source.',
        'Preserve product names, feature names, mode labels, UI copy, and references as written; name a product or platform only when the source does.',
      ],
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
    styleContracts: {
      zh: {
        faithful: tier(
          '事实直报',
          '准确呈报原有事实、进展和诉求，不改变判断强度。',
          '只做必要纠错和顺序整理，保持原消息长度与语气。',
          '沿用原顺序，必要时以事实、现状、诉求三段呈现。',
          '不得新增结论、归因、价值判断、承诺、责任人或截止时间。',
        ),
        concise: tier(
          '结论先行',
          '让上级先看到结论，再快速理解依据和下一步。',
          '允许前置原文已有结论并压缩重复信息，不补造新判断。',
          '按结论、关键依据、风险或阻塞、下一步组织。',
          '不得把建议升级为决定，不得隐藏关键风险或不确定性。',
        ),
        professional: tier(
          '决策建议',
          '形成支持上级判断的专业决策信息。',
          '可展开原文支持的选项、利弊、风险和所需支持；缺口明确标为待确认。',
          '按现状与结论、证据、选项比较、建议、需决策事项组织。',
          '不得虚构数据、收益、资源、责任归属、时间表或替上级作决定。',
        ),
        creative: tier(
          '影响力表达',
          '在事实准确的前提下增强表达说服力和行动推动力。',
          '可优化叙事顺序、重点和措辞，并给出受控的表达角度。',
          '以结论开场，用事实建立必要性，再呈影响、建议与明确行动请求。',
          '不得情绪操纵、夸大紧迫性或价值，不得掩盖代价、风险和不确定性。',
        ),
      },
      en: {
        faithful: tier(
          'Factual Brief',
          'Report the existing facts, progress, and request accurately without changing certainty.',
          'Make only necessary corrections and ordering changes while preserving length and tone.',
          'Keep the source order, or use Facts, Current State, and Request only when needed.',
          'Do not add conclusions, causes, value claims, commitments, owners, or deadlines.',
        ),
        concise: tier(
          'Conclusion First',
          'Let the manager see the conclusion first, followed by evidence and next action.',
          'Move an existing conclusion forward and compress repetition without inventing a new judgment.',
          'Use Conclusion, Key Evidence, Risk or Blocker, and Next Action.',
          'Do not turn a suggestion into a decision or hide material risks and uncertainty.',
        ),
        professional: tier(
          'Decision Recommendation',
          'Create professional decision support for a manager.',
          'Expand source-supported options, tradeoffs, risks, and support needed; label gaps To Confirm.',
          'Use Status and Conclusion, Evidence, Option Comparison, Recommendation, and Decision Needed.',
          'Do not invent data, benefits, resources, ownership, timelines, or decide on the manager’s behalf.',
        ),
        creative: tier(
          'Influential Framing',
          'Increase persuasive clarity and momentum while remaining factually grounded.',
          'Improve narrative order, emphasis, and wording, with bounded framing options.',
          'Lead with the conclusion, establish necessity with facts, then show impact, recommendation, and a clear action request.',
          'Do not manipulate emotion, exaggerate urgency or value, or conceal costs, risks, and uncertainty.',
        ),
      },
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
    styleContracts: {
      zh: {
        faithful: tier(
          '安全保真',
          '在不改变事实、立场和承诺强度的前提下消除冒犯与歧义。',
          '只替换必要措辞，尽量保持原句式、长度和情绪强度。',
          '保留原消息结构和称谓；仅修正明显生硬、含混或高风险表达。',
          '不得新增承诺、处理结果、补偿、时限、流程或对责任的判断。',
        ),
        concise: tier(
          '友好清晰',
          '让用户快速理解现状、关键信息和原文已有的下一步。',
          '允许压缩重复并调整语序，增加最少的礼貌衔接。',
          '按回应、核心信息、下一步组织为短段落。',
          '不得以客套掩盖结论，不得承诺原文未支持的行动或结果。',
        ),
        professional: tier(
          '专业服务',
          '形成稳定、可信、边界清楚的专业服务表达。',
          '可补充原文已有流程的清晰说明、条件和风险提示，但不创造服务能力。',
          '按确认理解、事实说明、可执行步骤、边界或待确认项组织。',
          '不得虚构政策、权限、处理进度、服务能力、补偿方案或保证。',
        ),
        creative: tier(
          '共情化解',
          '先承接用户感受，再清晰表达事实和可行下一步，降低对抗。',
          '可调整语气与叙事，并增加与原意一致的共情表达。',
          '按共情回应、事实与边界、可行下一步组织，必要时提供中性选择。',
          '不得假装已解决、过度道歉、揣测用户动机，或用安抚措辞替代事实。',
        ),
      },
      en: {
        faithful: tier(
          'Safe Fidelity',
          'Remove offense and ambiguity without changing facts, stance, or commitment strength.',
          'Replace only necessary wording and preserve sentence shape, length, and emotional intensity where possible.',
          'Keep the message structure and form of address; fix only clearly harsh, ambiguous, or risky wording.',
          'Do not add promises, outcomes, compensation, deadlines, processes, or judgments of responsibility.',
        ),
        concise: tier(
          'Friendly Clarity',
          'Help the user quickly understand the state, key information, and any source-supported next step.',
          'Compress repetition, reorder for clarity, and add only minimal polite transitions.',
          'Use short paragraphs for Response, Core Information, and Next Step.',
          'Do not hide the conclusion behind courtesy or promise unsupported actions and outcomes.',
        ),
        professional: tier(
          'Professional Service',
          'Create stable, credible service communication with clear boundaries.',
          'Clarify source-supported process, conditions, and risk notes without creating capabilities.',
          'Use Acknowledgement, Facts, Actionable Steps, and Boundaries or To Confirm.',
          'Do not invent policy, permissions, progress, service capability, compensation, or guarantees.',
        ),
        creative: tier(
          'Empathetic Resolution',
          'Acknowledge the user’s feelings before stating facts and feasible next steps to reduce conflict.',
          'Adjust tone and narrative and add empathy only when consistent with the source intent.',
          'Use Empathy, Facts and Boundaries, and Feasible Next Step, with neutral options when useful.',
          'Do not pretend the issue is solved, over-apologize, infer motives, or replace facts with reassurance.',
        ),
      },
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
    styleContracts: {
      zh: {
        faithful: tier(
          '原文压缩',
          '在保留原有结论和信息顺序的前提下压缩为单页可读文案。',
          '只删重复和赘词，不补新观点、数据或故事线。',
          '保留原有标题与正文关系；标题和正文均短句化。',
          '不得改变论点、合并不同结论或推导原文没有的业务含义。',
        ),
        concise: tier(
          '结论标题',
          '把核心主张前置为结论式标题，并用最少正文支撑。',
          '允许重排并压缩原文，正文只保留支撑标题的关键信息。',
          '使用一个结论式标题和二至四条平行短句。',
          '不得使用仅描述主题的空泛标题，不得新增数据、来源或因果。',
        ),
        professional: tier(
          '结构化叙事',
          '形成一页一主张、证据与行动关系清楚的专业演示叙事。',
          '可展开原文已有的证据、逻辑关系和行动含义，缺证据处明确待补。',
          '按结论标题、关键证据、影响或解释、行动建议形成层级。',
          '不得把建议当结论、把相关性写成因果，或声称读取当前输入之外的页面内容。',
        ),
        creative: tier(
          '创意提案',
          '在事实不变的前提下提出更鲜明的标题角度和叙事方案。',
          '可给出二至三个标题或叙事方向及适用场景，但不得增加事实。',
          '先输出推荐方案，再列备选方向和简短选择理由。',
          '不得为了吸引力夸大结论、制造数据、虚构来源或偏离单页主张。',
        ),
      },
      en: {
        faithful: tier(
          'Source Compression',
          'Compress the source into readable single-slide copy while preserving conclusions and information order.',
          'Remove only repetition and filler; add no new viewpoint, data, or storyline.',
          'Keep the source relationship between title and body while shortening both.',
          'Do not change the claim, merge separate conclusions, or infer unsupported business meaning.',
        ),
        concise: tier(
          'Conclusion Title',
          'Lead with the core claim as a conclusion title and support it with minimal body copy.',
          'Reorder and compress the source, retaining only information that supports the title.',
          'Use one conclusion-led title and two to four parallel short statements.',
          'Do not use a generic topic title or add data, sources, or causality.',
        ),
        professional: tier(
          'Structured Narrative',
          'Create a professional one-slide narrative with a clear relationship among claim, evidence, and action.',
          'Expand source-supported evidence, logic, and action implications while marking missing evidence.',
          'Use Conclusion Title, Key Evidence, Impact or Explanation, and Recommended Action.',
          'Do not turn suggestions into conclusions, correlation into causality, or claim access beyond the current input.',
        ),
        creative: tier(
          'Creative Proposal',
          'Offer distinctive title angles and narrative approaches without changing facts.',
          'Provide two or three title or narrative directions and their use cases without adding facts.',
          'Output the recommended direction first, then alternatives and a short selection rationale.',
          'Do not exaggerate conclusions, fabricate data or sources, or drift from the single-slide claim for impact.',
        ),
      },
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
