const editorLayoutStorageKey = 'vaultmind:workspace-doc-editor-layout';
const editorSubpathButtonsStorageKey = 'vaultmind:workspace-doc-subpath-buttons';
const editorLayoutChangeEventName = 'vaultmind-editor-layout-change';

function emitWorkspaceDocEditorLayoutChange() {
  window.dispatchEvent(new Event(editorLayoutChangeEventName));
}

export function getStoredWorkspaceDocEditorWide() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(editorLayoutStorageKey) === 'wide';
}

export function getStoredWorkspaceDocSubpathButtonsHidden() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(editorSubpathButtonsStorageKey) === 'hidden';
}

export function subscribeWorkspaceDocEditorLayoutChange(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener('storage', onStoreChange);
  window.addEventListener(editorLayoutChangeEventName, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(editorLayoutChangeEventName, onStoreChange);
  };
}

export function setStoredWorkspaceDocEditorWide(isWide: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(editorLayoutStorageKey, isWide ? 'wide' : 'default');
  emitWorkspaceDocEditorLayoutChange();
}

export function setStoredWorkspaceDocSubpathButtonsHidden(areHidden: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(editorSubpathButtonsStorageKey, areHidden ? 'hidden' : 'visible');
  emitWorkspaceDocEditorLayoutChange();
}
