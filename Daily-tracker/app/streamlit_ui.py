import sys
import os
from datetime import date
import pandas as pd
import streamlit as st

# Fix import paths for app and agents modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.data_handler import append_entry, init_csv, CSV_PATH
from agents.streak_monitor_agent import analyze_streak
from agents.motivation_agent import motivate_user


init_csv()

st.title("DSK's Daily Execution Tracker")

with st.form("daily_form"):
    today = date.today()
    day_name = today.strftime("%A")

    dsa = st.text_input("✅ DSA Task")
    genai = st.text_input("🤖 GenAI Task")
    analyst = st.text_input("📊 Data Analyst Task")
    journal = st.selectbox("📝 Journal Entry", ["Y", "N"])
    reading = st.selectbox("📚 Reading Done", ["Y", "N"])
    streak = st.selectbox("🔥 Streak Type", ["🟢", "🟡", "🔴"])
    notes = st.text_area("🧠 Notes")

    submitted = st.form_submit_button("Log My Day")

    if submitted:
        append_entry({
            "Date": today,
            "Day": day_name,
            "DSA Task": dsa,
            "GenAI Task": genai,
            "Data Analyst Task": analyst,
            "Journal Entry (Y/N)": journal,
            "Reading (Y/N)": reading,
            "Streak Day Type (🟢/🟡/🔴)": streak,
            "Notes": notes
        })
        st.success("✅ Day logged!")

        st.write("📊 **Streak Check:**")
        st.info(analyze_streak(CSV_PATH))

        st.write("💡 **Motivation:**")
        st.success(motivate_user(CSV_PATH))

st.markdown("----")
st.subheader("📈 Progress Chart")
df = pd.read_csv(CSV_PATH)
st.line_chart(df["Streak Day Type (🟢/🟡/🔴)"].map({"🟢": 3, "🟡": 2, "🔴": 1}))