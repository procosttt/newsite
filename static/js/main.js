(() => {
  const THEME_KEY = "ps_theme";

  function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      btn.setAttribute("aria-label", theme === "dark" ? "Тема: тёмная" : "Тема: светлая");
      btn.setAttribute("title", theme === "dark" ? "Тёмная тема" : "Светлая тема");
    }
  }

  function setupThemeToggle() {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  function setupActiveNav() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    document.querySelectorAll("[data-nav-link]").forEach((a) => {
      const href = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
      if (href === path || (href !== "/" && path.startsWith(href))) {
        a.classList.add("active");
      }
    });
  }

  function setupScrollReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || els.length === 0) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => io.observe(el));
  }

  // Toast
  function setupToasts() {
    window.psToast = (message) => {
      const el = document.createElement("div");
      el.textContent = message;
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.bottom = "18px";
      el.style.transform = "translateX(-50%)";
      el.style.padding = "10px 12px";
      el.style.borderRadius = "14px";
      el.style.border = "1px solid var(--border)";
      el.style.background = "color-mix(in srgb, var(--bg-elev), transparent 0%)";
      el.style.boxShadow = "var(--shadow)";
      el.style.color = "var(--text)";
      el.style.fontSize = "13px";
      el.style.zIndex = "999";
      el.style.opacity = "0";
      el.style.transition = "opacity .18s ease, transform .18s ease";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);

      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateX(-50%) translateY(-2px)";
      });

      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(-50%) translateY(6px)";
        setTimeout(() => el.remove(), 250);
      }, 1400);
    };
  }

  // Simple client-side filter for cards list
  function setupListSearch() {
    const input = document.querySelector("[data-search-input]");
    const cards = document.querySelectorAll("[data-search-card]");
    const empty = document.querySelector("[data-search-empty]");
    if (!input || cards.length === 0) return;

    const norm = (s) => (s || "").toLowerCase().trim();

    function apply() {
      const q = norm(input.value);
      let shown = 0;

      cards.forEach((card) => {
        const hay = norm(card.getAttribute("data-search-hay"));
        const ok = q === "" || hay.includes(q);
        card.style.display = ok ? "" : "none";
        if (ok) shown += 1;
      });

      if (empty) empty.style.display = shown === 0 ? "" : "none";
    }

    input.addEventListener("input", apply);
    apply();
  }

  // Progress on tasks list (count saved per taskId)
  function setupTasksProgress() {
    const holders = document.querySelectorAll("[data-progress-holder]");
    if (holders.length === 0) return;

    const prefix = "ps_code_task_";
    holders.forEach((h) => {
      const taskId = h.getAttribute("data-task-id");
      const problemIds = (h.getAttribute("data-problem-ids") || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!taskId || problemIds.length === 0) return;

      let saved = 0;
      for (const pid of problemIds) {
        const key = `${prefix}${taskId}_${pid}`;
        const val = localStorage.getItem(key);
        if (val !== null && String(val).trim() !== "") saved += 1;
      }

      const total = problemIds.length;
      const badge = h.querySelector("[data-progress-badge]");
      if (badge) {
        badge.textContent = saved === 0 ? `Прогресс: 0/${total}` : `Прогресс: ${saved}/${total}`;
        badge.classList.toggle("ok", saved === total);
        badge.classList.toggle("warn", saved > 0 && saved < total);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getPreferredTheme());
    setupThemeToggle();
    setupActiveNav();
    setupScrollReveal();
    setupToasts();
    setupListSearch();
    setupTasksProgress();
  });
})();
