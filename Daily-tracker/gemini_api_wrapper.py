import google.generativeai as genai
import os
import json

def setup_gemini(api_key_path=None):
    if api_key_path is None:
        # Dynamically locate the config folder relative to this file
        root_dir = os.path.dirname(os.path.abspath(__file__))
        api_key_path = os.path.join(root_dir, "config", "gemini_api_key.json")

    if not os.path.exists(api_key_path):
        raise FileNotFoundError(f"Gemini API key not found at: {api_key_path}")

    with open(api_key_path, "r") as f:
        api_key = json.load(f).get("api_key")

    if not api_key:
        raise ValueError("Gemini API key is missing or improperly formatted in JSON.")

    genai.configure(api_key=api_key)
    return genai.GenerativeModel("models/gemini-1.5-flash")


def ask_gemini(prompt, model=None):
    if not model:
        model = setup_gemini()
    response = model.generate_content(prompt)
    return response.text.strip()
