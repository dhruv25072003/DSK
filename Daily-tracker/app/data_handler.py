import pandas as pd
import os

CSV_PATH = "c:/Users/dskum/Python/deeplearning/langchain/Daily-tracker/data/daily_log.csv"


def init_csv():
    if not os.path.exists(CSV_PATH):
        df = pd.DataFrame(columns=[
            "Date", "Day", "DSA Task", "GenAI Task", "Data Analyst Task",
            "Journal Entry (Y/N)", "Reading (Y/N)", "Streak Day Type (🟢/🟡/🔴)", "Notes"
        ])
        df.to_csv(CSV_PATH, index=False)

def append_entry(entry):
    df = pd.read_csv(CSV_PATH)
    df = pd.concat([df, pd.DataFrame([entry])], ignore_index=True)
    df.to_csv(CSV_PATH, index=False)