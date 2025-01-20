# src/data_preprocessing.py

import streamlit as st
import pandas as pd
import altair as alt

def create_automation_tracker():
    # Initialize data
    total_reports = 100
    months = range(24)
    data = []

    # Create data for each month
    for month in months:
        # Calculate transitions based on month
        webui = min(60, int((month / 23) * 60))  # Max 60% to Web UI
        tableau = min(40, int((month / 23) * 40))  # Max 40% to Tableau
        manual = total_reports - webui - tableau

        data.append({
            'Month': month + 1,
            'Manual': manual,
            'Web UI': webui,
            'Tableau': tableau
        })

    return pd.DataFrame(data)

def main():
    st.title('Report Automation Tracker')

    # Create data
    df = create_automation_tracker()

    # Create month slider
    month = st.slider('Select Month', 1, 24, 1)

    # Get data for selected month
    current_data = df[df['Month'] == month].iloc[0]

    # Display metrics
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric(
            "Manual Reports",
            current_data['Manual'],
            delta=-int(current_data['Manual'] - df[df['Month'] == max(1, month-1)].iloc[0]['Manual'])
        )
    with col2:
        st.metric(
            "Web UI Reports",
            current_data['Web UI'],
            delta=int(current_data['Web UI'] - df[df['Month'] == max(1, month-1)].iloc[0]['Web UI'])
        )
    with col3:
        st.metric(
            "Tableau Reports",
            current_data['Tableau'],
            delta=int(current_data['Tableau'] - df[df['Month'] == max(1, month-1)].iloc[0]['Tableau'])
        )

    # Create Sankey diagram using Altair
    source = []
    target = []
    value = []

    # Add flows from Manual to Web UI and Tableau
    prev_data = df[df['Month'] == max(1, month-1)].iloc[0]
    webui_change = max(0, current_data['Web UI'] - prev_data['Web UI'])
    tableau_change = max(0, current_data['Tableau'] - prev_data['Tableau'])

    if webui_change > 0:
        source.append('Manual')
        target.append('Web UI')
        value.append(webui_change)

    if tableau_change > 0:
        source.append('Manual')
        target.append('Tableau')
        value.append(tableau_change)

    flow_df = pd.DataFrame({
        'source': source,
        'target': target,
        'value': value
    })

    # Create nodes data
    nodes_df = pd.DataFrame({
        'node': ['Manual', 'Web UI', 'Tableau'],
        'value': [current_data['Manual'], current_data['Web UI'], current_data['Tableau']]
    })

    # Create Altair chart
    nodes = alt.Chart(nodes_df).mark_circle(size=1000).encode(
        x=alt.X('node:N', axis=alt.Axis(title=None)),
        y=alt.Y('node:N', axis=alt.Axis(title=None)),
        color=alt.Color('node:N',
            scale=alt.Scale(
                domain=['Manual', 'Web UI', 'Tableau'],
                range=['#ef4444', '#22c55e', '#3b82f6']
            )
        ),
        tooltip=['node:N', 'value:Q']
    )

    # Add labels
    labels = nodes.mark_text(
        align='center',
        baseline='middle',
        dy=30,
        fontSize=14
    ).encode(
        text='value:Q'
    )

    if len(flow_df) > 0:
        flows = alt.Chart(flow_df).mark_line(opacity=0.5).encode(
            x='source',
            x2='target',
            y='source',
            y2='target',
            strokeWidth=alt.value(30),
            color=alt.Color('target:N',
                scale=alt.Scale(
                    domain=['Web UI', 'Tableau'],
                    range=['#22c55e', '#3b82f6']
                )
            ),
            tooltip=['source', 'target', 'value']
        )
        chart = (flows + nodes + labels)
    else:
        chart = (nodes + labels)

    chart = chart.properties(
        width=600,
        height=400,
        title=f'Report Automation Status - Month {month}'
    ).configure_view(
        strokeWidth=0
    )

    st.altair_chart(chart, use_container_width=True)

    # Show progress over time
    st.subheader('Progress Over Time')
    progress_chart = alt.Chart(df.melt('Month', var_name='Type', value_name='Reports')).mark_area().encode(
        x='Month:Q',
        y=alt.Y('Reports:Q', stack='zero'),
        color=alt.Color('Type:N',
            scale=alt.Scale(
                domain=['Manual', 'Web UI', 'Tableau'],
                range=['#ef4444', '#22c55e', '#3b82f6']
            )
        )
    ).properties(
        width=600,
        height=300
    )

    st.altair_chart(progress_chart, use_container_width=True)