import { seedRagDemo } from './rag-demo-fixture';

async function main() {
  const result = await seedRagDemo();
  const expectedSourceTypes = ['github', 'google-drive', 'notion'];

  if (result.messageCount !== 2) {
    throw new Error(`Expected two saved chat messages, received ${result.messageCount}.`);
  }

  if (result.sourceCount !== expectedSourceTypes.length) {
    throw new Error(
      `Expected ${expectedSourceTypes.length} cited sources, received ${result.sourceCount}.`,
    );
  }

  if (JSON.stringify(result.sourceTypes) !== JSON.stringify(expectedSourceTypes)) {
    throw new Error(`Unexpected source types: ${result.sourceTypes.join(', ')}.`);
  }

  if (
    !result.answer.includes('[1]') ||
    !result.answer.includes('[2]') ||
    !result.answer.includes('[3]')
  ) {
    throw new Error('The demo answer did not preserve all three citation markers.');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        citationMarkersVerified: true,
        messageCount: result.messageCount,
        sourceCount: result.sourceCount,
        sourceTypes: result.sourceTypes,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown RAG demo smoke error.';

    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
