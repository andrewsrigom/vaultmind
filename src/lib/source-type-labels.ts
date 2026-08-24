import type { WorkspaceSourceType } from '@/db/schema';

export type WorkspaceSourceTypeLabels = {
  github: string;
  googleDrive: string;
  notion: string;
  workspaceDoc: string;
};

const defaultWorkspaceSourceTypeLabels = {
  github: 'GitHub',
  googleDrive: 'Google Drive',
  notion: 'Notion',
  workspaceDoc: 'Internal doc',
} satisfies WorkspaceSourceTypeLabels;

export function getWorkspaceSourceTypeLabel(
  sourceType: WorkspaceSourceType,
  labels: WorkspaceSourceTypeLabels = defaultWorkspaceSourceTypeLabels,
): string {
  const sourceTypeLabelByType = {
    github: labels.github,
    'google-drive': labels.googleDrive,
    notion: labels.notion,
    'workspace-doc': labels.workspaceDoc,
  } satisfies Record<WorkspaceSourceType, string>;

  return sourceTypeLabelByType[sourceType];
}
