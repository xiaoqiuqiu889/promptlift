import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECIPE_IDS,
  RECIPE_SCHEMA_VERSION,
  PROMPT_RECIPES,
  getRecipe,
  getPromptRecipe,
  listRecipes,
  resolveRecipeId,
} from '../../src/core/recipeRegistry.mjs';

test('recipe registry exposes four complete versioned expression recipes', () => {
  const recipes = listRecipes();

  assert.equal(RECIPE_SCHEMA_VERSION, '1.4');
  assert.deepEqual(
    recipes.map((recipe) => recipe.id),
    [
      RECIPE_IDS.enhance,
      RECIPE_IDS.upwardCommunication,
      RECIPE_IDS.chatPolish,
      RECIPE_IDS.pptCopy,
    ],
  );
  for (const recipe of recipes) {
    assert.equal(recipe.version, RECIPE_SCHEMA_VERSION);
    assert.ok(recipe.goal.zh && recipe.goal.en);
    assert.ok(recipe.hardConstraints.zh.length >= 2);
    assert.ok(recipe.hardConstraints.en.length >= 2);
    assert.ok(recipe.softConstraints.zh.length >= 1);
    assert.ok(recipe.softConstraints.en.length >= 1);
    assert.ok(recipe.languagePolicy.zh && recipe.languagePolicy.en);
    assert.ok(recipe.lengthPolicy.zh && recipe.lengthPolicy.en);
    assert.ok(recipe.edgeCases.zh.length >= 1);
    assert.ok(recipe.edgeCases.en.length >= 1);
    assert.ok(recipe.outputContract.zh && recipe.outputContract.en);
    assert.equal(Object.isFrozen(recipe), true);
  }
});

test('each communication recipe defines four mode-specific optimization tier contracts', () => {
  const expectedTierNames = {
    [RECIPE_IDS.enhance]: ['原意守护', '清晰直达', '专业展开', '创意策划'],
    [RECIPE_IDS.upwardCommunication]: ['事实直报', '结论先行', '决策建议', '影响力表达'],
    [RECIPE_IDS.chatPolish]: ['安全保真', '友好清晰', '专业服务', '共情化解'],
    [RECIPE_IDS.pptCopy]: ['原文压缩', '结论标题', '结构化叙事', '创意提案'],
  };
  const styleIds = ['faithful', 'concise', 'professional', 'creative'];
  const serializedChineseContracts = new Set();
  const distinctChineseFields = {
    goal: new Set(),
    changeBudget: new Set(),
    structure: new Set(),
    forbidden: new Set(),
  };

  for (const recipe of listRecipes()) {
    assert.deepEqual(Object.keys(recipe.styleContracts.zh), styleIds);
    assert.deepEqual(Object.keys(recipe.styleContracts.en), styleIds);
    assert.deepEqual(
      styleIds.map((style) => recipe.styleContracts.zh[style].name),
      expectedTierNames[recipe.id],
    );

    for (const language of ['zh', 'en']) {
      for (const style of styleIds) {
        const contract = recipe.styleContracts[language][style];
        assert.ok(contract.name);
        assert.ok(contract.goal);
        assert.ok(contract.changeBudget);
        assert.ok(contract.structure);
        assert.ok(contract.forbidden);
        assert.equal(Object.isFrozen(contract), true);
      }
    }

    for (const style of styleIds) {
      const contract = recipe.styleContracts.zh[style];
      serializedChineseContracts.add(JSON.stringify(contract));
      for (const [field, values] of Object.entries(distinctChineseFields)) {
        values.add(contract[field]);
      }
    }
    assert.equal(Object.isFrozen(recipe.styleContracts), true);
    assert.equal(Object.isFrozen(recipe.styleContracts.zh), true);
    assert.equal(Object.isFrozen(recipe.styleContracts.en), true);
  }

  assert.equal(serializedChineseContracts.size, 16);
  for (const values of Object.values(distinctChineseFields)) {
    assert.equal(values.size, 16);
  }
});

test('public prompt recipe metadata is UI-ready and safety-aware', () => {
  assert.equal(PROMPT_RECIPES.length, 4);
  for (const recipe of PROMPT_RECIPES) {
    assert.equal(typeof recipe.name, 'string');
    assert.equal(typeof recipe.audience, 'string');
    assert.equal(typeof recipe.goal, 'string');
    assert.equal(Array.isArray(recipe.hardConstraints), true);
    assert.equal(Array.isArray(recipe.softConstraints), true);
    assert.equal(Array.isArray(recipe.edgeCases), true);
    assert.match(recipe.riskLevel, /^(?:low|medium|high)$/u);
    assert.equal(typeof recipe.allowFastReplace, 'boolean');
    assert.equal(getPromptRecipe(recipe.id), recipe);
  }
  assert.equal(getPromptRecipe('unknown'), null);
});

test('existing modes remain canonical recipes without migration', () => {
  assert.equal(resolveRecipeId('enhance'), RECIPE_IDS.enhance);
  assert.equal(resolveRecipeId('chat-polish'), RECIPE_IDS.chatPolish);
  assert.equal(resolveRecipeId(RECIPE_IDS.pptCopy), RECIPE_IDS.pptCopy);
  assert.equal(resolveRecipeId('unknown'), null);
  assert.equal(getRecipe('chat-polish').id, RECIPE_IDS.chatPolish);
  assert.equal(getRecipe('unknown'), null);
});

test('chat polish clarifies the next step only when supported by the source', () => {
  const recipe = getRecipe(RECIPE_IDS.chatPolish);
  assert.match(recipe.softConstraints.zh.join('\n'), /原文依据.*下一步/);
  assert.match(recipe.hardConstraints.zh.join('\n'), /不得编造.*流程.*承诺/);
  assert.match(recipe.softConstraints.en.join('\n'), /next step.*source/i);
  assert.match(recipe.hardConstraints.en.join('\n'), /do not invent.*process.*commitment/i);
});
