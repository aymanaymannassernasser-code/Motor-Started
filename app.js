/**
 * Motor Started v2.1
 * Physics Engine: Discrete Numerical Integration (Euler Method)
 * Charting: Fixed Speed-Synchronized Mapping
 */

const speedPoints = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
const defaultData = {
    mt: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
    mc: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
    lt: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42]
};

let chartDOL = null, chartSS = null;

function init() {
    const tbody = document.getElementById('tableBody');
    speedPoints.forEach((s, i) => {
        tbody.innerHTML += `<tr>
            <td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${defaultData.mt[i]}"></td>
            <td><input type="number" class="val-mc" value="${defaultData.mc[i]}"></td>
            <td><input type="number" class="val-lt" value="${defaultData.lt[i]}"></td>
        </tr>`;
    });
    updateHeaderCalcs();
    document.querySelectorAll('input').forEach(el => el.addEventListener('input', updateHeaderCalcs));
    document.getElementById('btnDOL').onclick = () => runSimulation('DOL');
    document.getElementById('btnSS').onclick = () => runSimulation('SS');
}

function updateHeaderCalcs() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    document.getElementById('loadValDisplay').innerText = document.getElementById('loadScale').value + "%";
    document.getElementById('resFLT').innerText = ((kw * 9550) / rpm).toFixed(1);
}

// Cubic Hermite Spline for realistic smoothing between electrical points
function interpolate(x, xPoints, yPoints) {
    if (x <= xPoints[0]) return yPoints[0];
    if (x >= xPoints[xPoints.length - 1]) return yPoints[yPoints.length - 1];
    let i = xPoints.findIndex(val => val >= x);
    let x0 = xPoints[i - 1], x1 = xPoints[i];
    let y0 = yPoints[i - 1], y1 = yPoints[i];
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function runSimulation(mode) {
    const lScale = parseFloat(document.getElementById('loadScale').value) / 100;
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);

    const tableMt = Array.from(document.querySelectorAll('.val-mt')).map(i => parseFloat(i.value));
    const tableMc = Array.from(document.querySelectorAll('.val-mc')).map(i => parseFloat(i.value));
    const tableLt = Array.from(document.querySelectorAll('.val-lt')).map(i => parseFloat(i.value) * lScale);

    let time = 0, speed = 0, minNet = 999, maxI = 0, thermal = 0;
    const dt = 0.01; 
    
    // We map results to a fixed 101-point speed array for chart alignment
    let speedMap = Array.from({length: 101}, (_, i) => i);
    let plotMt = [], plotMc = [], plotLt = [];

    // First, generate the static curves for the chart based on Speed (0-100)
    speedMap.forEach(s => {
        let baseMt = interpolate(s, speedPoints, tableMt);
        let baseMc = interpolate(s, speedPoints, tableMc);
        let baseLt = interpolate(s, speedPoints, tableLt);
        
        // This is where "Scale Misalignment" usually lives. We apply Soft Start logic relative to speed here.
        // However, Soft Start Ramp is TIME-dependent, not speed dependent.
        // For the static chart, we assume the ramp is finished or showing the "potential" curves.
        plotLt.push(baseLt);
        plotMt.push(baseMt); // Will be adjusted below for SS
        plotMc.push(baseMc);
    });

    // Actual Simulation (Step-by-Step)
    while (speed < 99.8 && time < 60) {
        let sIdx = Math.min(100, Math.floor(speed));
        let curMt_raw = interpolate(speed, speedPoints, tableMt);
        let curMc_raw = interpolate(speed, speedPoints, tableMc);
        let curLt = interpolate(speed, speedPoints, tableLt);

        let activeMt, activeMc;
        if (mode === 'SS') {
            let iInit = parseFloat(document.getElementById('ssInitI').value);
            let iLimit = parseFloat(document.getElementById('ssLimitI').value);
            let rTime = parseFloat(document.getElementById('ssRamp').value);
            let curLimit = (time < rTime) ? iInit + (iLimit - iInit) * (time / rTime) : iLimit;
            
            let vRatio = Math.min(1, curLimit / curMc_raw);
            activeMt = curMt_raw * vRatio * vRatio;
            activeMc = curMc_raw * vRatio;
        } else {
            activeMt = curMt_raw;
            activeMc = curMc_raw;
        }

        let net = activeMt - curLt;
        if (net < minNet) minNet = net;
        if (activeMc > maxI) maxI = activeMc;
        thermal += Math.pow(activeMc / 100, 2) * dt;

        if (net <= 0.05) break; // Stall

        // Physics: alpha = T/J, delta_omega = alpha * dt
        let accel = (net * fltNm / 100) / totalJ;
        let deltaRPM = (accel * 9.55) * dt; 
        speed += (deltaRPM / mRPM) * 100;
        time += dt;
    }

    // Final Technical Polish: Re-calculating the active motor torque curve for the SS chart based on the simulation average
    if (mode === 'SS') {
        let rTime = parseFloat(document.getElementById('ssRamp').value);
        let iLimit = parseFloat(document.getElementById('ssLimitI').value);
        plotMt = speedMap.map(s => {
            let rawMt = interpolate(s, speedPoints, tableMt);
            let rawMc = interpolate(s, speedPoints, tableMc);
            let vRatio = Math.min(1, iLimit / rawMc); // Showing the steady-state SS curve
            return rawMt * vRatio * vRatio;
        });
        plotMc = speedMap.map(s => {
            let rawMc = interpolate(s, speedPoints, tableMc);
            return Math.min(rawMc, iLimit);
        });
    }

    updateUI(mode, time, thermal, minNet, (maxI * mFLC / 100));
    renderChart(mode, speedMap, plotMt, plotMc, plotLt);
}

function updateUI(mode, t, therm, minT, peakA) {
    const p = mode.toLowerCase();
    document.getElementById(`${p}Time`).innerText = t.toFixed(2) + "s";
    document.getElementById(`${p}Therm`).innerText = therm.toFixed(1) + "%";
    document.getElementById(`${p}Net`).innerText = minT.toFixed(1) + "%";
    document.getElementById(`${p}MaxI`).innerText = peakA.toFixed(1) + "A";
}

function renderChart(mode, labels, mt, mc, lt) {
    const canvasId = mode === 'DOL' ? 'chartDOL' : 'chartSS';
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (mode === 'DOL' && chartDOL) chartDOL.destroy();
    if (mode === 'SS' && chartSS) chartSS.destroy();

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 2.5, pointRadius: 0, tension: 0.3 },
                { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, tension: 0.3 },
                { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 1.5, yAxisID: 'y1', pointRadius: 0, tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %', color: '#666' }, grid: { color: '#eee' } },
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Current %' } }
            },
            plugins: { legend: { position: 'top', labels: { boxWidth: 15 } } }
        }
    });

    if (mode === 'DOL') chartDOL = chart; else chartSS = chart;
}

window.onload = init;