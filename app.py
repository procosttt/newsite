from __future__ import annotations

import json
import os
import sys
import tempfile
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Flask, abort, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "static" / "data"

# ⚠️ Включай для ЛОКАЛЬНОЙ проверки. Для публичного деплоя лучше выключить.
ENABLE_RUNNER = True

# лимиты проверки
RUN_TIMEOUT_SEC = 2.0
MAX_OUTPUT_CHARS = 8000


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"Missing data file: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def index_by_id(items: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {str(item["id"]): item for item in items}


def normalize_newlines(value: Any) -> Any:
    """
    Делает данные устойчивыми к 'двойному экранированию' в JSON:
    '\\n' -> '\n' во всех строковых полях.
    """
    if isinstance(value, str):
        return value.replace("\\n", "\n")
    if isinstance(value, list):
        return [normalize_newlines(v) for v in value]
    if isinstance(value, dict):
        return {k: normalize_newlines(v) for k, v in value.items()}
    return value


def find_problem(task: Dict[str, Any], problem_id: str) -> Optional[Dict[str, Any]]:
    for p in task.get("problems", []):
        if str(p.get("id")) == str(problem_id):
            return p
    return None


def run_python_code(code: str, stdin_data: str) -> Dict[str, Any]:
    """
    Запускает python-код в отдельном процессе.
    ⚠️ Это НЕ песочница. Для публичного деплоя небезопасно.
    """
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        file_path = td_path / "main.py"
        file_path.write_text(code, encoding="utf-8")

        try:
            # -I: изолированный режим (минимум влияния окружения)
            # env: минимальный
            env = {"PYTHONIOENCODING": "utf-8"}
            proc = subprocess.run(
                [sys.executable, "-I", str(file_path)],
                input=stdin_data,
                text=True,
                capture_output=True,
                timeout=RUN_TIMEOUT_SEC,
                cwd=td,
                env=env,
            )
            out = (proc.stdout or "")
            err = (proc.stderr or "")

            # ограничим вывод
            out = out[:MAX_OUTPUT_CHARS]
            err = err[:MAX_OUTPUT_CHARS]

            return {
                "ok": proc.returncode == 0,
                "stdout": out,
                "stderr": err,
                "returncode": proc.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "stdout": "",
                "stderr": f"Timeout: код выполнялся дольше {RUN_TIMEOUT_SEC} сек.",
                "returncode": -1,
            }


def create_app() -> Flask:
    app = Flask(__name__)

    templates_data = normalize_newlines(load_json(DATA_DIR / "templates.json"))
    tasks_data = normalize_newlines(load_json(DATA_DIR / "tasks.json"))

    templates_list: List[Dict[str, Any]] = templates_data.get("templates", [])
    tasks_list: List[Dict[str, Any]] = tasks_data.get("tasks", [])

    templates_map = index_by_id(templates_list)
    tasks_map = index_by_id(tasks_list)

    @app.context_processor
    def inject_globals():
        return {"site_name": "По шаблону !"}

    @app.get("/")
    def home():
        return render_template(
            "index.html",
            templates_count=len(templates_list),
            tasks_count=len(tasks_list),
        )

    @app.get("/templates")
    def templates_page():
        ordered = sorted(templates_list, key=lambda x: int(x["id"]))
        return render_template("templates_list.html", items=ordered)

    @app.get("/templates/<id>")
    def template_detail(id: str):
        item = templates_map.get(str(id))
        if not item:
            abort(404)
        return render_template("template_detail.html", item=item)

    @app.get("/tasks")
    def tasks_page():
        ordered = sorted(tasks_list, key=lambda x: int(x["id"]))
        return render_template("tasks_list.html", items=ordered)

    @app.get("/tasks/<id>")
    def task_detail(id: str):
        item = tasks_map.get(str(id))
        if not item:
            abort(404)
        return render_template("task_detail.html", item=item)

    # отдельная страница задачи: /tasks/6/p1
    @app.get("/tasks/<task_id>/<problem_id>")
    def problem_detail(task_id: str, problem_id: str):
        task = tasks_map.get(str(task_id))
        if not task:
            abort(404)

        problem = find_problem(task, problem_id)
        if not problem:
            abort(404)

        starter = problem.get("starterCode") or task.get("defaultCode") or ""
        tests = problem.get("tests") or []  # [{input, expected}...]

        return render_template(
            "problem_detail.html",
            task=task,
            problem=problem,
            starter=starter,
            tests=tests,
            runner_enabled=ENABLE_RUNNER,
        )

    # ✅ API: проверка решения на тестах
    @app.post("/api/run")
    def api_run():
        if not ENABLE_RUNNER:
            return jsonify({"ok": False, "error": "Runner disabled"}), 403

        data = request.get_json(silent=True) or {}
        task_id = str(data.get("taskId", "")).strip()
        problem_id = str(data.get("problemId", "")).strip()
        code = str(data.get("code", ""))

        task = tasks_map.get(task_id)
        if not task:
            return jsonify({"ok": False, "error": "Task not found"}), 404
        problem = find_problem(task, problem_id)
        if not problem:
            return jsonify({"ok": False, "error": "Problem not found"}), 404

        tests = problem.get("tests") or []
        if not tests:
            return jsonify({"ok": False, "error": "No tests configured"}), 400

        results = []
        all_passed = True

        for idx, t in enumerate(tests, start=1):
            inp = str(t.get("input", ""))
            exp = str(t.get("expected", ""))

            run_res = run_python_code(code, inp)
            got = (run_res.get("stdout") or "")
            err = (run_res.get("stderr") or "")

            # сравнение — по trim пробелам/переносам по краям
            got_norm = got.strip()
            exp_norm = exp.strip()

            passed = run_res.get("ok", False) and (got_norm == exp_norm)
            if not passed:
                all_passed = False

            results.append({
                "test": idx,
                "input": inp,
                "expected": exp,
                "stdout": got,
                "stderr": err,
                "passed": passed,
            })

        return jsonify({"ok": True, "allPassed": all_passed, "results": results})

    @app.errorhandler(404)
    def not_found(_):
        return (
            render_template(
                "index.html",
                is_404=True,
                templates_count=len(templates_list),
                tasks_count=len(tasks_list),
            ),
            404,
        )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
