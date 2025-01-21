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
        # Calculate retirement target (starts at month 3, reaches 15% by month 19)
        if current_month < 3:
            retirement_target = 0
        else:
            months_since_start = current_month - 3
            retirement_per_month = (self.total_reports * 0.15) / 16  # Spread 15% over 16 months
            retirement_target = min(
                int(self.total_reports * 0.15),  # Max 15%
                int(months_since_start * retirement_per_month)
            )

        # Calculate remaining reports after retirement
        remaining_reports = self.total_reports - retirement_target

        # Ensure at least 25% stays manual
        max_automation = int(remaining_reports * 0.75)

        # Calculate automation targets
        if current_month < 2:
            # First 2 months: Planning phase
            webui_target = 0
            tableau_target = 0
        else:
            # Progressive automation, maintaining manual minimum
            webui_target = min(
                int(max_automation * 0.6),  # 60% of automatable goes to Web UI
                int((current_month / self.total_months) * max_automation * 0.6)
            )
            tableau_target = min(
                int(max_automation * 0.4),  # 40% of automatable goes to Tableau
                int((current_month / self.total_months) * max_automation * 0.4)
            )

        manual = self.total_reports - webui_target - tableau_target - retirement_target

        # Calculate flows from previous month
        if current_month > 0:
            prev_flows = self.calculate_flows(current_month - 1)
            webui_flow = webui_target - prev_flows['webui']
            tableau_flow = tableau_target - prev_flows['tableau']
            retirement_flow = retirement_target - prev_flows['retired']
        else:
            webui_flow = 0
            tableau_flow = 0
            retirement_flow = 0

        return {
            'manual': manual,
            'webui': webui_target,
            'tableau': tableau_target,
            'retired': retirement_target,
            'manual_to_webui': webui_flow,
            'manual_to_tableau': tableau_flow,
            'manual_to_retired': retirement_flow
        }

    def create_sankey(self, current_month):
        flows = self.calculate_flows(current_month)

        # Define node labels with counts
        label = [
            f"Manual<br>({flows['manual']})",
            f"Web UI<br>({flows['webui']})",
            f"Tableau<br>({flows['tableau']})",
            f"Retired<br>({flows['retired']})"
        ]

        # Define colors for nodes
        color = ['#ef4444', '#22c55e', '#3b82f6', '#6b7280']  # Red, Green, Blue, Gray

        # Create Sankey diagram with specified node positions
        fig = go.Figure(data=[go.Sankey(
            node = dict(
                pad = 15,
                thickness = 30,
                line = dict(color = "black", width = 0.5),
                label = label,
                color = color,
                x = [0.1, 0.9, 0.9, 0.5],    # Manual, Web UI, Tableau, Retired
                y = [0.5, 0.2, 0.8, 1.0]     # Spread out vertically
            ),
            link = dict(
                source = [0, 0, 0],  # Manual is source for all links
                target = [1, 2, 3],  # Web UI, Tableau, and Retired are targets
                value = [
                    flows['manual_to_webui'],
                    flows['manual_to_tableau'],
                    flows['manual_to_retired']
                ],
                color = [
                    'rgba(34, 197, 94, 0.5)',   # Semi-transparent green
                    'rgba(59, 130, 246, 0.5)',  # Semi-transparent blue
                    'rgba(107, 114, 128, 0.5)'  # Semi-transparent gray
                ]
            )
        )])

        # Add phase annotations
        if current_month < 2:
            phase_text = "Planning & Setup Phase"
        elif current_month < 3:
            phase_text = "Initial Automation Phase"
        elif current_month == 3:
            phase_text = "Beginning Retirement Process"
        else:
            phase_text = "Automation & Retirement in Progress"

        fig.add_annotation(
            text=phase_text,
            xref="paper", yref="paper",
            x=0, y=1.1,
            showarrow=False,
            font=dict(size=14)
        )

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
    col1, col2, col3, col4 = st.columns(4)

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

    with col4:
        st.metric(
            "Retired Reports",
            current_flows['retired'],
            delta=current_flows['manual_to_retired'] if month > 0 else None
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
            'Tableau': flows['tableau'],
            'Retired': flows['retired']
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
    progress_fig.add_trace(go.Scatter(
        x=progress_df['Month'],
        y=progress_df['Retired'],
        name='Retired',
        fill='tonexty',
        mode='lines',
        line=dict(color='#6b7280')
    ))

    progress_fig.update_layout(
        title='Progress Over Time',
        xaxis_title='Month',
        yaxis_title='Number of Reports',
        height=400
    )

    st.plotly_chart(progress_fig, use_container_width=True)