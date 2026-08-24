import { z } from 'zod';

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
});

const githubEnvSchema = z.object({
  GITHUB_TOKEN: z.string().trim().min(1),
});

const githubOAuthEnvSchema = z.object({
  GITHUB_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().trim().min(1),
  GITHUB_REDIRECT_URI: z.string().trim().url(),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_CHAT_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
});

const sourceCredentialEncryptionEnvSchema = z.object({
  SOURCE_CREDENTIAL_ENCRYPTION_KEY: z.string().trim().min(32),
});

const unsafeProductionSourceCredentialKeys = new Set([
  'at-least-32-characters-for-local-dev',
  'replace-with-a-different-random-secret',
]);

const notionOAuthEnvSchema = z.object({
  NOTION_OAUTH_CLIENT_ID: z.string().trim().min(1),
  NOTION_OAUTH_CLIENT_SECRET: z.string().trim().min(1),
  NOTION_REDIRECT_URI: z.string().trim().url(),
});

const googleDriveOAuthEnvSchema = z.object({
  GOOGLE_DRIVE_OAUTH_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: z.string().trim().min(1),
  GOOGLE_DRIVE_REDIRECT_URI: z.string().trim().url(),
});

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  GITHUB_TOKEN: z.string().trim().min(1),
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_CHAT_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type GitHubEnv = z.infer<typeof githubEnvSchema>;
export type GitHubOAuthEnv = z.infer<typeof githubOAuthEnvSchema>;
export type OpenAIEnv = z.infer<typeof openAIEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type NotionOAuthEnv = z.infer<typeof notionOAuthEnvSchema>;
export type GoogleDriveOAuthEnv = z.infer<typeof googleDriveOAuthEnvSchema>;
export type SourceCredentialEncryptionEnv = z.infer<typeof sourceCredentialEncryptionEnvSchema>;

export function getDatabaseEnv(input: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  return databaseEnvSchema.parse(input);
}

export function getGitHubEnv(input: NodeJS.ProcessEnv = process.env): GitHubEnv {
  return githubEnvSchema.parse(input);
}

export function getGitHubOAuthEnv(input: NodeJS.ProcessEnv = process.env): GitHubOAuthEnv {
  return githubOAuthEnvSchema.parse(input);
}

export function getOpenAIEnv(input: NodeJS.ProcessEnv = process.env): OpenAIEnv {
  return openAIEnvSchema.parse(input);
}

export function getNotionOAuthEnv(input: NodeJS.ProcessEnv = process.env): NotionOAuthEnv {
  return notionOAuthEnvSchema.parse(input);
}

export function getGoogleDriveOAuthEnv(
  input: NodeJS.ProcessEnv = process.env,
): GoogleDriveOAuthEnv {
  return googleDriveOAuthEnvSchema.parse(input);
}

export function getServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(input);
}

export function getSourceCredentialEncryptionEnv(
  input: NodeJS.ProcessEnv = process.env,
): SourceCredentialEncryptionEnv {
  const parsedEnv = sourceCredentialEncryptionEnvSchema.parse(input);

  if (
    input.NODE_ENV === 'production' &&
    unsafeProductionSourceCredentialKeys.has(parsedEnv.SOURCE_CREDENTIAL_ENCRYPTION_KEY)
  ) {
    throw new Error(
      'SOURCE_CREDENTIAL_ENCRYPTION_KEY must not use a documented development placeholder in production.',
    );
  }

  return parsedEnv;
}
