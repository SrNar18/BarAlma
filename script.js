// NAV scroll effect
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
});

// Hero parallax & load
document.querySelector('.hero').classList.add('loaded');

// Smooth scroll
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: 'smooth' });
}

// Hamburger / mobile menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

function closeMobileMenu() {
  mobileMenu.classList.remove('open');
}

// Close mobile menu on outside click
document.addEventListener('click', (e) => {
  if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
    closeMobileMenu();
  }
});

// Menu tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.menu__panel').forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    document.querySelector(`[data-panel="${target}"]`).classList.add('active');
  });
});

// Scroll reveal
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(
  '.about__inner, .menu__header, .dish-card, .exp-card, .gallery__item, .reservations__text, .reservation-form, .footer__top'
).forEach(el => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// Toast notification
function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// Form submission
document.getElementById('reservationForm').addEventListener('submit', (e) => {
  e.preventDefault();
  showToast();
  e.target.reset();
});

// Marquee strip — el contenido ya está duplicado en el HTML para el loop

// Set min date for date input to today
const dateInput = document.getElementById('date');
if (dateInput) {
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
}

// Active nav link on scroll
const sections = document.querySelectorAll('section[id], footer[id]');
const navLinks = document.querySelectorAll('.nav__links a');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach(link => {
        link.style.color = '';
        link.style.opacity = '';
        if (link.getAttribute('href') === `#${id}`) {
          link.style.color = 'var(--gold)';
          link.style.opacity = '1';
        }
      });
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => sectionObserver.observe(s));
