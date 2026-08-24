export const syncSourceTypes = ['github', 'notion', 'google-drive'] as const;

export type SyncSourceType = (typeof syncSourceTypes)[number];
export type SourceType = SyncSourceType | 'workspace-doc';

export type SourceCredentialSecret = {
  accessToken: string;
  expiresAt?: Date | null;
  refreshToken?: string | null;
};

export type SourceDocument = {
  content: string;
  contentHash: string;
  externalId: string;
  externalUrl?: string;
  metadata?: Record<string, unknown>;
  path: string;
  title: string;
  updatedAt?: string;
};

export type SourceSyncResult = {
  documents: SourceDocument[];
  externalVersion?: string;
  metadata?: Record<string, unknown>;
};

export type SourceSelectableResource = {
  externalId: string;
  lastEditedTime?: string;
  title: string;
  type: string;
  url?: string;
};

export type SourceAdapterContext = {
  credential?: SourceCredentialSecret;
};

export type SourceAdapter<TConfig = unknown> = {
  loadDocuments(config: TConfig, context?: SourceAdapterContext): Promise<SourceSyncResult>;
  listResources?(context: SourceAdapterContext): Promise<SourceSelectableResource[]>;
  type: SyncSourceType;
};

export function isSyncSourceType(sourceType: SourceType): sourceType is SyncSourceType {
  return syncSourceTypes.includes(sourceType as SyncSourceType);
}
