// Only editor preferences cross the source sandbox boundary, never site storage.
export const studioPreferenceKeys = [
  'prion-open-pages',
  'react-resizable-panels:prion-studio-panels-v2:layers:canvas:inspector',
];
const memory = new Map<string, string>();
export const studioStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    const bridge = (window as any).__studioPreferences;
    if (bridge) return bridge.getItem(key);
    try {
      return localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
    if (typeof window === 'undefined') return;
    const bridge = (window as any).__studioPreferences;
    if (bridge) {
      bridge.setItem(key, value);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Memory survives page switches. */
    }
  },
};
