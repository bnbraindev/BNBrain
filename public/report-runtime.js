(() => {
  const THEME_KEY = 'bnb-report-theme';
  const LANG_KEY = 'bnb-report-lang';

  const themeToggle = document.getElementById('theme-toggle');
  const langToggle = document.getElementById('lang-toggle');
  if (!(themeToggle instanceof HTMLInputElement) || !(langToggle instanceof HTMLInputElement)) {
    return;
  }

  const media = window.matchMedia('(prefers-color-scheme: light)');

  const readStorage = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const writeStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures.
    }
  };

  const storedTheme = readStorage(THEME_KEY);
  const storedLang = readStorage(LANG_KEY);

  themeToggle.checked = storedTheme
    ? storedTheme === 'light'
    : media.matches;
  langToggle.checked = storedLang
    ? storedLang === 'en'
    : !/^zh/i.test(navigator.language || '');

  themeToggle.addEventListener('change', () => {
    writeStorage(THEME_KEY, themeToggle.checked ? 'light' : 'dark');
  });

  langToggle.addEventListener('change', () => {
    writeStorage(LANG_KEY, langToggle.checked ? 'en' : 'zh');
  });

  const handleSystemTheme = (event) => {
    if (!readStorage(THEME_KEY)) {
      themeToggle.checked = event.matches;
    }
  };
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleSystemTheme);
  } else if (typeof media.addListener === 'function') {
    media.addListener(handleSystemTheme);
  }

  const setCopiedState = (node) => {
    node.classList.add('ok');
    window.setTimeout(() => {
      node.classList.remove('ok');
    }, 1200);
  };

  const copyText = (text, stateNode) => {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopiedState(stateNode))
      .catch(() => {
        // Ignore clipboard errors.
      });
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const copyTrigger = target.closest('[data-copy]');
    if (copyTrigger) {
      event.preventDefault();
      const text = copyTrigger.getAttribute('data-copy');
      if (!text) return;
      const stateNode = copyTrigger.closest('.cp') ?? copyTrigger;
      copyText(text, stateNode);
      return;
    }

    const shareTrigger = target.closest('[data-share-report]');
    if (shareTrigger) {
      event.preventDefault();
      copyText(window.location.href, shareTrigger);
    }
  });
})();
