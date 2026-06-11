document.addEventListener('DOMContentLoaded', function setupMobileShell() {
  var body = document.body;
  var sidebar = document.getElementById('sidebar');
  var rightPanel = document.getElementById('right-panel');
  var scrim = document.getElementById('mobile-panel-scrim');
  var btnModules = document.getElementById('btn-toggle-modules');
  var btnPanel = document.getElementById('btn-toggle-panel');

  if (!body || !sidebar || !rightPanel || !scrim || !btnModules || !btnPanel) {
    return;
  }

  function closePanels() {
    body.classList.remove('show-mobile-modules');
    body.classList.remove('show-mobile-workspace');
  }

  function toggleModules() {
    body.classList.toggle('show-mobile-modules');
    body.classList.remove('show-mobile-workspace');
  }

  function toggleWorkspace() {
    body.classList.toggle('show-mobile-workspace');
    body.classList.remove('show-mobile-modules');
  }

  btnModules.addEventListener('click', toggleModules);
  btnPanel.addEventListener('click', toggleWorkspace);
  scrim.addEventListener('click', closePanels);

  window.addEventListener('resize', function handleResize() {
    if (window.innerWidth > 980) {
      closePanels();
    }
  });

  sidebar.addEventListener('click', function maybeCloseModules(event) {
    if (window.innerWidth > 980) return;
    if (event.target.closest('.module-item')) {
      closePanels();
    }
  });

  rightPanel.addEventListener('click', function maybeCloseWorkspace(event) {
    if (window.innerWidth > 980) return;
    if (event.target.closest('.session-item') || event.target.closest('.copy-btn')) {
      closePanels();
    }
  });
});
