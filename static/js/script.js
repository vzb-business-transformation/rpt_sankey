// static/js/script.js
$(document).ready(function() {
    // State variables
    let nodeData = {};
    let nodeReports = {};
    let linkReports = {};
    let animationInterval = null;
    let currentReports = []; // Store current selected reports

    // Load owners for dropdown
    $.get('/get_owners', function(data) {
        const ownerSelect = $('#owner-select');
        ownerSelect.empty();

        data.owners.forEach(owner => {
            ownerSelect.append(`<option value="${owner}">${owner}</option>`);
        });

        // Load initial Sankey diagram
        loadSankey();
    });

    // Event handlers
    $('#owner-select').change(loadSankey);

    $('.time-btn').click(function() {
        $('.time-btn').removeClass('active');
        $(this).addClass('active');
        loadSankey();
    });

    $('#play-animation').click(function() {
        if (animationInterval) {
            // Stop animation if it's running
            clearInterval(animationInterval);
            animationInterval = null;
            $(this).text('▶ Play Animation');
        } else {
            // Start animation
            $(this).text('⏹ Stop Animation');

            // Reset to current state
            $('.time-btn').removeClass('active');
            $('.time-btn:first-child').addClass('active');
            loadSankey();

            let currentIndex = 0;
            const timeButtons = $('.time-btn');

            animationInterval = setInterval(function() {
                currentIndex = (currentIndex + 1) % timeButtons.length;
                timeButtons.removeClass('active');
                $(timeButtons[currentIndex]).addClass('active');
                loadSankey();

                if (currentIndex === timeButtons.length - 1) {
                    clearInterval(animationInterval);
                    animationInterval = null;
                    $('#play-animation').text('▶ Play Animation');
                }
            }, 2000); // Change every 2 seconds
        }
    });

    // Function to load the Sankey diagram
    function loadSankey() {
        // Show loading indicator
        $('#sankey-container').html('<div class="loading">Loading diagram...</div>');

        // Clear the reports list when loading new data
        $('#reports-list-container').empty();

        const selectedOwner = $('#owner-select').val();
        const selectedTimeBtn = $('.time-btn.active');
        const quarter = selectedTimeBtn.data('quarter');
        const year = selectedTimeBtn.data('year');

        // Update timeline context if selected
        if (quarter && year) {
            $('#timeline-context').text(`Data showing projection for Q${quarter} ${year}`);
        } else {
            $('#timeline-context').text('Data showing current state');
        }

        $.get('/get_sankey', {
            owner: selectedOwner,
            quarter: quarter,
            year: year
        }, function(data) {
            // Store the node and link data
            nodeData = data.node_data;
            nodeReports = data.node_reports;
            linkReports = data.link_reports;

            // Parse the Plotly figure
            const figure = JSON.parse(data.plot);
            Plotly.newPlot('sankey-container', figure.data, figure.layout);

            // Add click event listener
            document.getElementById('sankey-container').on('plotly_click', function(clickData) {
                handlePlotlyClick(clickData);
            });

            // Update statistics directly from the data
            if (data.stats) {
                updateStats(data.stats);
            } else {
                // Fallback to counting reports if stats not provided by server
                countReportsFromNodeData();
            }
        });
    }

    // Update stats using direct data from server
    function updateStats(stats) {
        const totalReports = stats.total_reports;
        const fullyCount = stats.automation_breakdown["Fully"] || 0;
        const semiCount = stats.automation_breakdown["Semi"] || 0;
        const tableauCount = stats.automation_breakdown["Tableau"] || 0;
        const manualCount = stats.automation_breakdown["Manual"] || 0;

        // Apply transition effect
        $('.stat-value').addClass('changing');

        // Update the stats display
        $('#total-reports').text(totalReports);

        const fullyPct = totalReports > 0 ? Math.round((fullyCount / totalReports) * 100) : 0;
        const semiPct = totalReports > 0 ? Math.round((semiCount / totalReports) * 100) : 0;
        const tableauPct = totalReports > 0 ? Math.round((tableauCount / totalReports) * 100) : 0;
        const manualPct = totalReports > 0 ? Math.round((manualCount / totalReports) * 100) : 0;

        $('#fully-reports').text(`${fullyCount} (${fullyPct}%)`);
        $('#semi-reports').text(`${semiCount} (${semiPct}%)`);
        $('#tableau-reports').text(`${tableauCount} (${tableauPct}%)`);
        $('#manual-reports').text(`${manualCount} (${manualPct}%)`);

        // Remove transition effect
        setTimeout(() => {
            $('.stat-value').removeClass('changing');
        }, 500);

        // Add highlight animation
        $('.stat-value').addClass('highlight');
        setTimeout(() => {
            $('.stat-value').removeClass('highlight');
        }, 1500);
    }

    // Fallback function to count reports if server doesn't provide stats
    function countReportsFromNodeData() {
        // Find automation level nodes
        let automationNodes = {};

        // Map automation levels to their node indices
        for (const nodeIndex in nodeData) {
            const nodeName = nodeData[nodeIndex];
            if (nodeName === 'Fully' || nodeName === 'Semi' || nodeName === 'Tableau' || nodeName === 'Manual') {
                automationNodes[nodeName] = nodeIndex;
            }
        }

        // Count reports for each automation level
        const fullyReports = nodeReports[automationNodes['Fully']] || [];
        const semiReports = nodeReports[automationNodes['Semi']] || [];
        const tableauReports = nodeReports[automationNodes['Tableau']] || [];
        const manualReports = nodeReports[automationNodes['Manual']] || [];

        // Calculate total reports
        const allReports = new Set([
            ...fullyReports,
            ...semiReports,
            ...tableauReports,
            ...manualReports
        ]);

        const stats = {
            total_reports: allReports.size,
            automation_breakdown: {
                "Fully": fullyReports.length,
                "Semi": semiReports.length,
                "Tableau": tableauReports.length,
                "Manual": manualReports.length
            }
        };

        updateStats(stats);
    }

    // Function to handle clicks on the Sankey diagram
    function handlePlotlyClick(data) {
        if (!data || !data.points || data.points.length === 0) return;

        const point = data.points[0];
        let reports = [];
        let title = '';

        if (point.pointNumber !== undefined) {
            // This is a node
            const nodeIndex = point.pointNumber;
            const nodeName = nodeData[nodeIndex];
            title = `Reports for ${nodeName}`;
            reports = nodeReports[nodeIndex] || [];
        } else if (point.source && point.target) {
            // This is a link
            const sourceIndex = point.source.index;
            const targetIndex = point.target.index;
            const sourceName = nodeData[sourceIndex];
            const targetName = nodeData[targetIndex];

            title = `Reports from ${sourceName} to ${targetName}`;
            reports = linkReports[`${sourceIndex}-${targetIndex}`] || [];
        }

        // Store current reports
        currentReports = reports;

        // Display reports below chart
        displayReportsList(title, reports);
    }

    // Display reports in the reports list container
    function displayReportsList(title, reports) {
        const container = $('#reports-list-container');
        container.empty();

        // Create section title
        const sectionTitle = $('<h3>').text(title);
        container.append(sectionTitle);

        if (!reports || reports.length === 0) {
            container.append($('<p>').text('No reports found'));
            return;
        }

        // Create reports list
        const list = $('<ul class="reports-list"></ul>');
        reports.forEach(report => {
            const item = $('<li>').text(report);
            item.click(function() {
                // Remove previous selection
                $('.reports-list li').removeClass('selected');
                // Add selection to current item
                $(this).addClass('selected');
                // Show details
                showReportDetails(report, item);
            });
            list.append(item);
        });

        container.append(list);

        // Add details container
        const detailsContainer = $('<div id="report-details-container"></div>');
        container.append(detailsContainer);

        // Scroll to reports container
        $('html, body').animate({
            scrollTop: container.offset().top - 20
        }, 500);
    }

    // Function to show detailed information about a report
    function showReportDetails(reportName, element) {
        // Get report details from the API
        $.get('/get_report_details', { report_name: reportName }, function(data) {
            if (data.error) {
                console.error(data.error);
                return;
            }

            const report = data.report;
            const detailsContainer = $('#report-details-container');
            detailsContainer.empty();

            const detailsBox = $('<div class="report-details-box"></div>');

            // Create details content
            const content = `
                <h4>${reportName}</h4>
                <div class="details-grid">
                    <div class="detail-row">
                        <div class="detail-label">Data Source:</div>
                        <div class="detail-value">${report.data_source}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Owner:</div>
                        <div class="detail-value">${report.report_owner}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Stakeholder:</div>
                        <div class="detail-value">${report.stakeholder}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Program:</div>
                        <div class="detail-value">${report.program || 'N/A'}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Output Type:</div>
                        <div class="detail-value">${report.output_type}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Automation:</div>
                        <div class="detail-value">${report.automation_level}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Delivery:</div>
                        <div class="detail-value">${report.delivery_schedule}</div>
                    </div>
                </div>
            `;

            detailsBox.html(content);
            detailsContainer.append(detailsBox);
            detailsBox.addClass('fade-in');
        });
    }
});