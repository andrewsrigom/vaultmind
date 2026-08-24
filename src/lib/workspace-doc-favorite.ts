type UpdateWorkspaceDocFavoriteInput = {
  docId: string;
  isFavorite: boolean;
  vaultId: string;
};

type WorkspaceDocFavoriteMutationDoc = {
  id: string;
  isFavorite: boolean;
};

type WorkspaceDocFavoriteMutationResponse =
  | {
      doc: WorkspaceDocFavoriteMutationDoc;
      ok: true;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

export async function updateWorkspaceDocFavorite({
  docId,
  isFavorite,
  vaultId,
}: UpdateWorkspaceDocFavoriteInput): Promise<WorkspaceDocFavoriteMutationDoc> {
  const response = await fetch(`/api/vault/${vaultId}/docs/${docId}/favorite`, {
    body: JSON.stringify({
      isFavorite,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  });
  const payload = (await response.json()) as WorkspaceDocFavoriteMutationResponse;

  if (!payload.ok) {
    throw new Error(payload.error.message);
  }

  return payload.doc;
}
