from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import Flask, abort, render_template


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "static" / "data"


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

    # ✅ НОВОЕ: отдельная страница для конкретной задачи (например /tasks/6/p1)
    @app.get("/tasks/<task_id>/<problem_id>")
    def problem_detail(task_id: str, problem_id: str):
        task = tasks_map.get(str(task_id))
        if not task:
            abort(404)

        problem = find_problem(task, problem_id)
        if not problem:
            abort(404)

        starter = problem.get("starterCode") or task.get("defaultCode") or ""
        return render_template(
            "problem_detail.html",
            task=task,
            problem=problem,
            starter=starter,
        )

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
