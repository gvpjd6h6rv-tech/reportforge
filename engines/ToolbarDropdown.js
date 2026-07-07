'use strict';

/* Toolbar dropdown toggle for "Alinear ▾" / "Tamaño ▾" in #tb2.
   Panels (#dd-tdd-*) use .dropdown so MenuEngine.closeAll() covers them.
   MutationObserver keeps .active in sync when panels close externally.
   Extracted verbatim from the shell HTML's inline <script> (no behavior
   change) to keep the shell under its governance size/purity thresholds. */
(function () {
  function init() {
    document.querySelectorAll('.tb-dd-btn[data-dd]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var panel = document.getElementById('dd-tdd-' + btn.dataset.dd);
        if (!panel) return;
        var opening = !panel.classList.contains('visible');
        document.querySelectorAll('.dropdown').forEach(function (d) { d.classList.remove('visible'); });
        document.querySelectorAll('.tb-dd-btn').forEach(function (b) { b.classList.remove('active'); });
        if (typeof MenuEngine !== 'undefined') MenuEngine._open = null;
        if (opening) {
          var r = btn.getBoundingClientRect();
          panel.style.left = r.left + 'px';
          panel.style.top = r.bottom + 'px';
          panel.classList.add('visible');
          btn.classList.add('active');
        }
      });
    });
    ['alinear', 'tamano', 'texto-h', 'texto-v'].forEach(function (name) {
      var panel = document.getElementById('dd-tdd-' + name);
      var btn   = document.getElementById('tdd-btn-' + name);
      if (panel && btn) {
        new MutationObserver(function () {
          btn.classList.toggle('active', panel.classList.contains('visible'));
        }).observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
