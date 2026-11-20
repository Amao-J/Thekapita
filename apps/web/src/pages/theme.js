(function () {
  const STORAGE_KEY = 'kapita_theme';

  const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
  const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function readSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {}

    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) {}

    return 'light';
  }

  function applyThemeToDOM(theme) {
    const mode = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    return mode;
  }

  function syncToggleButtons(theme) {
    const isDark = theme === 'dark';
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');

      // Only replace innerHTML if the button has no custom child elements or is empty
      if (!btn.dataset.customIcon) {
        btn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
      } else {
        const moon = btn.querySelector('.theme-icon-moon');
        const sun = btn.querySelector('.theme-icon-sun');
        if (moon) moon.hidden = isDark;
        if (sun) sun.hidden = !isDark;
      }
    });
  }

  function setTheme(theme) {
    const mode = applyThemeToDOM(theme);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (_) {}
    syncToggleButtons(mode);
    window.dispatchEvent(new CustomEvent('kapita:themechange', { detail: { theme: mode } }));
    return mode;
  }

  function getTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function toggleTheme() {
    return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  // Apply immediately before first paint
  const initialTheme = applyThemeToDOM(readSavedTheme());

  document.addEventListener('DOMContentLoaded', () => {
    syncToggleButtons(getTheme());
  });

  document.addEventListener('click', (event) => {
    const toggleBtn = event.target.closest('[data-theme-toggle]');
    if (!toggleBtn) return;
    event.preventDefault();
    event.stopPropagation();
    toggleTheme();
  });

  // Sync across open tabs/pages if toggled elsewhere
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && (event.newValue === 'dark' || event.newValue === 'light')) {
      applyThemeToDOM(event.newValue);
      syncToggleButtons(event.newValue);
    }
  });

  window.KapitaTheme = {
    get: getTheme,
    set: setTheme,
    toggle: toggleTheme,
    sync: () => syncToggleButtons(getTheme()),
  };
  window.toggleTheme = toggleTheme;
  window.setTheme = setTheme;

  // Expose initial state hook
  if (initialTheme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  }
})();