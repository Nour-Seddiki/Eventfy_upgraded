/**
 * Header for the organizer & admin consoles (org-dashboard, new Event, Admin).
 * The attendee app lives at /index.html (Eventfy v4); these pages keep their
 * own UI and get this bar instead of the old site navbar.
 * Needs ../api.js (getCachedUser, clearToken) loaded first.
 */
(function () {
  'use strict';
  var slot = document.getElementById('console-bar');
  if (!slot) return;

  var user = (typeof getCachedUser === 'function' && getCachedUser()) || {};
  var role = (user.role || '').toLowerCase();
  var path = decodeURIComponent(window.location.pathname);

  var links = [
    { href: '../org-dashboard/index.html', label: 'Dashboard', match: '/org-dashboard/', roles: ['organizer'] },
    { href: '../new Event/index.html', label: 'New event', match: '/new Event/', roles: ['organizer'] },
    { href: '../Admin/admin.html', label: 'Admin panel', match: '/Admin/', roles: ['admin'] },
  ].filter(function (l) { return l.roles.indexOf(role) !== -1; });

  var mark = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="18" rx="4" fill="#7f0df2" opacity="0.15"></rect>' +
    '<path d="M8 2v4M16 2v4M3 10h18" stroke="#7f0df2" stroke-width="2" stroke-linecap="round"></path>' +
    '<circle cx="8" cy="15" r="1.5" fill="#7f0df2"></circle><circle cx="12" cy="15" r="1.5" fill="#7f0df2"></circle>' +
    '<circle cx="16" cy="15" r="1.5" fill="#7f0df2"></circle></svg>';

  slot.outerHTML =
    '<header class="console-bar"><div class="console-row">' +
      '<a class="console-logo" href="../index.html#/discover" aria-label="Eventfy home">' +
        '<span class="console-mark">' + mark + '</span><span class="console-word">Eventfy</span>' +
        (role ? '<span class="console-tag">' + (role === 'admin' ? 'Admin' : 'Organizer') + '</span>' : '') +
      '</a>' +
      '<nav class="console-nav" aria-label="Console">' +
        links.map(function (l) {
          var on = path.indexOf(l.match) !== -1;
          return '<a class="console-link' + (on ? ' active' : '') + '" href="' + l.href + '"' +
            (on ? ' aria-current="page"' : '') + '>' + l.label + '</a>';
        }).join('') +
      '</nav>' +
      '<div class="console-right">' +
        '<a class="console-back" href="../index.html#/discover">←<span>&nbsp;Back to Eventfy</span></a>' +
        '<button class="console-out" type="button" id="consoleLogout">Log out</button>' +
      '</div>' +
    '</div></header>';

  // The admin layout already offsets itself by the header height.
  if (!document.querySelector('.admin-layout')) document.body.classList.add('has-console-bar');

  document.getElementById('consoleLogout').addEventListener('click', function () {
    if (typeof clearToken === 'function') clearToken();
    window.location.href = '../index.html#/signin';
  });
})();
