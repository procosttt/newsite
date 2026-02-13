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

  // Tab для textarea: вставка 4 пробелов
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
      if (update.docChanged) onChange(update.state.doc.toString());
    });

    const theme = EditorView.theme({
      "&": { backgroundColor: "transparent", color: "var(--text)", fontSize: "14px" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid var(--border)",
        color: "var(--muted)",
      },
      ".cm-content": {
        padding: "14px",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
      ".cm-scroller": {
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--bg-elev), transparent 82%)",
      },
      ".cm-selectionBackground": { backgroundColor: "rgba(79,70,229,.20)" },
      ".cm-cursor": { borderLeftColor: "var(--text)" },
    });

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
      setValue: (v) => {
        textarea.value = v;
        requestAnimationFrame(() => textarea.focus());
      },
      focus: () => textarea.focus(),
      destroy: () => {},
    };
  }

  function toggleFullscreen(shell, on) {
    shell.classList.toggle("is-fullscreen", on);
    document.body.classList.toggle("no-scroll", on);
  }

  async function bootEditors() {
    const shells = document.querySelectorAll("[data-editor-shell]");
    if (!shells.length) return;

    for (const shell of shells) {
      const taskId = shell.getAttribute("data-task-id");
      const problemId = shell.getAttribute("data-problem-id");
      const startEmpty = shell.getAttribute("data-start-empty") === "1";

      const starterSource = shell.querySelector("[data-starter-source]");
      const starter = normalizeText(starterSource ? starterSource.textContent : "");

      const cmHost = shell.querySelector("[data-cm-host]");
      const fallback = shell.querySelector("textarea[data-fallback]");

      const saved = loadSaved(taskId, problemId);
      const initial = saved !== null ? saved : (startEmpty ? "" : starter);

      let editor = null;
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
      const btnFull = shell.querySelector("[data-action='fullscreen']");
      const btnExitFull = shell.querySelector("[data-action='exit-fullscreen']");

      const getValue = () => (editor ? editor.getValue() : (fallback ? fallback.value : ""));
      const setValue = (v) => {
        if (editor) editor.setValue(v);
        if (fallback) fallback.value = v;
      };

      if (btnSave) {
        btnSave.addEventListener("click", () => {
          const value = getValue();
          saveCode(taskId, problemId, value);
          setSavedBadge(shell, String(value).trim() !== "");
          window.psToast && window.psToast("Сохранено");
        });
      }

      if (btnReset) {
        btnReset.addEventListener("click", () => {
          clearCode(taskId, problemId);
          setValue(starter); // сброс на шаблон
          setSavedBadge(shell, false);
          window.psToast && window.psToast("Сброшено (шаблон)");
        });
      }

      if (btnCopy) {
        btnCopy.addEventListener("click", async () => {
          await copyText(getValue());
        });
      }

      // Fullscreen UX for mobile
      if (btnFull) {
        btnFull.addEventListener("click", () => {
          toggleFullscreen(shell, true);
          setTimeout(() => editor && editor.focus(), 30);
        });
      }
      if (btnExitFull) {
        btnExitFull.addEventListener("click", () => {
          toggleFullscreen(shell, false);
          setTimeout(() => editor && editor.focus(), 30);
        });
      }

      // Escape to exit fullscreen
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && shell.classList.contains("is-fullscreen")) {
          toggleFullscreen(shell, false);
        }
      });
    }
  }

  function bootTemplateCopy() {
    const btn = document.querySelector("[data-copy-template]");
    const codeEl = document.querySelector("[data-template-code]");
    if (!btn || !codeEl) return;

    btn.addEventListener("click", async () => {
      await copyText(codeEl.textContent || "");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootTemplateCopy();
    bootEditors();
  });
})();
