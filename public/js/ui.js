// small ui restructuring on top of the serene theme, kept out of the theme
// templates so the submodule stays unforked where possible
(function () {
  'use strict';

  // move the theme's "back" link into the page title as a bare arrow; it
  // keeps the theme's per-page href (posts list vs home)
  function relocateBackLink() {
    var back = document.getElementById('back-link');
    if (!back) return;
    var title = document.querySelector('.section-title h1') ||
      document.querySelector('main h1') ||
      // the about page titles itself with a markdown h2 and has no h1
      document.querySelector('main h2');
    if (!title) return;
    var header = back.closest('header');
    back.textContent = '←';
    back.setAttribute('aria-label', 'back');
    back.classList.add('back-arrow');
    title.insertBefore(back, title.firstChild);
    if (header) header.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', relocateBackLink);
  } else {
    relocateBackLink();
  }
})();
