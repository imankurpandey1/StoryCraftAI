from __future__ import annotations

from flask import Flask, current_app, jsonify, request
from flask_cors import CORS

from backend.ai_engine import engine
from backend.config.settings import Settings
from backend.database.db import ensure_database, get_connection, row_to_dict, rows_to_dicts
from backend.utils import utc_now_iso
from backend.validation import validate_generation_params, validate_prompt, validate_rating, validate_story_id


def error_response(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Settings)
    CORS(app, resources={r"/*": {"origins": Settings.CORS_ORIGINS}})
    ensure_database()

    @app.get("/health")
    def health():
        return jsonify({"success": True, "status": "healthy", "app": "StoryCraft AI"})

    @app.post("/generate-story")
    def generate_story():
        payload = request.get_json(silent=True) or {}
        prompt, prompt_error = validate_prompt(payload.get("prompt", ""))
        if prompt_error:
            return error_response(prompt_error)
        params, param_error = validate_generation_params(payload)
        if param_error:
            return error_response(param_error)
        try:
            result = engine.generate(prompt, params, mode="generation")
            return jsonify({"success": True, "data": result})
        except Exception:
            current_app.logger.exception("Story generation failed")
            return error_response("Story generation failed. Check that the selected model is available and try again.", 500)

    @app.post("/complete-story")
    def complete_story():
        payload = request.get_json(silent=True) or {}
        prompt, prompt_error = validate_prompt(payload.get("unfinished_story", payload.get("prompt", "")), "unfinished_story")
        if prompt_error:
            return error_response(prompt_error)
        params, param_error = validate_generation_params(payload)
        if param_error:
            return error_response(param_error)
        try:
            result = engine.generate(prompt, params, mode="completion")
            return jsonify({"success": True, "data": result})
        except Exception:
            current_app.logger.exception("Story completion failed")
            return error_response("Story completion failed. Check that the selected model is available and try again.", 500)


    @app.post("/save-story")
    def save_story():
        payload = request.get_json(silent=True) or {}
        required = ["title", "prompt", "genre", "generated_story", "model_used", "word_count", "reading_time", "generation_time"]
        missing = [field for field in required if payload.get(field) in [None, ""]]
        if missing:
            return error_response(f"Missing required fields: {', '.join(missing)}")
        try:
            rating = int(payload.get("rating", 0) or 0)
            story_word_count = int(payload["word_count"])
            reading_time = float(payload["reading_time"])
            generation_time = float(payload["generation_time"])
            temperature = float(payload.get("temperature", 0.85))
            top_k = int(payload.get("top_k", 50))
            top_p = float(payload.get("top_p", 0.92))
            max_tokens = int(payload.get("max_tokens", 180))
            language = payload.get("language", "English")
        except (TypeError, ValueError):
            return error_response("Story metadata contains invalid numeric values.")
        if rating and not 1 <= rating <= 5:
            return error_response("Rating must be between 1 and 5.")
        if story_word_count < 1 or reading_time < 0 or generation_time < 0:
            return error_response("Story metadata must use non-negative values.")
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO stories (
                    title, prompt, genre, generated_story, original_text, continuation,
                    combined_story, summary, model_used, timestamp, rating, word_count,
                    reading_time, generation_time, temperature, top_k, top_p, max_tokens, language, mode
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["title"],
                    payload["prompt"],
                    payload["genre"],
                    payload["generated_story"],
                    payload.get("original_text", ""),
                    payload.get("continuation", ""),
                    payload.get("combined_story", payload["generated_story"]),
                    payload.get("summary", ""),
                    payload["model_used"],
                    utc_now_iso(),
                    rating,
                    story_word_count,
                    reading_time,
                    generation_time,
                    temperature,
                    top_k,
                    top_p,
                    max_tokens,
                    language,
                    payload.get("mode", "generation"),
                ),
            )
            conn.commit()
            story = row_to_dict(conn.execute("SELECT * FROM stories WHERE id = ?", (cursor.lastrowid,)).fetchone())
        return jsonify({"success": True, "data": story}), 201

    @app.get("/get-stories")
    def get_stories():
        search = f"%{request.args.get('search', '').strip()}%"
        genre = request.args.get("genre", "").strip()
        model = request.args.get("model", "").strip()
        min_rating, rating_error = validate_rating(request.args.get("min_rating")) if request.args.get("min_rating") else (0, None)
        if rating_error:
            return error_response(rating_error)
        query = "SELECT * FROM stories WHERE (title LIKE ? OR prompt LIKE ? OR generated_story LIKE ?)"
        params = [search, search, search]
        if genre:
            query += " AND genre = ?"
            params.append(genre)
        if model:
            query += " AND model_used = ?"
            params.append(model)
        if min_rating:
            query += " AND rating >= ?"
            params.append(min_rating)
        query += " ORDER BY timestamp DESC"
        with get_connection() as conn:
            stories = rows_to_dicts(conn.execute(query, params).fetchall())
        return jsonify({"success": True, "data": stories})

    @app.put("/update-story/<int:story_id>")
    def update_story(story_id: int):
        payload = request.get_json(silent=True) or {}
        title = " ".join(str(payload.get("title", "")).split())
        story = " ".join(str(payload.get("generated_story", "")).split())
        if not title or not story:
            return error_response("Title and generated_story are required.")
        with get_connection() as conn:
            conn.execute(
                "UPDATE stories SET title = ?, generated_story = ?, combined_story = ?, summary = ? WHERE id = ?",
                (title, story, payload.get("combined_story", story), payload.get("summary", ""), story_id),
            )
            conn.commit()
            updated = row_to_dict(conn.execute("SELECT * FROM stories WHERE id = ?", (story_id,)).fetchone())
        if not updated:
            return error_response("Story not found.", 404)
        return jsonify({"success": True, "data": updated})

    @app.delete("/delete-story/<int:story_id>")
    def delete_story(story_id: int):
        with get_connection() as conn:
            cursor = conn.execute("DELETE FROM stories WHERE id = ?", (story_id,))
            conn.commit()
        if cursor.rowcount == 0:
            return error_response("Story not found.", 404)
        return jsonify({"success": True, "message": "Story deleted."})

    @app.post("/delete-story")
    def delete_story_post():
        payload = request.get_json(silent=True) or {}
        story_id, story_id_error = validate_story_id(payload.get("id"))
        if story_id_error:
            return error_response(story_id_error)
        return delete_story(story_id)

    @app.post("/rate-story")
    def rate_story():
        payload = request.get_json(silent=True) or {}
        story_id, story_id_error = validate_story_id(payload.get("id"))
        if story_id_error:
            return error_response(story_id_error)
        rating, rating_error = validate_rating(payload.get("rating"))
        if rating_error:
            return error_response(rating_error)
        with get_connection() as conn:
            conn.execute("UPDATE stories SET rating = ? WHERE id = ?", (rating, story_id))
            conn.commit()
            story = row_to_dict(conn.execute("SELECT * FROM stories WHERE id = ?", (story_id,)).fetchone())
        if not story:
            return error_response("Story not found.", 404)
        return jsonify({"success": True, "data": story})

    @app.get("/get-analytics")
    def get_analytics():
        with get_connection() as conn:
            stories = rows_to_dicts(conn.execute("SELECT * FROM stories ORDER BY timestamp DESC").fetchall())
        total = len(stories)
        rated = [s for s in stories if s["rating"]]
        avg_rating = round(sum(s["rating"] for s in rated) / len(rated), 2) if rated else 0
        genre_counts = {}
        model_counts = {}
        rating_counts = {str(i): 0 for i in range(1, 6)}
        trend = {}
        for story in stories:
            genre_counts[story["genre"]] = genre_counts.get(story["genre"], 0) + 1
            model_counts[story["model_used"]] = model_counts.get(story["model_used"], 0) + 1
            if story["rating"]:
                rating_counts[str(story["rating"])] += 1
            day = story["timestamp"][:10]
            trend[day] = trend.get(day, 0) + 1
        most_used_genre = max(genre_counts, key=genre_counts.get) if genre_counts else "N/A"
        analytics = {
            "total_stories": total,
            "average_rating": avg_rating,
            "most_used_genre": most_used_genre,
            "generation_count": total,
            "recent_stories": stories[:6],
            "top_rated": sorted(rated, key=lambda s: s["rating"], reverse=True)[:5],
            "model_usage": [{"name": k, "value": v} for k, v in model_counts.items()],
            "genre_distribution": [{"name": k, "value": v} for k, v in genre_counts.items()],
            "rating_distribution": [{"rating": k, "count": v} for k, v in rating_counts.items()],
            "generation_trends": [{"date": k, "stories": v} for k, v in sorted(trend.items())],
            "performance": [
                {
                    "model": model,
                    "avg_generation_time": round(sum(s["generation_time"] for s in stories if s["model_used"] == model) / count, 3),
                    "avg_word_count": round(sum(s["word_count"] for s in stories if s["model_used"] == model) / count, 1),
                }
                for model, count in model_counts.items()
            ],
            "average_story_length": round(sum(s["word_count"] for s in stories) / total, 1) if total else 0,
            "average_generation_speed": round(sum(s["generation_time"] for s in stories) / total, 3) if total else 0,
        }
        return jsonify({"success": True, "data": analytics})

    return app
