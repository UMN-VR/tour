/** Visibility comes from the shared workspace, not DOM polling or a second clock. */
export function createCampusTabVisibility() {
  const visible = new Set<string>();
  const changes = new Set<() => void>();
  const shown = new Map<string, Set<() => void>>();
  let disposed = false;
  return {
    isVisible: (id: string): boolean => visible.has(id),
    setVisible(id: string, value: boolean): void {
      if (disposed || visible.has(id) === value) return;
      if (value) visible.add(id); else visible.delete(id);
      for (const listener of [...changes]) listener();
      if (value) for (const listener of [...shown.get(id) ?? []]) listener();
    },
    subscribe(listener: () => void): () => void {
      if (disposed) return () => {};
      changes.add(listener);
      return () => { changes.delete(listener); };
    },
    /** Adapt directly to the public About visibility contract. */
    whenShown(id: string) {
      return (_element: HTMLElement, listener: () => void): (() => void) => {
        if (disposed) return () => {};
        const listeners = shown.get(id) ?? new Set<() => void>();
        shown.set(id, listeners);
        listeners.add(listener);
        if (visible.has(id)) listener();
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) shown.delete(id);
        };
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      visible.clear(); changes.clear(); shown.clear();
    },
  };
}
