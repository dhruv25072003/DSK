from gemini_api_wrapper import ask_gemini
import pandas as pd

def analyze_streak(csv_path):
    df = pd.read_csv(csv_path)
    last_days = df.tail(5)["Streak Day Type (🟢/🟡/🔴)"]
    reds = (last_days == "🔴").sum()

    if reds >= 3:
        prompt = (
            "User has had 3+ red streak days. Suggest a motivational reset message and a fallback strategy."
        )
        return ask_gemini(prompt)
    else:
        return "No action needed. Keep up the momentum!"