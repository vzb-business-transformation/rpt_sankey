// static/js/script.js

$(document).ready(function() {
    // State variables
    let nodeData = {};
    let nodeReports = {};
    let linkReports = {};
    let animationInterval = null;
    let currentReports = []; // Store current selected reports
    let isLoading = false;

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

        // Update transformation progress
        updateTransformationProgress();
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
            updateTransformationProgress();

            let currentIndex = 0;
            const timeButtons = $('.time-btn');

            animationInterval = setInterval(function() {
                currentIndex = (currentIndex + 1) % timeButtons.length;
                timeButtons.removeClass('active');
                $(timeButtons[currentIndex]).addClass('active');
                loadSankey();
                updateTransformationProgress();

                if (currentIndex === timeButtons.length - 1) {
                    clearInterval(animationInterval);
                    animationInterval = null;
                    $('#play-animation').text('▶ Play Animation');
                }
            }, 3000); // Change every 3 seconds (increased for better visibility)
        }
    });

    // Set up selection mode buttons
    $('.select-btn').click(function() {
        $('#sankey-container').removeClass('inspect-mode');
        $('.selection-controls button').removeClass('active');
        $(this).addClass('active');
    });

    $('.inspect-btn').click(function() {
        $('#sankey-container').addClass('inspect-mode');
        $('.selection-controls button').removeClass('active');
        $(this).addClass('active');
    });

    // View all reports button
    $('#view-all-reports').click(function() {
        displayAllReports();
    });

    // Function to load the Sankey diagram
    function loadSankey() {
        // Clear any existing loading indicators first
        $('#sankey-container .loading').remove();

        // Prevent multiple simultaneous loads
        if (isLoading) return;
        isLoading = true;

        // Show loading indicator
        const loadingDiv = $('<div class="loading">Loading diagram...</div>');
        $('#sankey-container').html(loadingDiv);

        // Safety timeout - if loading takes more than 15 seconds, clear it
        const loadingTimeout = setTimeout(function() {
            if (isLoading) {
                isLoading = false;
                $('#sankey-container .loading').fadeOut(function() {
                    $(this).remove();
                });
            }
        }, 15000);

        // Clear the reports list when loading new data
        $('#reports-list-container').empty();

        const selectedOwner = $('#owner-select').val();
        const selectedTimeBtn = $('.time-btn.active');
        const quarter = selectedTimeBtn.data('quarter');
        const year = selectedTimeBtn.data('year');

        // Update timeline context if selected
        if (quarter && year) {
            $('#timeline-context').text(`Data showing projection for Q${quarter} ${year}`);

            // Calculate percentage through the roadmap (for progress bar)
            const totalQuarters = 7; // Current + 6 quarters
            let currentQuarter = 0;

            if (year === 2025) {
                currentQuarter = quarter;
            } else if (year === 2026) {
                currentQuarter = 4 + quarter;
            }

            const progressPercent = (currentQuarter / totalQuarters) * 100;
            $('#transformation-progress-bar').css('width', progressPercent + '%');
            $('#transformation-progress-text').text(`Transformation Progress: ${Math.round(progressPercent)}%`);
        } else {
            $('#timeline-context').text('Data showing current state');
            $('#transformation-progress-bar').css('width', '0%');
            $('#transformation-progress-text').text('Transformation Progress: 0%');
        }

        $.get('/get_sankey', {
            owner: selectedOwner,
            quarter: quarter,
            year: year
        }, function(data) {
            // Clear loading timeout
            clearTimeout(loadingTimeout);

            // Store the node and link data
            nodeData = data.node_data;
            nodeReports = data.node_reports;
            linkReports = data.link_reports;

            // Parse the Plotly figure
            const figure = JSON.parse(data.plot);

            // Configure hover mode to be more persistent
            if (figure.layout) {
                figure.layout.hovermode = 'closest';
                figure.layout.hoverdistance = 100;

                // Increase font size of labels
                if (figure.layout.font) {
                    figure.layout.font.size = 14;
                }
            }

            // Remove loading indicator
            $('#sankey-container .loading').remove();

            // Create Plotly diagram with improved configuration
            Plotly.newPlot('sankey-container', figure.data, figure.layout, {
                displayModeBar: true,
                modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
                responsive: true
            });

            // Add click event listener
            document.getElementById('sankey-container').on('plotly_click', function(clickData) {
                handlePlotlyClick(clickData);
            });

            // Make tooltips more stable by adding hover event
            document.getElementById('sankey-container').on('plotly_hover', function(hoverData) {
                // Capture hover events to keep tooltips visible longer in inspect mode
                if ($('#sankey-container').hasClass('inspect-mode')) {
                    // Keep tooltip visible
                    $('.js-plotly-plot .plotly .hoverlayer').css('opacity', 1);
                }
            });

            // Update statistics directly from the data
            if (data.stats) {
                updateStats(data.stats);
            } else {
                // Fallback to counting reports if stats not provided by server
                countReportsFromNodeData();
            }

            // Update the transformation summary
            updateTransformationSummary(data.stats);

            // Reset loading state
            isLoading = false;
        })
        .fail(function(error) {
            console.error("Error loading data:", error);
            $('#sankey-container').html('<div class="error-message">Error loading diagram. Please try again.</div>');
            isLoading = false;
            clearTimeout(loadingTimeout);
        });
    }

    // Update transformation progress metrics
    function updateTransformationProgress() {
        const selectedTimeBtn = $('.time-btn.active');
        const quarter = selectedTimeBtn.data('quarter');
        const year = selectedTimeBtn.data('year');

        if (!quarter || !year) {
            // Current state - no transformation
            $('#transformation-target').html('Target: Transform 80% of Semi-Automated reports by Q2 2026');
            return;
        }

        // Calculate progress based on the quarter/year
        let totalQuarters = 6; // 6 quarters in the roadmap
        let currentQuarter = 0;

        if (year === 2025) {
            currentQuarter = quarter;
        } else if (year === 2026) {
            currentQuarter = 4 + quarter;
        }

        // Calculate expected progress (linear progression)
        const expectedProgress = Math.min(80, Math.round((currentQuarter / totalQuarters) * 80));

        $('#transformation-target').html(`
            <div>Target: Transform 80% of Semi-Automated reports by Q2 2026</div>
            <div>Expected progress through Q${quarter} ${year}: ${expectedProgress}%</div>
        `);
    }

    // Update transformation summary based on current stats
    function updateTransformationSummary(stats) {
        if (!stats) return;

        const totalReports = stats.total_reports;
        const semiCount = stats.automation_breakdown["Semi"] || 0;

        // Original Semi count (assuming it was ~46 to start with)
        const originalSemi = 46;
        const transformedCount = originalSemi - semiCount;
        const transformationPercent = Math.round((transformedCount / originalSemi) * 100);

        let statusText = '';
        let statusClass = '';

        if (transformationPercent >= 80) {
            statusText = 'Target Achieved';
            statusClass = 'status-success';
        } else {
            const selectedTimeBtn = $('.time-btn.active');
            const quarter = selectedTimeBtn.data('quarter');
            const year = selectedTimeBtn.data('year');

            if (!quarter || !year) {
                statusText = 'Not Started';
                statusClass = 'status-not-started';
            } else {
                // Calculate expected progress
                let totalQuarters = 6; // 6 quarters in the roadmap
                let currentQuarter = 0;

                if (year === 2025) {
                    currentQuarter = quarter;
                } else if (year === 2026) {
                    currentQuarter = 4 + quarter;
                }

                const expectedProgress = Math.min(80, Math.round((currentQuarter / totalQuarters) * 80));

                if (transformationPercent >= expectedProgress) {
                    statusText = 'On Track';
                    statusClass = 'status-on-track';
                } else {
                    statusText = 'Behind Schedule';
                    statusClass = 'status-behind';
                }
            }
        }

        $('#transformation-summary').html(`
            <div class="summary-row">
                <div class="summary-label">Transformed Semi-Automated Reports:</div>
                <div class="summary-value">${transformedCount} of ${originalSemi} (${transformationPercent}%)</div>
            </div>
            <div class="summary-row">
                <div class="summary-label">Status:</div>
                <div class="summary-value ${statusClass}">${statusText}</div>
            </div>
        `);
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
        updateTransformationSummary(stats);
    }

    // Function to handle clicks on the Sankey diagram
    function handlePlotlyClick(data) {
        if (!data || !data.points || data.points.length === 0) return;

        const point = data.points[0];
        let reports = [];
        let title = '';
        let categoryName = '';

        if (point.pointNumber !== undefined) {
            // This is a node
            const nodeIndex = point.pointNumber;
            const nodeName = nodeData[nodeIndex];
            title = `Reports for ${nodeName}`;
            reports = nodeReports[nodeIndex] || [];
            categoryName = nodeName;
        } else if (point.source && point.target) {
            // This is a link
            const sourceIndex = point.source.index;
            const targetIndex = point.target.index;
            const sourceName = nodeData[sourceIndex];
            const targetName = nodeData[targetIndex];

            title = `Reports from ${sourceName} to ${targetName}`;
            reports = linkReports[`${sourceIndex}-${targetIndex}`] || [];
            categoryName = `${sourceName} to ${targetName}`;
        }

        // Store current reports
        currentReports = reports;

        // Display reports below chart
        displayReportsList(title, reports, categoryName);
    }

    // Display reports in the reports list container
    function displayReportsList(title, reports, categoryName) {
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
        reports.forEach((report, index) => {
            const item = $('<li>').text(report);
            // Set animation delay using CSS variable
            item.css('--index', index);

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

    // Function to display all reports grouped by automation level
    function displayAllReports() {
        const container = $('#reports-list-container');
        container.empty();

        // Create section title
        const sectionTitle = $('<h3>').text('All Reports by Automation Level');
        container.append(sectionTitle);

        // Get automation levels and their reports
        const automationLevels = [
            { name: 'Fully', class: 'fully-heading', reports: [] },
            { name: 'Semi', class: 'semi-heading', reports: [] },
            { name: 'Tableau', class: 'tableau-heading', reports: [] },
            { name: 'Manual', class: 'manual-heading', reports: [] }
        ];

        // Find reports for each level
        automationLevels.forEach(level => {
            for (const nodeIndex in nodeData) {
                if (nodeData[nodeIndex] === level.name) {
                    level.reports = nodeReports[nodeIndex] || [];
                    break;
                }
            }
        });

        let anyReports = false;

        // Create a section for each automation level that has reports
        automationLevels.forEach(level => {
            if (level.reports.length > 0) {
                anyReports = true;

                // Create category container
                const categoryDiv = $('<div class="reports-category"></div>');
                const levelTitle = $(`<h4 class="${level.class}">${level.name} Reports (${level.reports.length})</h4>`);
                categoryDiv.append(levelTitle);

                // Create reports list
                const list = $('<ul class="reports-list"></ul>');
                level.reports.forEach((report, index) => {
                    const item = $(`<li class="${level.name.toLowerCase()}-marker"></li>`).text(report);
                    // Set animation delay using CSS variable
                    item.css('--index', index);

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

                categoryDiv.append(list);
                container.append(categoryDiv);
            }
        });

        if (!anyReports) {
            container.append($('<p>').text('No reports found'));
        }

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