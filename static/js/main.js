(() => {
  // ===== Toast =====
  function ensureToast() {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    return el;
  }

  window.psToast = (msg) => {
    const el = ensureToast();
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => el.classList.remove("show"), 1400);
  };

  // ===== Theme =====
  const THEME_KEY = "ps_theme";
  const root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
  }

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getPreferredTheme());

    const themeBtn = document.querySelector("[data-theme-toggle]");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
      });
    }

    // ===== Scroll reveal =====
    const items = document.querySelectorAll(".reveal");
    if (items.length) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) e.target.classList.add("is-visible");
          });
        },
        { threshold: 0.14 }
      );
      items.forEach((el) => io.observe(el));
    }

    // ===== Mobile drawer menu =====
    const btnOpen = document.querySelector("[data-menu-open]");
    const btnClose = document.querySelector("[data-menu-close]");
    const backdrop = document.querySelector("[data-menu-backdrop]");
    const drawer = document.querySelector("[data-menu-drawer]");
    if (btnOpen && btnClose && backdrop && drawer) {
      const open = () => {
        backdrop.hidden = false;
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
        document.body.classList.add("no-scroll");
      };
      const close = () => {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
        backdrop.hidden = true;
        document.body.classList.remove("no-scroll");
      };

      btnOpen.addEventListener("click", open);
      btnClose.addEventListener("click", close);
      backdrop.addEventListener("click", close);

      drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && drawer.classList.contains("open")) close();
      });
    }
  });
})();
