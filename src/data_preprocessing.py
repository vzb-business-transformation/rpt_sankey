# src/data_preprocessing.py

import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import numpy as np

class AutomationTracker:
    def __init__(self, total_reports=100, total_months=24):
        self.total_reports = total_reports
        self.total_months = total_months

    def calculate_flows(self, current_month):
        # Calculate how many reports should be in each state for this month
        webui_target = min(60, int((current_month / self.total_months) * 60))
        tableau_target = min(40, int((current_month / self.total_months) * 40))
        manual = self.total_reports - webui_target - tableau_target

        # Calculate flows from the previous month
        if current_month > 0:
            prev_webui = min(60, int(((current_month - 1) / self.total_months) * 60))
            prev_tableau = min(40, int(((current_month - 1) / self.total_months) * 40))
            prev_manual = self.total_reports - prev_webui - prev_tableau

            webui_flow = webui_target - prev_webui
            tableau_flow = tableau_target - prev_tableau
        else:
            prev_manual = self.total_reports
            webui_flow = 0
            tableau_flow = 0

        return {
            'manual': manual,
            'webui': webui_target,
            'tableau': tableau_target,
            'manual_to_webui': webui_flow,
            'manual_to_tableau': tableau_flow
        }

    def create_sankey(self, current_month):
        flows = self.calculate_flows(current_month)

        # Define node labels with counts
        label = [
            f"Manual<br>({flows['manual']})",
            f"Web UI<br>({flows['webui']})",
            f"Tableau<br>({flows['tableau']})"
        ]

        # Define colors for nodes
        color = ['#ef4444', '#22c55e', '#3b82f6']  # Red, Green, Blue

        # Create Sankey diagram
        fig = go.Figure(data=[go.Sankey(
            node = dict(
                pad = 15,
                thickness = 30,
                line = dict(color = "black", width = 0.5),
                label = label,
                color = color
            ),
            link = dict(
                source = [0, 0],  # Manual is source for both links
                target = [1, 2],  # Web UI and Tableau are targets
                value = [flows['manual_to_webui'], flows['manual_to_tableau']],
                color = ['rgba(34, 197, 94, 0.5)', 'rgba(59, 130, 246, 0.5)']  # Semi-transparent green and blue
            )
        )])

        # Update layout
        fig.update_layout(
            title_text=f"Report Automation Progress - Month {current_month + 1}",
            font_size=16,
            height=600
        )

        return fig

def main():
    st.set_page_config(layout="wide")
    st.title('Report Automation Progress Tracker')

    # Create tracker instance
    tracker = AutomationTracker()

    # Add month slider
    month = st.slider('Select Month', min_value=0, max_value=23, value=0, format="Month %d")

    # Create columns for metrics
    col1, col2, col3 = st.columns(3)

    # Calculate current and previous flows
    current_flows = tracker.calculate_flows(month)
    prev_flows = tracker.calculate_flows(max(0, month-1))

    # Display metrics with deltas
    with col1:
        st.metric(
            "Manual Reports",
            current_flows['manual'],
            delta=-1 * (prev_flows['manual'] - current_flows['manual']) if month > 0 else None,
            delta_color="inverse"
        )

    with col2:
        st.metric(
            "Web UI Reports",
            current_flows['webui'],
            delta=current_flows['manual_to_webui'] if month > 0 else None
        )

    with col3:
        st.metric(
            "Tableau Reports",
            current_flows['tableau'],
            delta=current_flows['manual_to_tableau'] if month > 0 else None
        )

    # Create and display Sankey diagram
    fig = tracker.create_sankey(month)
    st.plotly_chart(fig, use_container_width=True)

    # Add progress chart
    st.subheader('Overall Progress')
    progress_data = []
    for m in range(month + 1):
        flows = tracker.calculate_flows(m)
        progress_data.append({
            'Month': m + 1,
            'Manual': flows['manual'],
            'Web UI': flows['webui'],
            'Tableau': flows['tableau']
        })

    progress_df = pd.DataFrame(progress_data)

    # Plot progress using Plotly
    progress_fig = go.Figure()
    progress_fig.add_trace(go.Scatter(
        x=progress_df['Month'],
        y=progress_df['Manual'],
        name='Manual',
        fill='tonexty',
        mode='lines',
        line=dict(color='#ef4444')
    ))
    progress_fig.add_trace(go.Scatter(
        x=progress_df['Month'],
        y=progress_df['Web UI'],
        name='Web UI',
        fill='tonexty',
        mode='lines',
        line=dict(color='#22c55e')
    ))
    progress_fig.add_trace(go.Scatter(
        x=progress_df['Month'],
        y=progress_df['Tableau'],
        name='Tableau',
        fill='tonexty',
        mode='lines',
        line=dict(color='#3b82f6')
    ))

    progress_fig.update_layout(
        title='Progress Over Time',
        xaxis_title='Month',
        yaxis_title='Number of Reports',
        height=400
    )

    st.plotly_chart(progress_fig, use_container_width=True)