import streamlit as st
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

#Title of the application
st.title("Hello Streamlit")

## Display a Simple Text
st.write("This is a simple text")
## Create a simple DataFrame
df=pd.DataFrame({'First Column':[1,2,3,4,],
'second column':[10,20,30,40]})
#Display the DataFrame
st.write("here is the dataframe")
st.write(df)
#Create a line chart
chart_data=pd.DataFrame(np.random.randn(20,3),columns=['a','b','c'])
st.line_chart(chart_data) 