// Runs before first paint to avoid a theme flash.
(function () {
  var t = localStorage.getItem('theme');
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();
