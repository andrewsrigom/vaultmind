import { seedRagDemo } from './rag-demo-fixture';

async function main() {
  const result = await seedRagDemo();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown demo seed error.';

    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
