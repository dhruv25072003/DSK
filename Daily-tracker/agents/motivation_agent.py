from gemini_api_wrapper import ask_gemini
import pandas as pd

def motivate_user(csv_path):
    df = pd.read_csv(csv_path)
    last_note = df["Notes"].dropna().iloc[-1] if not df["Notes"].dropna().empty else "No recent notes."
    prompt = f"User wrote: {last_note}\ngive them a motivational quote to keep them motivated."
    return ask_gemini(prompt)