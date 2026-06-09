(function () {
  "use strict";

  const form = document.getElementById("registerForm");

  function phoneMask(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function setFieldState(input, errorEl, isValid, message) {
    input.classList.remove("input-error", "input-success");
    errorEl.textContent = "";

    if (isValid === true) {
      input.classList.add("input-success");
    } else if (isValid === false) {
      input.classList.add("input-error");
      errorEl.textContent = message;
    }
  }

  function validateName() {
    const input = document.getElementById("name");
    const error = document.getElementById("name-error");
    if (!input.value.trim()) {
      setFieldState(input, error, false, "Nome é obrigatório.");
      return false;
    }
    setFieldState(input, error, true);
    return true;
  }

  function validateEmail() {
    const input = document.getElementById("email");
    const error = document.getElementById("email-error");
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!input.value.trim()) {
      setFieldState(input, error, false, "E-mail é obrigatório.");
      return false;
    }
    if (!regex.test(input.value.trim())) {
      setFieldState(input, error, false, "E-mail inválido.");
      return false;
    }
    setFieldState(input, error, true);
    return true;
  }

  function validatePhone() {
    const input = document.getElementById("phone");
    const error = document.getElementById("phone-error");
    const digits = input.value.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
      setFieldState(input, error, false, "Celular inválido. Use (XX) XXXXX-XXXX.");
      return false;
    }
    setFieldState(input, error, true);
    return true;
  }

  function validatePassword() {
    const input = document.getElementById("password");
    const error = document.getElementById("password-error");
    if (input.value.length < 6) {
      setFieldState(input, error, false, "Mínimo de 6 caracteres.");
      return false;
    }
    setFieldState(input, error, true);
    return true;
  }

  function validateConfirmPassword() {
    const input = document.getElementById("confirmPassword");
    const error = document.getElementById("confirmPassword-error");
    const password = document.getElementById("password").value;
    if (input.value.length < 6) {
      setFieldState(input, error, false, "Mínimo de 6 caracteres.");
      return false;
    }
    if (input.value !== password) {
      setFieldState(input, error, false, "As senhas não conferem.");
      return false;
    }
    setFieldState(input, error, true);
    return true;
  }

  function validateCaptcha() {
    const input = document.getElementById("captcha");
    const error = document.getElementById("captcha-error");
    if (!input.value) {
      setFieldState(input, error, false, "Responda ao captcha.");
      return false;
    }
    setFieldState(input, error, true);
    return true;
  }

  function validateForm() {
    const validations = [
      validateName(),
      validateEmail(),
      validatePhone(),
      validatePassword(),
      validateConfirmPassword(),
      validateCaptcha(),
    ];
    return validations.every(Boolean);
  }

  if (form) {
    document.getElementById("name").addEventListener("blur", validateName);
    document.getElementById("email").addEventListener("blur", validateEmail);
    document.getElementById("phone").addEventListener("blur", validatePhone);
    document.getElementById("password").addEventListener("blur", validatePassword);
    document.getElementById("confirmPassword").addEventListener("blur", validateConfirmPassword);
    document.getElementById("captcha").addEventListener("blur", validateCaptcha);

    document.getElementById("confirmPassword").addEventListener("input", function () {
      if (this.value.length >= 6 || document.getElementById("password").value.length >= 6) {
        validateConfirmPassword();
      }
    });

    document.getElementById("phone").addEventListener("input", function () {
      const cursor = this.selectionStart;
      const prevLen = this.value.length;
      this.value = phoneMask(this.value);
      const newLen = this.value.length;
      if (cursor < prevLen) {
        this.setSelectionRange(cursor, cursor);
      }
    });

    form.addEventListener("submit", function (e) {
      const btn = this.querySelector('button[type="submit"]');
      if (!validateForm()) {
        e.preventDefault();
        const firstError = this.querySelector(".input-error");
        if (firstError) firstError.focus();
        return;
      }
      btn.classList.add("loading");
      btn.disabled = true;
    });
  }

  const alertEl = document.querySelector(".alert");
  if (alertEl) {
    setTimeout(() => {
      alertEl.style.transition = "opacity 0.4s ease";
      alertEl.style.opacity = "0";
      setTimeout(() => alertEl.remove(), 400);
    }, 5000);
  }
})();
