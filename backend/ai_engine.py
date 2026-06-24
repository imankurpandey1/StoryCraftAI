from __future__ import annotations

import time
import re

import psutil

from backend.config.settings import Settings
from backend.utils import (
    clean_text,
    estimate_story_scores,
    generate_summary,
    generate_title,
    lexical_diversity,
    reading_time_minutes,
    repetition_rate,
    word_count,
    words,
)


class StoryCraftEngine:
    def __init__(self) -> None:
        self._pipelines = {}

    def _load_pipeline(self, model_key: str):
        if model_key in self._pipelines:
            return self._pipelines[model_key]

        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

        model_id = Settings.MODEL_REGISTRY[model_key]["hf_id"]
        Settings.MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=Settings.MODEL_CACHE_DIR)
        model = AutoModelForCausalLM.from_pretrained(model_id, cache_dir=Settings.MODEL_CACHE_DIR)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        device = 0 if torch.cuda.is_available() else -1
        generator = pipeline("text-generation", model=model, tokenizer=tokenizer, device=device)
        self._pipelines[model_key] = generator
        return generator

    @staticmethod
    def _device_label() -> str:
        try:
            import torch

            return "GPU" if torch.cuda.is_available() else "CPU"
        except Exception:
            return "CPU"

    @staticmethod
    def _prompt_template(prompt: str, genre: str, mode: str, language: str) -> str:
        if mode == "completion":
            return f"[{language}]\n{prompt.rstrip()}\n"
        return f"[{language}] {genre} story:\n{prompt.rstrip()}\n"

    @classmethod
    def _build_model_prompt(cls, generator, prompt: str, genre: str, mode: str, model_key: str, language: str) -> str:
        if not Settings.MODEL_REGISTRY[model_key].get("chat_template"):
            return cls._prompt_template(prompt, genre, mode, language)
        task = "Continue the following unfinished story" if mode == "completion" else "Write a complete short story from the following premise"
        messages = [
            {
                "role": "system",
                "content": f"You are a creative writer. {task} in the {genre} genre. Write the story entirely in {language}. Keep the plot coherent, retain named details, and avoid repetition.",
            },
            {"role": "user", "content": prompt},
        ]
        return generator.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

    @staticmethod
    def _trim_repetitive_tail(text: str) -> str:
        sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        cleaned = []
        seen = set()
        for sentence in sentences:
            key = re.sub(r"\W+", " ", sentence.lower()).strip()
            if key and key in seen:
                break
            seen.add(key)
            cleaned.append(sentence)
        return " ".join(cleaned).strip()

    @staticmethod
    def _has_repetitive_loop(text: str, phrase_size: int = 3, threshold: int = 3) -> bool:
        tokens = words(text)
        phrases = [" ".join(tokens[index : index + phrase_size]) for index in range(len(tokens) - phrase_size + 1)]
        return any(phrases.count(phrase) >= threshold for phrase in set(phrases))

    @classmethod
    def _candidate_score(cls, prompt: str, candidate: str) -> float:
        candidate_words = words(candidate)
        if len(candidate_words) < 8:
            return -1.0
        stop_words = {"a", "an", "and", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with"}
        prompt_terms = {term for term in words(prompt) if term not in stop_words}
        candidate_terms = set(candidate_words)
        overlap = len(prompt_terms & candidate_terms) / max(len(prompt_terms), 1)
        ending_bonus = 0.08 if candidate.rstrip().endswith((".", "!", "?", "\"")) else 0.0
        length_score = min(len(candidate_words) / 120, 1.0) * 0.12
        loop_penalty = 0.4 if cls._has_repetitive_loop(candidate) else 0.0
        return round(
            overlap * 0.55
            + lexical_diversity(candidate) * 0.3
            + length_score
            + ending_bonus
            - repetition_rate(candidate) * 0.4
            - loop_penalty,
            4,
        )

    @staticmethod
    def _fit_prompt_to_context(generator, prompt: str, max_new_tokens: int) -> str:
        tokenizer = generator.tokenizer
        limit = getattr(generator.model.config, "max_position_embeddings", 1024) - max_new_tokens
        if limit < 32:
            limit = 32
        encoded = tokenizer(prompt, truncation=True, max_length=limit, return_tensors=None)
        return tokenizer.decode(encoded["input_ids"], skip_special_tokens=True)

    def generate(self, prompt: str, params: dict, mode: str = "generation") -> dict:
        model_key = params["model"]
        process = psutil.Process()
        before = process.memory_info().rss / (1024 * 1024)
        started = time.perf_counter()
        generator = self._load_pipeline(model_key)
        language = params.get("language", "English")
        full_prompt = self._build_model_prompt(generator, prompt, params["genre"], mode, model_key, language)
        fitted_prompt = self._fit_prompt_to_context(generator, full_prompt, params["max_tokens"])
        outputs = generator(
            fitted_prompt,
            max_new_tokens=params["max_tokens"],
            temperature=params["temperature"],
            top_k=params["top_k"],
            top_p=params["top_p"],
            do_sample=True,
            repetition_penalty=1.12,
            no_repeat_ngram_size=3,
            pad_token_id=generator.tokenizer.eos_token_id,
            return_full_text=False,
            num_return_sequences=3,
        )
        generation_time = time.perf_counter() - started
        after = process.memory_info().rss / (1024 * 1024)
        candidates = [
            clean_text(self._trim_repetitive_tail(item["generated_text"]))
            for item in outputs
        ]
        generated = max(candidates, key=lambda candidate: self._candidate_score(prompt, candidate))
        if not generated:
            generated = "The story continued with a quiet sense of mystery, inviting the reader deeper into the scene."

        combined = clean_text(f"{prompt} {generated}") if mode == "completion" else generated
        metrics = estimate_story_scores(prompt, generated, generation_time, max(after - before, 0))
        return {
            "title": generate_title(prompt, combined),
            "summary": generate_summary(combined),
            "prompt": prompt,
            "generated_story": generated,
            "original_text": prompt if mode == "completion" else "",
            "continuation": generated if mode == "completion" else "",
            "combined_story": combined,
            "model_used": Settings.MODEL_REGISTRY[model_key]["label"],
            "model_key": model_key,
            "language": language,
            "genre": params["genre"],
            "word_count": word_count(combined),
            "reading_time": reading_time_minutes(combined),
            "generation_time": round(generation_time, 3),
            "memory_usage": metrics["memory_usage"],
            "metrics": metrics,
            "parameters": params,
            "mode": mode,
            "device": self._device_label(),
        }


engine = StoryCraftEngine()
