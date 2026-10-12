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

    form.addEventListener("submit", async (e) => {
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

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="loading-spinner" style="width:14px;height:14px;"></span> Signing in…`;
      }

      const result = await RTS.auth.login(email, password, remember);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Sign In`;
      }

      if (!result.ok) {
        RTS.toast(result.error, "error");
        setFieldError(passField, result.error);
        return;
      }
      RTS.toast("Welcome back! Redirecting to your dashboard…", "success");
      setTimeout(() => (window.location.href = "dashboard.html"), 400);
    });

    const demoBtn = document.getElementById("fillDemoBtn");
    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        document.getElementById("loginEmail").value = "elakkiyaohai@gmail.com";
        document.getElementById("loginPassword").value = "Admin@1234";
        RTS.toast("Primary Admin credentials filled in.", "info");
      });
    }

    document.querySelectorAll(".demo-role-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const email = chip.getAttribute("data-email");
        const pass = chip.getAttribute("data-pass");
        document.getElementById("loginEmail").value = email;
        document.getElementById("loginPassword").value = pass;
        const roleLabel = chip.querySelector(".role-pill-badge")
          ? chip.querySelector(".role-pill-badge").textContent
          : "User";
        RTS.toast(`Selected ${roleLabel} credentials (${email}).`, "info");
      });
    });
  }

  async function initRegisterPage() {
    const form = document.getElementById("registerForm");
    if (!form) return;

    RTS.auth.redirectIfAuthed();
    wireShowHide();

    // Check for ?invite=token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get("invite");
    if (inviteToken) {
      const banner = document.getElementById("inviteBanner");
      const tokenInput = document.getElementById("inviteTokenInput");
      if (tokenInput) tokenInput.value = inviteToken;

      try {
        const res = await fetch(RTS.apiUrl(`/api/auth/invite-info/${encodeURIComponent(inviteToken)}`));
        const data = await res.json();
        if (data.ok && data.invitation) {
          const inv = data.invitation;
          if (banner) {
            banner.style.display = "block";
            const badge = document.getElementById("invitedRoleBadge");
            if (badge) {
              badge.textContent = inv.role;
              badge.className = `role-pill-badge role-${inv.role.toLowerCase()}`;
            }
          }
          if (inv.email) {
            const emailInput = document.getElementById("regEmail");
            if (emailInput) {
              emailInput.value = inv.email;
              emailInput.readOnly = true;
              emailInput.style.opacity = "0.8";
            }
          }
          if (inv.fullName) {
            const nameInput = document.getElementById("regName");
            if (nameInput) nameInput.value = inv.fullName;
          }
        }
      } catch (err) {
        console.warn("Could not fetch invitation info:", err);
      }
    }

    form.addEventListener("submit", async (e) => {
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
      const inviteTokenVal = (document.getElementById("inviteTokenInput") && document.getElementById("inviteTokenInput").value) || "";

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

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="loading-spinner" style="width:14px;height:14px;"></span> Creating Account…`;
      }

      const result = await RTS.auth.registerAccount({
        fullName,
        email,
        mobile,
        password,
        inviteToken: inviteTokenVal,
      });

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Create Account`;
      }

      if (!result.ok) {
        RTS.toast(result.error, "error");
        setFieldError(emailField, result.error);
        return;
      }

      RTS.toast("Account created successfully! Please sign in.", "success");
      setTimeout(() => (window.location.href = "login.html"), 600);
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
