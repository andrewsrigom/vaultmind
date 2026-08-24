import { hashLocalAccessPassword } from '@/lib/access/local-access';

const password = process.env.VAULTMIND_ACCESS_PASSWORD;

if (!password) {
  throw new Error(
    'Set VAULTMIND_ACCESS_PASSWORD for this command only, then run `pnpm access:hash-password`.',
  );
}

const passwordHash = await hashLocalAccessPassword(password);

process.stdout.write(`${passwordHash}\n`);
