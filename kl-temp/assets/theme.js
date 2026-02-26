// KeepLiving Theme JavaScript
(function() {
  'use strict';

  // Cart functionality
  window.cartFunctions = {
    updateCartCount: function(count) {
      const counters = document.querySelectorAll('[data-cart-count]');
      counters.forEach(counter => {
        counter.textContent = count;
      });
    }
  };

  // Mobile menu toggle
  document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.querySelector('.header__menu-toggle');
    const mobileMenu = document.querySelector('.header__mobile-menu');
    
    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', function() {
        mobileMenu.classList.toggle('is-open');
        menuToggle.classList.toggle('is-active');
      });
    }
  });

  // Announcement bar close
  document.addEventListener('DOMContentLoaded', function() {
    const closeBtn = document.querySelector('.announcement-bar__close');
    const announcementBar = document.querySelector('.announcement-bar');
    
    if (closeBtn && announcementBar) {
      closeBtn.addEventListener('click', function() {
        announcementBar.style.display = 'none';
      });
    }
  });
})();
