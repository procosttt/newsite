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
    const b = shell.querySelector("[data-saved-badge]");
    if (!b) return;
    b.textContent = isSaved ? "Сохранено" : "Не сохранено";
    b.classList.toggle("ok", isSaved);
    b.classList.toggle("warn", !isSaved);
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

    return {
      getValue: () => view.state.doc.toString(),
      setValue: (v) => {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
      },
      destroy: () => view.destroy(),
    };
  }

  function initFallbackTextarea(textarea, initialValue, onChange) {
    textarea.value = initialValue;
    textarea.addEventListener("input", () => onChange(textarea.value));
    return {
      getValue: () => textarea.value,
      setValue: (v) => (textarea.value = v),
      destroy: () => {},
    };
  }

  async function bootTaskEditors() {
    const shells = document.querySelectorAll("[data-editor-shell]");
    if (shells.length === 0) return;

    for (const shell of shells) {
      const taskId = shell.getAttribute("data-task-id");
      const problemId = shell.getAttribute("data-problem-id");

      const starterSource = shell.querySelector("[data-starter-source]");
      const starter = starterSource ? (starterSource.value || "") : "";

      const cmHost = shell.querySelector("[data-cm-host]");
      const fallback = shell.querySelector("textarea[data-fallback]");

      const saved = loadSaved(taskId, problemId);
      const initial = saved !== null ? saved : starter;

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

      if (btnSave) {
        btnSave.addEventListener("click", () => {
          const value = editor.getValue();
          saveCode(taskId, problemId, value);
          setSavedBadge(shell, String(value).trim() !== "");
          window.psToast && window.psToast("Сохранено");
        });
      }

      if (btnReset) {
        btnReset.addEventListener("click", () => {
          clearCode(taskId, problemId);
          editor.setValue(starter);
          setSavedBadge(shell, false);
          window.psToast && window.psToast("Сброшено");
        });
      }

      if (btnCopy) {
        btnCopy.addEventListener("click", async () => {
          await copyText(editor.getValue());
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
