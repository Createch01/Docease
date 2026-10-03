// Les services de l'application supposent un navigateur (window, localStorage) dès leur import.
const store = new Map<string, string>();
const g = globalThis as any;
g.window = g.window ?? g;
g.localStorage = g.localStorage ?? {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
};
