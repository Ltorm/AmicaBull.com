// ===== AmicaBull Main JavaScript =====

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initFAQ();
  initPricingToggle();
  initScrollAnimations();
});

// ===== Navigation =====
function initNav() {
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');

  // Scroll behavior
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // Mobile menu toggle
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
      toggle.classList.toggle('active');
    });

    // Close on link click
    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.classList.remove('active');
      });
    });
  }
}

// ===== FAQ Accordion =====
function initFAQ() {
  const faqButtons = document.querySelectorAll('.faq-question');

  faqButtons.forEach(button => {
    button.addEventListener('click', () => {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      const answer = button.nextElementSibling;

      // Close all
      faqButtons.forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        btn.nextElementSibling.style.maxHeight = '0';
      });

      // Open clicked (if it was closed)
      if (!isExpanded) {
        button.setAttribute('aria-expanded', 'true');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}

// ===== Pricing Toggle =====
function initPricingToggle() {
  const toggle = document.getElementById('pricingToggle');
  const monthlyLabel = document.getElementById('monthlyLabel');
  const annualLabel = document.getElementById('annualLabel');
  const monthlyPrices = document.querySelectorAll('.monthly-price');
  const annualPrices = document.querySelectorAll('.annual-price');

  if (!toggle) return;

  let isAnnual = false;

  toggle.addEventListener('click', () => {
    isAnnual = !isAnnual;
    toggle.classList.toggle('active', isAnnual);
    monthlyLabel.classList.toggle('active', !isAnnual);
    annualLabel.classList.toggle('active', isAnnual);

    monthlyPrices.forEach(el => el.style.display = isAnnual ? 'none' : 'inline');
    annualPrices.forEach(el => el.style.display = isAnnual ? 'inline' : 'none');
  });
}

// ===== Scroll Animations =====
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll(
    '.problem-card, .step, .feature-card, .pricing-card, .testimonial-card, .faq-item'
  ).forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// Add CSS class for animation
const style = document.createElement('style');
style.textContent = `.animate-in { opacity: 1 !important; transform: translateY(0) !important; }`;
document.head.appendChild(style);

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== Form Validation Helper =====
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateForm(form) {
  let valid = true;
  const inputs = form.querySelectorAll('[required]');

  inputs.forEach(input => {
    input.style.borderColor = '';
    if (!input.value.trim()) {
      input.style.borderColor = 'var(--color-danger)';
      valid = false;
    }
    if (input.type === 'email' && !validateEmail(input.value)) {
      input.style.borderColor = 'var(--color-danger)';
      valid = false;
    }
  });

  return valid;
}
