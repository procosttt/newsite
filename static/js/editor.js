(() => {
  const LS_PREFIX = "ps_code_task_";

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      window.psToast && window.psToast("Скопировано");
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        window.psToast && window.psToast("Скопировано");
        return true;
      } finally {
        ta.remove();
      }
    }
  }

  function makeKey(taskId, problemId) {
    return `${LS_PREFIX}${taskId}_${problemId}`;
  }

  function loadSaved(taskId, problemId) {
    return localStorage.getItem(makeKey(taskId, problemId));
  }

  function saveCode(taskId, problemId, code) {
    localStorage.setItem(makeKey(taskId, problemId), code);
  }

  function clearCode(taskId, problemId) {
    localStorage.removeItem(makeKey(taskId, problemId));
  }

  function setSavedBadge(shell, isSaved) {
    const card = shell.closest(".card") || shell.parentElement;
    const b = (card && card.querySelector("[data-saved-badge]")) || shell.querySelector("[data-saved-badge]");
    if (!b) return;
    b.textContent = isSaved ? "Сохранено" : "Не сохранено";
    b.classList.toggle("ok", isSaved);
    b.classList.toggle("warn", !isSaved);
  }

  function normalizeText(s) {
    return String(s || "").replace(/\r\n/g, "\n").replace(/^\n/, "");
  }

  // ✅ Tab в textarea: вставка 4 пробелов
  function enableTextareaTab(textarea) {
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const insert = "    ";
        const value = textarea.value;
        textarea.value = value.slice(0, start) + insert + value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      }
    });
  }

  async function initCodeMirrorFor(container, initialValue, onChange) {
    const [
      cmView,
      cmState,
      cmCommands,
      cmLangPython,
      cmLangHighlight,
    ] = await Promise.all([
      import("https://esm.sh/@codemirror/view@6.28.2"),
      import("https://esm.sh/@codemirror/state@6.4.1"),
      import("https://esm.sh/@codemirror/commands@6.5.0"),
      import("https://esm.sh/@codemirror/lang-python@6.1.6"),
      import("https://esm.sh/@codemirror/language@6.10.2"),
    ]);

    const { EditorView, keymap, lineNumbers, highlightActiveLineGutter, drawSelection } = cmView;
    const { EditorState } = cmState;
    const { defaultKeymap, indentWithTab } = cmCommands;
    const { python } = cmLangPython;
    const { syntaxHighlighting, defaultHighlightStyle } = cmLangHighlight;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const value = update.state.doc.toString();
        onChange(value);
      }
    });

    const theme = EditorView.theme({
      "&": { backgroundColor: "transparent", color: "var(--text)", fontSize: "13px" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid var(--border)",
        color: "var(--muted)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--bg-elev), transparent 70%)",
        color: "var(--text)",
      },
      ".cm-content": {
        padding: "12px",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
      ".cm-scroller": {
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--bg-elev), transparent 80%)",
      },
      ".cm-selectionBackground": { backgroundColor: "rgba(79,70,229,.20)" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
    });

    // ✅ indentWithTab ставим ПЕРВЫМ
    const startState = EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        drawSelection(),
        keymap.of([indentWithTab, ...defaultKeymap]),
        python(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        updateListener,
        EditorView.lineWrapping,
        theme,
      ],
    });

    const view = new EditorView({ state: startState, parent: container });

    // ✅ автофокус, чтобы Tab работал сразу
    requestAnimationFrame(() => view.focus());

    return {
      getValue: () => view.state.doc.toString(),
      setValue: (v) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
        requestAnimationFrame(() => view.focus());
      },
      focus: () => view.focus(),
      destroy: () => view.destroy(),
    };
  }

  function initFallbackTextarea(textarea, initialValue, onChange) {
    textarea.value = initialValue;
    enableTextareaTab(textarea);
    textarea.addEventListener("input", () => onChange(textarea.value));
    requestAnimationFrame(() => textarea.focus());
    return {
      getValue: () => textarea.value,
      setValue: (v) => { textarea.value = v; requestAnimationFrame(() => textarea.focus()); },
      focus: () => textarea.focus(),
      destroy: () => {},
    };
  }

  function renderRunResults(container, payload) {
    const status = container.querySelector("[data-run-status]");
    const resultsHost = container.querySelector("[data-run-results]");
    if (!status || !resultsHost) return;

    if (!payload || !payload.ok) {
      status.textContent = payload?.error || "Ошибка проверки.";
      resultsHost.innerHTML = "";
      return;
    }

    status.textContent = payload.allPassed ? "✅ Все тесты пройдены" : "❌ Есть ошибки в тестах";

    resultsHost.innerHTML = payload.results.map(r => {
      const cls = r.passed ? "ok" : "warn";
      const got = (r.stdout ?? "").toString();
      const exp = (r.expected ?? "").toString();
      const err = (r.stderr ?? "").toString();

      return `
        <div class="run-case ${cls}">
          <div class="run-case-head">
            <div class="badge ${cls}">Тест ${r.test}: ${r.passed ? "OK" : "FAIL"}</div>
          </div>

          <div class="run-cols">
            <div>
              <div class="run-label">Ввод</div>
              <pre class="run-pre">${escapeHtml(r.input ?? "")}</pre>
            </div>

            <div>
              <div class="run-label">Ожидаемый вывод</div>
              <pre class="run-pre">${escapeHtml(exp)}</pre>
            </div>

            <div>
              <div class="run-label">Твой вывод</div>
              <pre class="run-pre">${escapeHtml(got)}</pre>
            </div>
          </div>

          ${err.trim() ? `<div class="run-err"><div class="run-label">stderr / ошибка</div><pre class="run-pre">${escapeHtml(err)}</pre></div>` : ""}
        </div>
      `;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function bootTaskEditors() {
    const shells = document.querySelectorAll("[data-editor-shell]");
    if (shells.length === 0) return;

    for (const shell of shells) {
      const taskId = shell.getAttribute("data-task-id");
      const problemId = shell.getAttribute("data-problem-id");

      const startEmpty = shell.getAttribute("data-start-empty") === "1";

      const starterSource = shell.querySelector("[data-starter-source]");
      const starter = normalizeText(starterSource ? starterSource.textContent : "");

      const cmHost = shell.querySelector("[data-cm-host]");
      const fallback = shell.querySelector("textarea[data-fallback]");

      const saved = loadSaved(taskId, problemId);

      // ✅ важно: если startEmpty=1 и сохранённого кода нет — стартуем ПУСТЫМ
      const initial = (saved !== null) ? saved : (startEmpty ? "" : starter);

      let editor;
      const onChange = () => {};

      if (cmHost) {
        try {
          editor = await initCodeMirrorFor(cmHost, initial, onChange);
          if (fallback) fallback.style.display = "none";
        } catch (e) {
          if (fallback) {
            cmHost.innerHTML = "";
            editor = initFallbackTextarea(fallback, initial, onChange);
          }
        }
      } else if (fallback) {
        editor = initFallbackTextarea(fallback, initial, onChange);
      }

      setSavedBadge(shell, saved !== null && String(saved).trim() !== "");

      const btnSave = shell.querySelector("[data-action='save']");
      const btnReset = shell.querySelector("[data-action='reset']");
      const btnCopy = shell.querySelector("[data-action='copy']");
      const btnRun = shell.querySelector("[data-action='run']");

      if (btnSave) {
        btnSave.addEventListener("click", () => {
          const value = editor ? editor.getValue() : (fallback ? fallback.value : "");
          saveCode(taskId, problemId, value);
          setSavedBadge(shell, String(value).trim() !== "");
          window.psToast && window.psToast("Сохранено");
        });
      }

      if (btnReset) {
        btnReset.addEventListener("click", () => {
          clearCode(taskId, problemId);
          const next = starter; // ✅ сброс всегда на шаблон
          if (editor) editor.setValue(next);
          if (fallback) fallback.value = next;
          setSavedBadge(shell, false);
          window.psToast && window.psToast("Сброшено (шаблон)");
        });
      }

      if (btnCopy) {
        btnCopy.addEventListener("click", async () => {
          const value = editor ? editor.getValue() : (fallback ? fallback.value : "");
          await copyText(value);
        });
      }

      // ✅ Проверка
      if (btnRun) {
        const panel = shell.querySelector("[data-run-panel]");
        btnRun.addEventListener("click", async () => {
          if (!panel) return;
          const status = panel.querySelector("[data-run-status]");
          if (status) status.textContent = "⏳ Проверяю...";

          const code = editor ? editor.getValue() : (fallback ? fallback.value : "");
          try {
            const res = await fetch("/api/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId, problemId, code }),
            });
            const payload = await res.json().catch(() => ({}));
            renderRunResults(panel, payload.ok ? payload : { ok: false, error: payload.error || "Ошибка API" });
          } catch (e) {
            renderRunResults(panel, { ok: false, error: "Не удалось обратиться к серверу проверки." });
          }
        });
      }
    }
  }

  function bootTemplateCopy() {
    const btn = document.querySelector("[data-copy-template]");
    const codeEl = document.querySelector("[data-template-code]");
    if (!btn || !codeEl) return;

    btn.addEventListener("click", async () => {
      const text = codeEl.textContent || "";
      await copyText(text);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootTemplateCopy();
    bootTaskEditors();
  });
})();
