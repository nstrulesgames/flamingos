/* Run before styles so the saved appearance is applied before the first paint. */
(() => {
  const key = 'flamingo-appearance';
  const modes = ['light', 'dark', 'system'];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch { /* Appearance remains usable when browser storage is unavailable. */ }

  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#21151c' : '#fff5ef');
    document.querySelectorAll('[data-theme-preference]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themePreference === preference));
    });
  }

  window.FlamingoTheme = {
    get preference() { return preference; },
    set(value) {
      if (!modes.includes(value)) return;
      preference = value;
      try { localStorage.setItem(key, value); } catch { /* Keep the current selection for this session. */ }
      apply();
    }
  };
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = modes.includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
  apply();
})();
