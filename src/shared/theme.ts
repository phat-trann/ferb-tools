namespace FerbToolsTheme {
  type ThemePreference = 'system' | 'light' | 'dark';

  const STORAGE_KEY = 'ferbToolsTheme';
  const systemTheme: MediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  let preference: ThemePreference = readPreference();
  let themeSelect: HTMLSelectElement | null = null;

  applyTheme();

  systemTheme.addEventListener('change', (): void => {
    if (preference === 'system') {
      applyTheme();
    }
  });

  window.addEventListener('storage', (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY || event.key === null) {
      preference = readPreference();
      applyTheme();
      if (themeSelect) {
        themeSelect.value = preference;
      }
    }
  });

  document.addEventListener('DOMContentLoaded', (): void => {
    const select: HTMLElement | null = document.getElementById('theme-preference');
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    themeSelect = select;
    select.value = preference;
    select.addEventListener('change', (): void => {
      preference = normalizePreference(select.value);
      applyTheme();

      try {
        window.localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        const status: HTMLElement | null = document.getElementById('theme-status');
        if (status) {
          status.textContent = 'Không lưu được giao diện. Lựa chọn chỉ áp dụng lần mở này.';
        }
      }
    });
  });

  function applyTheme(): void {
    const isDark: boolean = preference === 'dark' || (preference === 'system' && systemTheme.matches);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }

  function readPreference(): ThemePreference {
    try {
      return normalizePreference(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'system';
    }
  }

  function normalizePreference(value: unknown): ThemePreference {
    return value === 'light' || value === 'dark' ? value : 'system';
  }
}
