/* ==========================================================================
   auth.js — Login & Register page behavior
   ========================================================================== */

(function () {
  "use strict";

  function wireShowHide() {
    document.querySelectorAll(".toggle-visibility").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.innerHTML = isPassword
          ? '<i data-lucide="eye-off" class="icon"></i>'
          : '<i data-lucide="eye" class="icon"></i>';
        RTS.refreshIcons();
      });
    });
  }

  function setFieldError(fieldEl, message) {
    fieldEl.classList.toggle("has-error", !!message);
    const msgEl = fieldEl.querySelector(".error-msg");
    if (msgEl && message) msgEl.textContent = message;
  }

  function clearErrors(form) {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("has-error"));
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  const MOBILE_RE = /^[+]?[\d\s\-()]{7,16}$/;

  function initLoginPage() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    RTS.auth.redirectIfAuthed();

    const rememberedEmail = localStorage.getItem(RTS.KEYS.REMEMBER);
    if (rememberedEmail) {
      document.getElementById("loginEmail").value = rememberedEmail;
      document.getElementById("rememberMe").checked = true;
    }

    wireShowHide();

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearErrors(form);

      const emailField = document.getElementById("loginEmailField");
      const passField = document.getElementById("loginPasswordField");
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const remember = document.getElementById("rememberMe").checked;

      let valid = true;
      if (!EMAIL_RE.test(email)) {
        setFieldError(emailField, "Enter a valid email address.");
        valid = false;
      }
      if (!password) {
        setFieldError(passField, "Password is required.");
        valid = false;
      }
      if (!valid) return;

      const result = RTS.auth.login(email, password, remember);
      if (!result.ok) {
        RTS.toast(result.error, "error");
        setFieldError(passField, result.error);
        return;
      }
      RTS.toast("Welcome back! Redirecting to your dashboard…", "success");
      setTimeout(() => (window.location.href = "dashboard.html"), 600);
    });

    const demoBtn = document.getElementById("fillDemoBtn");
    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        document.getElementById("loginEmail").value = "demo@renewaltrack.com";
        document.getElementById("loginPassword").value = "Demo@1234";
        RTS.toast("Demo credentials filled in.", "info");
      });
    }
  }

  function initRegisterPage() {
    const form = document.getElementById("registerForm");
    if (!form) return;

    RTS.auth.redirectIfAuthed();
    wireShowHide();

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearErrors(form);

      const nameField = document.getElementById("regNameField");
      const emailField = document.getElementById("regEmailField");
      const mobileField = document.getElementById("regMobileField");
      const passField = document.getElementById("regPasswordField");
      const confirmField = document.getElementById("regConfirmField");
      const termsField = document.getElementById("regTermsField");

      const fullName = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const mobile = document.getElementById("regMobile").value.trim();
      const password = document.getElementById("regPassword").value;
      const confirm = document.getElementById("regConfirm").value;
      const terms = document.getElementById("regTerms").checked;

      let valid = true;

      if (fullName.length < 2) {
        setFieldError(nameField, "Enter your full name.");
        valid = false;
      }
      if (!EMAIL_RE.test(email)) {
        setFieldError(emailField, "Enter a valid email address.");
        valid = false;
      }
      if (!MOBILE_RE.test(mobile)) {
        setFieldError(mobileField, "Enter a valid mobile number.");
        valid = false;
      }
      if (password.length < 8) {
        setFieldError(passField, "Password must be at least 8 characters.");
        valid = false;
      }
      if (confirm !== password || !confirm) {
        setFieldError(confirmField, "Passwords do not match.");
        valid = false;
      }
      if (!terms) {
        setFieldError(termsField, "You must accept the Terms & Conditions.");
        valid = false;
      }
      if (!valid) return;

      const result = RTS.auth.registerAccount({ fullName, email, mobile, password });
      if (!result.ok) {
        RTS.toast(result.error, "error");
        setFieldError(emailField, result.error);
        return;
      }

      RTS.toast("Account created! Please sign in.", "success");
      setTimeout(() => (window.location.href = "login.html"), 700);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.ensureSeed();
    RTS.settings.applyTheme(RTS.settings.getSettings().theme);
    initLoginPage();
    initRegisterPage();
    RTS.refreshIcons();
  });
})();
