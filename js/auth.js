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
        const inv = data && (data.invitation || data.invite);
        if (data && data.ok && inv) {
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
          RTS.refreshIcons();
        } else {
          if (banner) {
            banner.style.display = "block";
            banner.style.background = "rgba(239, 68, 68, 0.1)";
            banner.style.borderColor = "rgba(239, 68, 68, 0.3)";
            banner.innerHTML = `
              <div style="font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:2px;color:var(--danger, #ef4444);">
                <i data-lucide="alert-triangle" class="icon" style="width:14px;height:14px;"></i>
                Invalid or Expired Invitation
              </div>
              <div style="color:var(--text);font-size:12px;">${(data && data.error) || "This invitation link is invalid or has expired. Please ask your administrator to send a new invite."}</div>
            `;
            if (tokenInput) tokenInput.value = "";
            RTS.refreshIcons();
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

  function initForgotPasswordPage() {
    const form = document.getElementById("forgotPasswordForm");
    if (!form) return;

    RTS.auth.redirectIfAuthed();

    const emailInput = document.getElementById("forgotEmail");
    const emailField = document.getElementById("forgotEmailField");
    const formContainer = document.getElementById("forgotFormContainer");
    const successContainer = document.getElementById("forgotSuccessContainer");
    const sentEmailSpan = document.getElementById("sentEmailAddress");

    const params = new URLSearchParams(window.location.search);
    const paramEmail = params.get("email");
    if (paramEmail && emailInput) {
      emailInput.value = paramEmail;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(form);

      const email = (emailInput?.value || "").trim();
      if (!EMAIL_RE.test(email)) {
        setFieldError(emailField, "Enter a valid email address.");
        return;
      }

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="loading-spinner" style="width:14px;height:14px;"></span> Sending Link…`;
      }

      const result = await RTS.auth.requestPasswordReset(email);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Send Reset Link`;
      }

      if (sentEmailSpan) sentEmailSpan.textContent = email;
      if (formContainer) formContainer.style.display = "none";
      if (successContainer) {
        successContainer.style.display = "block";
      } else {
        RTS.toast(result.message, "success");
      }
      RTS.refreshIcons();
    });
  }

  async function initResetPasswordPage() {
    const form = document.getElementById("resetPasswordForm");
    if (!form) return;

    wireShowHide();

    const loadingState = document.getElementById("resetLoadingState");
    const invalidState = document.getElementById("resetInvalidState");
    const invalidMessage = document.getElementById("resetInvalidMessage");
    const validState = document.getElementById("resetValidState");
    const successState = document.getElementById("resetSuccessState");
    const maskedEmailSpan = document.getElementById("resetMaskedEmail");

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      if (loadingState) loadingState.style.display = "none";
      if (invalidState) {
        invalidState.style.display = "block";
        if (invalidMessage) invalidMessage.textContent = "No password reset token was provided in the link. Please request a new reset email.";
      }
      RTS.refreshIcons();
      return;
    }

    const check = await RTS.auth.verifyResetToken(token);
    if (loadingState) loadingState.style.display = "none";

    if (!check.ok) {
      if (invalidState) {
        invalidState.style.display = "block";
        if (invalidMessage) invalidMessage.textContent = check.error || "This reset link is invalid, has expired, or has already been used.";
      }
      RTS.refreshIcons();
      return;
    }

    if (validState) validState.style.display = "block";
    if (maskedEmailSpan && check.maskedEmail) {
      maskedEmailSpan.textContent = check.maskedEmail;
    }
    RTS.refreshIcons();

    const newPassInput = document.getElementById("resetNewPassword");
    const confirmPassInput = document.getElementById("resetConfirmPassword");
    const newPassField = document.getElementById("resetNewPasswordField");
    const confirmPassField = document.getElementById("resetConfirmPasswordField");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(form);

      const newPass = newPassInput ? newPassInput.value : "";
      const confirmPass = confirmPassInput ? confirmPassInput.value : "";

      let valid = true;
      if (!newPass || newPass.length < 8) {
        setFieldError(newPassField, "Password must be at least 8 characters long.");
        valid = false;
      } else if (!/[A-Za-z]/.test(newPass) || !/[0-9]/.test(newPass)) {
        setFieldError(newPassField, "Password must contain both letters and numbers.");
        valid = false;
      }

      if (newPass !== confirmPass) {
        setFieldError(confirmPassField, "Passwords do not match.");
        valid = false;
      }

      if (!valid) return;

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="loading-spinner" style="width:14px;height:14px;"></span> Updating Password…`;
      }

      const res = await RTS.auth.resetPassword(token, newPass, confirmPass);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Save New Password`;
      }

      if (!res.ok) {
        RTS.toast(res.error, "error");
        setFieldError(newPassField, res.error);
        return;
      }

      if (validState) validState.style.display = "none";
      if (successState) successState.style.display = "block";
      RTS.toast("Password reset successfully! Redirecting to sign in…", "success");
      RTS.refreshIcons();
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2200);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.ensureSeed();
    RTS.settings.applyTheme(RTS.settings.getSettings().theme);
    initLoginPage();
    initRegisterPage();
    initForgotPasswordPage();
    initResetPasswordPage();
    RTS.refreshIcons();
  });
})();
