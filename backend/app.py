from __future__ import annotations

from flask import Flask, current_app, jsonify, request
from flask_cors import CORS

from backend.ai_engine import engine
from backend.config.settings import Settings
from backend.database.db import ensure_database, get_connection, row_to_dict, rows_to_dicts
from backend.utils import utc_now_iso
from backend.validation import validate_generation_params, validate_prompt, validate_rating, validate_story_id

import sqlite3
import jwt
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests


def error_response(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Settings)
    CORS(app, resources={r"/*": {"origins": Settings.CORS_ORIGINS}})
    ensure_database()

    def token_required(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            if "Authorization" in request.headers:
                parts = request.headers["Authorization"].split()
                if len(parts) == 2 and parts[0] == "Bearer":
                    token = parts[1]
            if not token:
                return jsonify({"success": False, "error": "Token is missing"}), 401
            try:
                data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
                with get_connection() as conn:
                    current_user = row_to_dict(conn.execute("SELECT id, email, username, name FROM users WHERE id = ?", (data["user_id"],)).fetchone())
                if not current_user:
                    raise Exception("User not found")
            except Exception as e:
                return jsonify({"success": False, "error": "Token is invalid"}), 401
            return f(current_user, *args, **kwargs)
        return decorated

    def optional_token(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = None
            current_user = None
            if "Authorization" in request.headers:
                parts = request.headers["Authorization"].split()
                if len(parts) == 2 and parts[0] == "Bearer":
                    token = parts[1]
            if token:
                try:
                    data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
                    with get_connection() as conn:
                        current_user = row_to_dict(conn.execute("SELECT id, email, username, name FROM users WHERE id = ?", (data["user_id"],)).fetchone())
                except Exception:
                    pass
            return f(current_user, *args, **kwargs)
        return decorated

    @app.post("/auth/register")
    def register():
        payload = request.get_json(silent=True) or {}
        email = payload.get("email", "").strip()
        username = payload.get("username", "").strip()
        password = payload.get("password", "")
        name = payload.get("name", "").strip()
        
        if not email or not username or not password or not name:
            return error_response("Email, username, password, and name are required.")
            
        password_hash = generate_password_hash(password)
        try:
            with get_connection() as conn:
                cursor = conn.execute(
                    "INSERT INTO users (email, username, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)",
                    (email, username, password_hash, name, utc_now_iso())
                )
                conn.commit()
                user_id = cursor.lastrowid
                
            token = jwt.encode(
                {"user_id": user_id, "exp": datetime.utcnow() + timedelta(days=7)},
                app.config["SECRET_KEY"],
                algorithm="HS256"
            )
            return jsonify({"success": True, "data": {"token": token, "user": {"id": user_id, "email": email, "username": username, "name": name}}}), 201
        except sqlite3.IntegrityError:
            return error_response("Email or username already registered.")

    @app.post("/auth/login")
    def login():
        payload = request.get_json(silent=True) or {}
        identifier = payload.get("email", "").strip() # can be email or username
        password = payload.get("password", "")
        
        if not identifier or not password:
            return error_response("Email/Username and password are required.")
            
        with get_connection() as conn:
            user = row_to_dict(conn.execute("SELECT id, email, username, name, password_hash FROM users WHERE email = ? OR username = ?", (identifier, identifier)).fetchone())
            
        if user and check_password_hash(user["password_hash"], password):
            token = jwt.encode(
                {"user_id": user["id"], "exp": datetime.utcnow() + timedelta(days=7)},
                app.config["SECRET_KEY"],
                algorithm="HS256"
            )
            return jsonify({"success": True, "data": {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user["username"], "name": user["name"]}}}), 200
            
        return error_response("Invalid email or password.", 401)

    @app.post("/auth/google")
    def google_login():
        payload = request.get_json(silent=True) or {}
        token = payload.get("credential")
        if not token:
            return error_response("Missing credential.")
            
        try:
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), app.config["GOOGLE_CLIENT_ID"])
            email = idinfo.get("email")
            name = idinfo.get("name", "Google User")
            
            if not email:
                return error_response("Google token did not contain an email.", 400)
                
            with get_connection() as conn:
                user = row_to_dict(conn.execute("SELECT id, email, username, name, password_hash FROM users WHERE email = ?", (email,)).fetchone())
                
                if not user:
                    # Create the user if they don't exist
                    password_hash = generate_password_hash("google-auth-no-password")
                    import secrets
                    username = f"user_{secrets.token_hex(4)}"
                    cursor = conn.execute(
                        "INSERT INTO users (email, username, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)",
                        (email, username, password_hash, name, utc_now_iso())
                    )
                    conn.commit()
                    user_id = cursor.lastrowid
                else:
                    user_id = user["id"]
                    username = user["username"]
                    
            jwt_token = jwt.encode(
                {"user_id": user_id, "exp": datetime.utcnow() + timedelta(days=7)},
                app.config["SECRET_KEY"],
                algorithm="HS256"
            )
            return jsonify({"success": True, "data": {"token": jwt_token, "user": {"id": user_id, "email": email, "username": username, "name": name}}}), 200
        except ValueError as e:
            return error_response(f"Invalid Google token: {str(e)}", 401)

    @app.post("/auth/forgot-password")
    def forgot_password():
        payload = request.get_json(silent=True) or {}
        identifier = payload.get("email", "").strip()
        if not identifier:
            return error_response("Email or username is required.")
            
        with get_connection() as conn:
            user = row_to_dict(conn.execute("SELECT id FROM users WHERE email = ? OR username = ?", (identifier, identifier)).fetchone())
            if not user:
                return error_response("No account found with that email/username.")
                
            import random
            import string
            reset_token = ''.join(random.choices(string.digits, k=6))
            expiry = (datetime.utcnow() + timedelta(minutes=15)).isoformat()
            
            conn.execute("UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?", (reset_token, expiry, user["id"]))
            conn.commit()
            
        # In a real app, send email. Here, we just return the token for the UI to show.
        return jsonify({"success": True, "data": {"message": "Reset code generated.", "mock_code": reset_token}}), 200

    @app.post("/auth/reset-password")
    def reset_password():
        payload = request.get_json(silent=True) or {}
        identifier = payload.get("email", "").strip()
        reset_token = payload.get("code", "").strip()
        new_password = payload.get("password", "")
        
        if not identifier or not reset_token or not new_password:
            return error_response("All fields are required.")
            
        with get_connection() as conn:
            user = row_to_dict(conn.execute("SELECT id, reset_token, reset_token_expiry FROM users WHERE email = ? OR username = ?", (identifier, identifier)).fetchone())
            
            if not user or user["reset_token"] != reset_token:
                return error_response("Invalid or missing reset code.")
                
            if datetime.fromisoformat(user["reset_token_expiry"]) < datetime.utcnow():
                return error_response("Reset code has expired.")
                
            conn.execute("UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?", (generate_password_hash(new_password), user["id"]))
            conn.commit()
            
        return jsonify({"success": True, "data": {"message": "Password successfully updated. You may now log in."}}), 200

    @app.post("/auth/change-password")
    @token_required
    def change_password(current_user):
        payload = request.get_json(silent=True) or {}
        old_password = payload.get("old_password", "")
        new_password = payload.get("new_password", "")
        
        with get_connection() as conn:
            user = row_to_dict(conn.execute("SELECT password_hash FROM users WHERE id = ?", (current_user["id"],)).fetchone())
            if not check_password_hash(user["password_hash"], old_password):
                return error_response("Incorrect current password.")
                
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new_password), current_user["id"]))
            conn.commit()
            
        return jsonify({"success": True, "data": {"message": "Password changed successfully."}}), 200

    @app.get("/auth/profile")
    @token_required
    def get_profile(current_user):
        with get_connection() as conn:
            stats = row_to_dict(conn.execute("SELECT COUNT(id) as total_stories, SUM(word_count) as total_words FROM stories WHERE user_id = ?", (current_user["id"],)).fetchone())
            
        current_user.update({
            "total_stories": stats["total_stories"] or 0,
            "total_words": stats["total_words"] or 0
        })
        return jsonify({"success": True, "data": current_user}), 200

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


    @app.post("/translate-story")
    def translate_story():
        payload = request.get_json(silent=True) or {}
        text = payload.get("text", "").strip()
        target_language = payload.get("language", "English").strip()
        model = payload.get("model", "distilgpt2")
        
        if not text:
            return error_response("Text to translate cannot be empty.")
            
        params = {
            "model": model,
            "max_tokens": min(500, int(len(text.split()) * 1.5) + 50),
            "temperature": 0.3,
            "top_k": 50,
            "top_p": 0.92,
            "language": target_language,
            "genre": "Translation",
        }
        try:
            result = engine.generate(text, params, mode="translation")
            return jsonify({"success": True, "data": result})
        except Exception:
            current_app.logger.exception("Story translation failed")
            return error_response("Translation failed. Try again.", 500)

    @app.post("/chat-refine")
    def chat_refine():
        payload = request.get_json(silent=True) or {}
        messages = payload.get("messages", [])
        model = payload.get("model", "qwen2.5-0.5b-instruct")
        
        if not messages:
            return error_response("Messages cannot be empty.")
            
        system_prompt = "You are an expert story brainstormer. Ask the user 1 or 2 short, probing questions to flesh out their story idea (character, setting, conflict). Be encouraging and concise."
        formatted_messages = [{"role": "system", "content": system_prompt}] + messages
        
        try:
            generator = engine._load_pipeline(model)
            full_prompt = generator.tokenizer.apply_chat_template(formatted_messages, tokenize=False, add_generation_prompt=True)
            outputs = generator(
                full_prompt,
                max_new_tokens=150,
                temperature=0.8,
                do_sample=True,
                return_full_text=False
            )
            reply = outputs[0]["generated_text"].strip()
            return jsonify({"success": True, "data": {"reply": reply}})
        except Exception:
            current_app.logger.exception("Chat refine failed")
            return error_response("Chat failed. Try again.", 500)

    @app.post("/save-story")
    @optional_token
    def save_story(current_user):
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
            temperature = 0.85
            top_k = 50
            top_p = 0.92
            max_tokens = int(payload.get("max_tokens", 1000))
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
                    user_id, title, prompt, genre, generated_story, original_text, continuation,
                    combined_story, summary, model_used, timestamp, rating, word_count,
                    reading_time, generation_time, temperature, top_k, top_p, max_tokens, language, mode,
                    visibility, author_name
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    current_user["id"] if current_user else None,
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
                    payload.get("visibility", "private"),
                    payload.get("author_name", "Anonymous"),
                ),
            )
            conn.commit()
            story = row_to_dict(conn.execute("SELECT * FROM stories WHERE id = ?", (cursor.lastrowid,)).fetchone())
        return jsonify({"success": True, "data": story}), 201

    @app.get("/get-stories")
    @optional_token
    def get_stories(current_user):
        search = f"%{request.args.get('search', '').strip()}%"
        genre = request.args.get("genre", "").strip()
        model = request.args.get("model", "").strip()
        visibility = request.args.get("visibility", "").strip()
        min_rating, rating_error = validate_rating(request.args.get("min_rating")) if request.args.get("min_rating") else (0, None)
        if rating_error:
            return error_response(rating_error)
        query = "SELECT * FROM stories WHERE (title LIKE ? OR prompt LIKE ? OR generated_story LIKE ?)"
        params = [search, search, search]
        if visibility == "private":
            if current_user:
                query += " AND visibility = 'private' AND user_id = ?"
                params.append(current_user["id"])
            else:
                return jsonify({"success": True, "data": []}), 200
        elif visibility == "public":
            query += " AND visibility = 'public'"
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
