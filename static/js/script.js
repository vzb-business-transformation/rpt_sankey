// static/js/script.js

$(document).ready(function() {
    // State variables
    let nodeData = {};
    let nodeReports = {};
    let linkReports = {};
    let animationInterval = null;
    let currentData = null;

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
        const selectedOwner = $('#owner-select').val();
        const selectedTimeBtn = $('.time-btn.active');
        const quarter = selectedTimeBtn.data('quarter');
        const year = selectedTimeBtn.data('year');

        $.get('/get_sankey', {
            owner: selectedOwner,
            quarter: quarter,
            year: year
        }, function(data) {
            currentData = data;

            // Store the node and link data
            nodeData = data.node_data;
            nodeReports = data.node_reports;
            linkReports = data.link_reports;

            // Parse the Plotly figure
            const figure = JSON.parse(data.plot);
            Plotly.newPlot('sankey-container', figure.data, figure.layout);

            // Add click event listener
            document.getElementById('sankey-container').on('plotly_click', function(data) {
                handlePlotlyClick(data);
            });

            // Update statistics
            updateStats(figure);
        });
    }

    // Function to update statistics
    function updateStats(figure) {
        if (!figure || !figure.data || !figure.data[0]) return;

        const sankeyData = figure.data[0];

        // Find indices of automation levels
        let automationIndices = [];
        let automationLabelMap = {};

        sankeyData.node.label.forEach((label, index) => {
            if (label === 'Fully Automated' || label === 'Self Service' || label === 'Manual') {
                automationIndices.push(index);
                automationLabelMap[label] = index;
            }
        });

        // Count reports by automation level
        let totalReports = 0;
        let automatedReports = 0;
        let selfServiceReports = 0;
        let manualReports = 0;

        // Count outgoing links from automation nodes to get total reports
        sankeyData.link.source.forEach((source, index) => {
            if (automationIndices.includes(source)) {
                const value = sankeyData.link.value[index];
                totalReports += value;

                if (source === automationLabelMap['Fully Automated']) {
                    automatedReports += value;
                } else if (source === automationLabelMap['Self Service']) {
                    selfServiceReports += value;
                } else if (source === automationLabelMap['Manual']) {
                    manualReports += value;
                }
            }
        });

        // Update the stats display
        $('#total-reports').text(totalReports);

        const automatedPct = totalReports > 0 ? Math.round((automatedReports / totalReports) * 100) : 0;
        const selfServicePct = totalReports > 0 ? Math.round((selfServiceReports / totalReports) * 100) : 0;
        const manualPct = totalReports > 0 ? Math.round((manualReports / totalReports) * 100) : 0;

        $('#automated-reports').text(`${automatedReports} (${automatedPct}%)`);
        $('#self-service-reports').text(`${selfServiceReports} (${selfServicePct}%)`);
        $('#manual-reports').text(`${manualReports} (${manualPct}%)`);

        // Add highlight animation when values change
        $('.stat-value').addClass('highlight');
        setTimeout(() => {
            $('.stat-value').removeClass('highlight');
        }, 1500);
    }

    // Function to handle clicks on the Sankey diagram
    function handlePlotlyClick(data) {
        if (!data || !data.points || data.points.length === 0) return;

        const point = data.points[0];
        const panel = document.getElementById('report-panel');
        const panelTitle = document.getElementById('panel-title');
        const reportList = document.getElementById('report-list');

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

        // Populate and show the panel
        panelTitle.textContent = title;
        reportList.innerHTML = '';

        if (reports.length === 0) {
            reportList.innerHTML = '<li>No reports found</li>';
        } else {
            reports.forEach(report => {
                const li = document.createElement('li');
                li.textContent = report;
                li.onclick = function() {
                    showReportDetails(report, li);
                };
                reportList.appendChild(li);
            });
        }

        panel.style.display = 'block';
        panel.classList.add('fade-in');
    }

    // Function to show detailed information about a report
    function showReportDetails(reportName, element) {
        // Remove any existing details
        $('.report-details').remove();

        // Get report details from the API
        $.get('/get_report_details', { report_name: reportName }, function(data) {
            if (data.error) {
                console.error(data.error);
                return;
            }

            const report = data.report;
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'report-details fade-in';

            detailsDiv.innerHTML = `
                <p><strong>Data Source:</strong> <span>${report.data_source}</span></p>
                <p><strong>Owner:</strong> <span>${report.report_owner}</span></p>
                <p><strong>Stakeholder:</strong> <span>${report.stakeholder}</span></p>
                <p><strong>Program:</strong> <span>${report.program || 'N/A'}</span></p>
                <p><strong>Output Type:</strong> <span>${report.output_type}</span></p>
                <p><strong>Automation:</strong> <span>${report.automation_level}</span></p>
                <p><strong>Delivery:</strong> <span>${report.delivery_schedule}</span></p>
            `;

            element.appendChild(detailsDiv);
        });
    }
});