# app.py
from flask import Flask, render_template, request, jsonify
import pandas as pd
import plotly.graph_objects as go
import json

app = Flask(__name__)


# Load and prepare data
def load_data():
    report_df = pd.read_csv('file/reports.csv')
    df = report_df[report_df['Report_Name'].notna()]

    new_name = ['data_source', 'report_name', 'stakeholder', 'program',
                'delivery_schedule', 'report_owner', 'output_type', 'automation_level']

    for i, c in enumerate(df.columns):
        df = df.rename(columns={c: new_name[i]}, errors="raise")

    return df


# Create the transformation functions for future projections
# Create the transformation functions for future projections
def apply_transformation(df, quarter, year):
    """Apply roadmap transformations for the specified quarter and year"""

    # Create a deep copy to avoid modifying the original dataframe
    transformed_df = df.copy(deep=True)

    # Skip transformation if quarter or year is None or empty
    if quarter is None or year is None or quarter == '' or year == '':
        return transformed_df

    # Make sure quarter and year are integers
    quarter = int(quarter)
    year = int(year)

    # Calculate how many quarters into the roadmap we are (Q1 2025 = 1, Q2 2026 = 6)
    quarters_from_start = 0
    if year == 2025:
        quarters_from_start = quarter
    elif year == 2026:
        quarters_from_start = 4 + quarter

    # Target is to transform 80% of Semi-Automated reports by Q2 2026 (quarter 6)
    # Calculate what percentage should be transformed by the current quarter
    # Linear progression over 6 quarters
    target_pct = min(0.8, (quarters_from_start / 6) * 0.8)

    # Only transform Semi to either Fully or Tableau (based on initial requirements)
    semi_reports = transformed_df[transformed_df['automation_level'] == 'Semi']

    # Determine how many reports to transform
    num_to_transform = int(len(semi_reports) * (target_pct * 6 / 5))  # Adjust to hit 80% by Q2 2026

    if num_to_transform > 0:
        # Select the reports to transform
        to_transform_indices = semi_reports.sample(min(num_to_transform, len(semi_reports))).index

        # Transform 65% to Fully and 35% to Tableau
        for idx in to_transform_indices:
            if idx % 100 < 65:  # 65% to Fully
                transformed_df.loc[idx, 'automation_level'] = 'Fully'
            else:  # 35% to Tableau
                transformed_df.loc[idx, 'automation_level'] = 'Tableau'

    return transformed_df


def count_values(df, source_col, target_col):
    grouped = df.groupby([source_col, target_col]).size().reset_index(name='value')
    return grouped


# Create the Sankey diagram with the provided data
def create_sankey(df, selected_owner=None, quarter=None, year=None):
    # Filter by owner if specified
    if selected_owner and selected_owner != "All Owners":
        filtered_df = df[df['report_owner'] == selected_owner]
    else:
        filtered_df = df.copy()

    # Apply transformations for future projections if quarter and year are specified
    filtered_df = apply_transformation(filtered_df, quarter, year)

    # Create links between nodes
    link_source_owner = count_values(filtered_df, 'data_source', 'report_owner')
    link_owner_stakeholder = count_values(filtered_df, 'report_owner', 'stakeholder')
    link_stakeholder_output = count_values(filtered_df, 'stakeholder', 'output_type')
    link_output_automation = count_values(filtered_df, 'output_type', 'automation_level')
    link_automation_delivery = count_values(filtered_df, 'automation_level', 'delivery_schedule')

    # Define node categories
    data_sources = sorted(list(set([i for i in filtered_df['data_source']])))
    report_owners = sorted(list(set([i for i in filtered_df['report_owner']])))
    stakeholders = sorted(list(set([i for i in filtered_df['stakeholder']])))
    output_types = sorted(list(set([i for i in filtered_df['output_type']])))
    automation_levels = sorted(list(set([i for i in filtered_df['automation_level']])))
    delivery_schedules = sorted(list(set([i for i in filtered_df['delivery_schedule']])))

    # Map string values to numeric indices for the Sankey diagram
    all_nodes = data_sources + report_owners + stakeholders + output_types + automation_levels + delivery_schedules
    node_indices = {node: i for i, node in enumerate(all_nodes)}

    # Create source, target, and value lists for the Sankey diagram
    sources = []
    targets = []
    values = []
    link_colors = []

    # Define color palette
    color_source = "rgba(31, 119, 180, 0.4)"  # blue
    color_owner = "rgba(255, 127, 14, 0.4)"  # orange
    color_stakeholder = "rgba(44, 160, 44, 0.4)"  # green
    color_output = "rgba(214, 39, 40, 0.4)"  # red
    color_automation = "rgba(148, 103, 189, 0.4)"  # purple

    # Create a dictionary to store report names for each link
    link_reports = {}

    # Function to get report names for a specific connection
    def get_report_names(df, col1, val1, col2, val2):
        filtered = df[(df[col1] == val1) & (df[col2] == val2)]
        return filtered['report_name'].tolist()

    # Add data source -> report owner links
    for _, row in link_source_owner.iterrows():
        source_idx = node_indices[row['data_source']]
        target_idx = node_indices[row['report_owner']]
        sources.append(source_idx)
        targets.append(target_idx)
        values.append(row['value'])
        link_colors.append(color_source)

        # Store report names for this link
        reports = get_report_names(filtered_df, 'data_source', row['data_source'], 'report_owner', row['report_owner'])
        link_reports[f"{source_idx}-{target_idx}"] = reports

    # Add report owner -> stakeholder links
    for _, row in link_owner_stakeholder.iterrows():
        source_idx = node_indices[row['report_owner']]
        target_idx = node_indices[row['stakeholder']]
        sources.append(source_idx)
        targets.append(target_idx)
        values.append(row['value'])
        link_colors.append(color_owner)

        # Store report names for this link
        reports = get_report_names(filtered_df, 'report_owner', row['report_owner'], 'stakeholder', row['stakeholder'])
        link_reports[f"{source_idx}-{target_idx}"] = reports

    # Add stakeholder -> output type links
    for _, row in link_stakeholder_output.iterrows():
        source_idx = node_indices[row['stakeholder']]
        target_idx = node_indices[row['output_type']]
        sources.append(source_idx)
        targets.append(target_idx)
        values.append(row['value'])
        link_colors.append(color_stakeholder)

        # Store report names for this link
        reports = get_report_names(filtered_df, 'stakeholder', row['stakeholder'], 'output_type', row['output_type'])
        link_reports[f"{source_idx}-{target_idx}"] = reports

    # Add output type -> automation level links
    for _, row in link_output_automation.iterrows():
        source_idx = node_indices[row['output_type']]
        target_idx = node_indices[row['automation_level']]
        sources.append(source_idx)
        targets.append(target_idx)
        values.append(row['value'])
        link_colors.append(color_output)

        # Store report names for this link
        reports = get_report_names(filtered_df, 'output_type', row['output_type'], 'automation_level',
                                   row['automation_level'])
        link_reports[f"{source_idx}-{target_idx}"] = reports

    # Add automation level -> delivery schedule links
    for _, row in link_automation_delivery.iterrows():
        source_idx = node_indices[row['automation_level']]
        target_idx = node_indices[row['delivery_schedule']]
        sources.append(source_idx)
        targets.append(target_idx)
        values.append(row['value'])
        link_colors.append(color_automation)

        # Store report names for this link
        reports = get_report_names(filtered_df, 'automation_level', row['automation_level'], 'delivery_schedule',
                                   row['delivery_schedule'])
        link_reports[f"{source_idx}-{target_idx}"] = reports

    # Define node colors
    node_colors = (
            ["rgba(31, 119, 180, 0.8)"] * len(data_sources) +  # Data sources: blue
            ["rgba(255, 127, 14, 0.8)"] * len(report_owners) +  # Report owners: orange
            ["rgba(44, 160, 44, 0.8)"] * len(stakeholders) +  # Stakeholders: green
            ["rgba(214, 39, 40, 0.8)"] * len(output_types) +  # Output types: red
            ["rgba(148, 103, 189, 0.8)"] * len(automation_levels) +  # Automation: purple
            ["rgba(140, 86, 75, 0.8)"] * len(delivery_schedules)  # Delivery: brown
    )

    # Create the Sankey diagram
    fig = go.Figure(data=[go.Sankey(
        node=dict(
            pad=15,
            thickness=20,
            line=dict(color="black", width=0.5),
            label=all_nodes,
            color=node_colors,
            x=[0.05] * len(data_sources) +
              [0.25] * len(report_owners) +
              [0.45] * len(stakeholders) +
              [0.65] * len(output_types) +
              [0.85] * len(automation_levels) +
              [0.95] * len(delivery_schedules)
        ),
        link=dict(
            source=sources,
            target=targets,
            value=values,
            color=link_colors
        )
    )])

    # Add text labels for each section
    fig.add_annotation(
        x=0.01,
        y=-0.10,
        text="DATA SOURCES",
        showarrow=False,
        font=dict(size=16, color="rgba(31, 119, 180, 1.0)"),
        xref="paper",
        yref="paper"
    )

    fig.add_annotation(
        x=0.20,
        y=-0.10,
        text="REPORT OWNERS",
        showarrow=False,
        font=dict(size=16, color="rgba(255, 127, 14, 1.0)"),
        xref="paper",
        yref="paper"
    )

    fig.add_annotation(
        x=0.44,
        y=-0.10,
        text="STAKEHOLDERS",
        showarrow=False,
        font=dict(size=16, color="rgba(44, 160, 44, 1.0)"),
        xref="paper",
        yref="paper"
    )

    fig.add_annotation(
        x=0.60,
        y=-0.10,
        text="OUTPUT TYPES",
        showarrow=False,
        font=dict(size=16, color="rgba(214, 39, 40, 1.0)"),
        xref="paper",
        yref="paper"
    )

    fig.add_annotation(
        x=0.84,
        y=-0.10,
        text="AUTOMATION",
        showarrow=False,
        font=dict(size=16, color="rgba(148, 103, 189, 1.0)"),
        xref="paper",
        yref="paper"
    )

    fig.add_annotation(
        x=0.99,
        y=-0.10,
        text="DELIVERY",
        showarrow=False,
        font=dict(size=16, color="rgba(140, 86, 75, 1.0)"),
        xref="paper",
        yref="paper"
    )

    # Update layout
    title_text = "Reporting Management Flow"
    if quarter and year and quarter != '' and year != '':
        title_text = f"Reporting Management Flow - Q{quarter} {year} Projection"

    if selected_owner and selected_owner != "All Owners":
        title_text += f" - {selected_owner}"

    fig.update_layout(
        title_text=title_text,
        font_size=14,
        height=800,
        width=1200,
        margin=dict(b=100),  # Add extra bottom margin for the labels
        clickmode="event+select"
    )

    return fig, all_nodes, link_reports, node_indices


# Function to find specific reports in the system
def find_reports(df, criteria_dict):
    """
    Find reports matching multiple criteria

    Parameters:
    df (DataFrame): DataFrame containing the reports
    criteria_dict (dict): Dictionary of column:value pairs to match

    Returns:
    pandas.DataFrame: Matching reports
    """
    result = df.copy()
    for col, val in criteria_dict.items():
        result = result[result[col] == val]

    return result[['report_name', 'data_source', 'report_owner', 'stakeholder',
                   'output_type', 'automation_level', 'delivery_schedule']]


# Routes
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/get_owners')
def get_owners():
    df = load_data()
    owners = sorted(list(set([i for i in df['report_owner']])))
    return jsonify({"owners": ["All Owners"] + owners})


@app.route('/get_sankey')
def get_sankey():
    df = load_data()
    selected_owner = request.args.get('owner', 'All Owners')
    quarter = request.args.get('quarter', '')
    year = request.args.get('year', '')

    # Get figure and data from create_sankey
    fig, all_nodes, link_reports, node_indices = create_sankey(df, selected_owner, quarter, year)

    # Recreate filtered_df here to match what's in create_sankey
    if selected_owner and selected_owner != "All Owners":
        filtered_df = df[df['report_owner'] == selected_owner]
    else:
        filtered_df = df.copy()

    # Apply the same transformations
    filtered_df = apply_transformation(filtered_df, quarter, year)

    # Prepare data for client-side processing
    node_data = {i: node for i, node in enumerate(all_nodes)}

    # Get reports for each node
    node_reports = {}

    # Get actual automation levels from data
    automation_levels = list(set([i for i in df['automation_level']]))
    # Should be ['Manual', 'Semi', 'Fully', 'Tableau']

    for node_name in all_nodes:
        node_idx = node_indices[node_name]

        # Create specialized queries for each type of node
        if node_name in df['data_source'].values:
            node_reports[node_idx] = df[df['data_source'] == node_name]['report_name'].tolist()
        elif node_name in df['report_owner'].values:
            node_reports[node_idx] = df[df['report_owner'] == node_name]['report_name'].tolist()
        elif node_name in df['stakeholder'].values:
            node_reports[node_idx] = df[df['stakeholder'] == node_name]['report_name'].tolist()
        elif node_name in df['output_type'].values:
            node_reports[node_idx] = df[df['output_type'] == node_name]['report_name'].tolist()
        elif node_name in automation_levels:
            # Get all reports with this automation level from the filtered dataframe
            node_reports[node_idx] = filtered_df[filtered_df['automation_level'] == node_name]['report_name'].tolist()
        elif node_name in df['delivery_schedule'].values:
            node_reports[node_idx] = df[df['delivery_schedule'] == node_name]['report_name'].tolist()

    # Check each automation level exists in filtered_df
    auto_breakdown = {}
    for level in automation_levels:
        count = len(filtered_df[filtered_df['automation_level'] == level])
        auto_breakdown[level] = count

        # Ensure we include nodes for all automation levels in the response, even if 0 reports
        if level not in all_nodes:
            # Find index for this level if it's in node_indices
            if level in node_indices:
                idx = node_indices[level]
                node_reports[idx] = []

    # Add summary statistics
    stats = {
        "total_reports": len(filtered_df),
        "automation_breakdown": auto_breakdown
    }

    # Add custom data to the response
    response = {
        "plot": fig.to_json(),
        "node_data": node_data,
        "node_reports": node_reports,
        "link_reports": link_reports,
        "stats": stats
    }

    return jsonify(response)


@app.route('/get_report_details')
def get_report_details():
    report_name = request.args.get('report_name')
    df = load_data()

    if not report_name:
        return jsonify({"error": "No report name provided"})

    report = df[df['report_name'] == report_name]

    if len(report) == 0:
        return jsonify({"error": f"Report '{report_name}' not found"})

    report_data = report.iloc[0].to_dict()

    return jsonify({"report": report_data})



if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True, port=5008)