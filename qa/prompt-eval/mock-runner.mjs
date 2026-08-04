// Synthetic smoke runner only. It never represents production model quality.
export async function runCase({ fixture, variant }) {
  const result = variant === 'baseline'
    ? fixture.id === 'synthetic-anchor-001'
      ? 'Rewrite clearly.'
      : 'The team will ship Friday.'
    : fixture.id === 'synthetic-anchor-001'
      ? `${fixture.sourceText} Keep the wording direct.`
      : `${fixture.sourceText} Preserve the uncertainty and dependency.`;
  return {
    response: JSON.stringify({
      protocol: '2.0',
      mode: fixture.mode,
      language: fixture.language,
      status: 'ok',
      result,
    }),
  };
}
