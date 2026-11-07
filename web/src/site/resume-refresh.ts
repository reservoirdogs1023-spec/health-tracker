export type VisibilitySource = EventTarget & {
  readonly visibilityState: DocumentVisibilityState;
};

export function refreshDashboardWhenVisible(
  source: VisibilitySource,
  refresh: () => void | Promise<void>,
): () => void {
  const handleVisibilityChange = () => {
    if (source.visibilityState === 'visible') {
      void refresh();
    }
  };

  source.addEventListener('visibilitychange', handleVisibilityChange);
  return () => source.removeEventListener('visibilitychange', handleVisibilityChange);
}
