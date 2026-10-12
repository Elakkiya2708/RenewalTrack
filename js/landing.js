/* ==========================================================================
   landing.js — Marketing page behavior (index.html)
   ========================================================================== */

(function () {
  "use strict";

  function wireMobileNav() {
    const toggle = document.getElementById("lpNavToggle");
    const menu = document.getElementById("lpMobileMenu");
    if (!toggle || !menu) return;
    toggle.addEventListener("click", () => {
      menu.classList.toggle("open");
    });
    menu.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => menu.classList.remove("open"))
    );
  }

  function wireFaqAccordion() {
    document.querySelectorAll(".lp-faq-item").forEach((item) => {
      const question = item.querySelector(".lp-faq-question");
      question.addEventListener("click", () => {
        const isOpen = item.classList.contains("open");
        document.querySelectorAll(".lp-faq-item.open").forEach((i) => i.classList.remove("open"));
        if (!isOpen) item.classList.add("open");
      });
    });
  }

  // If the visitor already has a session, swap the Login/Get Started actions
  // for a single "Go to Dashboard" shortcut instead of asking them to log in
  // again.
  function wireAuthAwareNav() {
    if (!window.RTS || !RTS.auth.isLoggedIn()) return;
    // Desktop + mobile: turn "Login" into "Dashboard" and hide the sign-up CTA
    document.querySelectorAll("[data-login-link]").forEach((el) => {
      el.textContent = "Go to Dashboard";
      el.setAttribute("href", "dashboard.html");
    });
    document.querySelectorAll("[data-signup-link]").forEach((el) => {
      el.classList.add("hidden");
    });
  }

  function wireSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href").slice(1);
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (window.RTS) {
      RTS.ensureSeed();
      RTS.settings.applyTheme(RTS.settings.getSettings().theme);
    }
    wireMobileNav();
    wireFaqAccordion();
    wireAuthAwareNav();
    wireSmoothScroll();
    if (window.RTS) RTS.refreshIcons();
  });
})();
