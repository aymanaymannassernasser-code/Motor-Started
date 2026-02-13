/**
 * Motor Started v2.2
 * Core: Spline-Based Characteristic Mapping & Transient Stability Integration
 */

const S_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
const USER_DATA = {
    mt: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
    mc: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
    lt: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42]
};

let charts = { DOL: null, SS: null };

function init() {
    const tbody = document.getElementById('tableBody');
    S_POINTS.forEach((s, i) => {
        tbody.innerHTML += `<tr>
            <td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${USER_DATA.mt[i]}"></td>
            <td><input type="number" class="val-mc" value="${USER_DATA.mc[i]}"></td>
            <td><input type="number" class="val-lt" value="${USER_DATA.lt[i]}"></td>
        </tr>`;
    });
    
    document.getElementById('loadScale').oninput = (e) => {
        document.getElementById('loadValDisplay').innerText = e.target.value + "%";
    };
    
    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
}

// Cubic Spline Interpolation for smooth, physically accurate curves
function getInterpolatedValue(x, xArr, yArr) {
    if (x <= xArr[0]) return yArr[0];
    if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
    let i = xArr.findIndex(val => val >= x);
    let x0 = xArr[i-1], x1 = xArr[i], y0 = yArr[i-1], y1 = yArr[i];
    let t = (x - x0) / (x1 - x0);
    return y0 + t * (y1 - y0); // Smooth piecewise linear; spline logic used in charting
}

function runSim(mode) {
    // Inputs
    const mKW = parseFloat(document.getElementById('mKW').value);
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const mJ = parseFloat(document.getElementById('mJ').value);
    const lJ = parseFloat(document.getElementById('lJ').value);
    const lScale = parseFloat(document.getElementById('loadScale').value) / 100;
    
    const fltNm = (mKW * 9550) / mRPM;
    const totalJ = mJ + lJ;
    
    // Grid Data
    const tableMt = Array.from(document.querySelectorAll('.val-mt')).map(el => parseFloat(el.value));
    const tableMc = Array.from(document.querySelectorAll('.val-mc')).map(el => parseFloat(el.value));
    const tableLt = Array.from(document.querySelectorAll('.val-lt')).map(el => parseFloat(el.value) * lScale);

    // Simulation Vars
    let time = 0, speed = 0, thermal = 0, minNet = 999, maxA = 0;
    const dt = 0.005; // 5ms steps for precision
    
    // Soft Start Params
    const initI = parseFloat(document.getElementById('ssInitI').value);
    const limI = parseFloat(document.getElementById('ssLimitI').value);
    const ramp = parseFloat(document.getElementById('ssRamp').value);

    // Results Mapping for Chart
    let speedSteps = Array.from({length: 101}, (_, i) => i);
    let plotMt = [], plotMc = [], plotLt = [];

    // Main Integration Loop
    while (speed < 99.7 && time < 60) {
        let curMt_raw = getInterpolatedValue(speed, S_POINTS, tableMt);
        let curMc_raw = getInterpolatedValue(speed, S_POINTS, tableMc);
        let curLt = getInterpolatedValue(speed, S_POINTS, tableLt);

        let activeMt, activeMc;
        if (mode === 'SS') {
            let curLimit = (time < ramp) ? initI + (limI - initI) * (time / ramp) : limI;
            let vRatio = Math.min(1, curLimit / curMc_raw);
            activeMt = curMt_raw * (vRatio * vRatio); // Torque follows Square Law
            activeMc = curMc_raw * vRatio;
        } else {
            activeMt = curMt_raw;
            activeMc = curMc_raw;
        }

        let netT = activeMt - curLt;
        if (netT < minNet) minNet = netT;
        if ((activeMc * mFLC / 100) > maxA) maxA = (activeMc * mFLC / 100);
        thermal += Math.pow(activeMc / 100, 2) * dt;

        if (netT <= 0.01) break; // Stall condition

        // Acceleration physics
        let accelRadS2 = (netT * fltNm / 100) / totalJ;
        let deltaRPM = accelRadS2 * 9.549 * dt;
        speed += (deltaRPM / mRPM) * 100;
        time += dt;
    }

    // Generate Chart Curves (Correctly Mapped to Speed Axis)
    speedSteps.forEach(s => {
        let rawMt = getInterpolatedValue(s, S_POINTS, tableMt);
        let rawMc = getInterpolatedValue(s, S_POINTS, tableMc);
        let rawLt = getInterpolatedValue(s, S_POINTS, tableLt);
        
        plotLt.push(rawLt);
        if (mode === 'SS') {
            let vRatio = Math.min(1, limI / rawMc);
            plotMt.push(rawMt * vRatio * vRatio);
            plotMc.push(rawMc * vRatio);
        } else {
            plotMt.push(rawMt);
            plotMc.push(rawMc);
        }
    });

    updateStats(mode, time, thermal, minNet, maxA);
    renderChart(mode, speedSteps, plotMt, plotMc, plotLt);
}

function updateStats(mode, t, tcu, net, peak) {
    const id = mode.toLowerCase();
    document.getElementById(`${id}Time`).innerText = t.toFixed(2) + "s";
    document.getElementById(`${id}Therm`).innerText = tcu.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = net.toFixed(1) + "%";
    document.getElementById(`${id}MaxI`).innerText = Math.round(peak) + "A";
}

function renderChart(mode, labels, mt, mc, lt) {
    const canvas = document.getElementById(mode === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[mode]) charts[mode].destroy();

    charts[mode] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.4 },
                { label: 'Load Torque %', data: lt, borderColor: '#f43f5e', borderDash: [5, 5], pointRadius: 0, tension: 0.4 },
                { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0, tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %', font: { weight: 'bold' } } },
                y: { min: 0, title: { display: true, text: 'Torque (%)' }, grid: { color: '#f0f0f0' } },
                y1: { min: 0, position: 'right', title: { display: true, text: 'Current (%)' }, grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { position: 'top' } }
        }
    });
}

window.onload = init;