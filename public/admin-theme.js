(function () {
  try {
    var stored = localStorage.getItem('pft-admin-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
