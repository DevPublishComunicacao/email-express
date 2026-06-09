(function () {
  "use strict";

  // ===== Toggle password visibility =====
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", function () {
      const input = this.closest(".password-wrapper").querySelector("input");
      const icon = this.querySelector("i");

      if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
        this.setAttribute("aria-label", "Ocultar senha");
      } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
        this.setAttribute("aria-label", "Mostrar senha");
      }
    });
  });

  // ===== "Salvar senha" - remember email via localStorage =====
  const rememberCheck = document.getElementById("remember");
  const emailInput = document.getElementById("email");

  if (rememberCheck && emailInput) {
    const saved = localStorage.getItem("rememberedEmail");
    if (saved) {
      emailInput.value = saved;
      rememberCheck.checked = true;
    }

    document.getElementById("loginForm")?.addEventListener("submit", function () {
      if (rememberCheck.checked) {
        localStorage.setItem("rememberedEmail", emailInput.value);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
    });
  }

  // ===== Loading spinner on submit =====
  document.querySelectorAll(".auth-form").forEach((form) => {
    form.addEventListener("submit", function () {
      const btn = this.querySelector('button[type="submit"]');
      if (btn) {
        btn.classList.add("loading");
        btn.disabled = true;
      }
    });
  });

  // ===== Auto-hide alerts after 5s =====
  const alertEl = document.querySelector(".alert");
  if (alertEl) {
    setTimeout(() => {
      alertEl.style.transition = "opacity 0.4s ease";
      alertEl.style.opacity = "0";
      setTimeout(() => alertEl.remove(), 400);
    }, 5000);
  }

  // ===== User dropdown toggle =====
  document.querySelectorAll(".dropdown-toggle").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      var parent = this.closest(".dropdown");
      if (parent) {
        parent.classList.toggle("open");
      }
    });
  });

  document.addEventListener("click", function() {
    document.querySelectorAll(".dropdown.open").forEach(function(d) {
      d.classList.remove("open");
    });
  });

  document.querySelectorAll(".dropdown-menu").forEach(function(menu) {
    menu.addEventListener("click", function(e) {
      e.stopPropagation();
    });
  });
})();
