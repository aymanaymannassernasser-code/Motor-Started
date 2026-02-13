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
        tbody.innerHTML += `<tr><td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${USER_DATA.mt[i]}"></td>
            <td><input type="number" class="val-mc" value="${USER_DATA.mc[i]}"></td>
            <td><input type="number" class="val-lt" value="${USER_DATA.lt[i]}"></td></tr>`;
    });
    document.getElementById('loadScale').oninput = (e) => {
        document.getElementById('loadValDisplay').innerText = e.target.value + "%";
        updateCalculations();
    };
    updateCalculations();
    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
}

function updateCalculations() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    document.getElementById('resFLT').innerText = ((kw * 9550) / rpm).toFixed(1);
}

function interpolate(x, xArr, yArr) {
    if (x <= xArr[0]) return yArr[0];
    if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
    let i = xArr.findIndex(val => val >= x);
    let x0 = xArr[i-1], x1 = xArr[i], y0 = yArr[i-1], y1 = yArr[i];
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function runSim(mode) {
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const lScale = parseFloat(document.getElementById('loadScale').value) / 100;
    const lType = document.getElementById('loadType').value;

    const tableMt = Array.from(document.querySelectorAll('.val-mt')).map(el => parseFloat(el.value));
    const tableMc = Array.from(document.querySelectorAll('.val-mc')).map(el => parseFloat(el.value));
    const tableLt = Array.from(document.querySelectorAll('.val-lt')).map(el => parseFloat(el.value));

    let time = 0, speed = 0, thermal = 0, minNet = 999, maxA = 0;
    const dt = 0.005;
    const initI = parseFloat(document.getElementById('ssInitI').value), limI = parseFloat(document.getElementById('ssLimitI').value), ramp = parseFloat(document.getElementById('ssRamp').value);

    let labels = Array.from({length: 101}, (_, i) => i);
    let plotMt = [], plotMc = [], plotLt = [];

    // Integration
    while (speed < 99.7 && time < 60) {
        let rawMt = interpolate(speed, S_POINTS, tableMt);
        let rawMc = interpolate(speed, S_POINTS, tableMc);
        let baseLt = interpolate(speed, S_POINTS, tableLt);
        
        // Physics of Load Type
        let activeLt;
        if (lType === 'centrifugal') {
            // Torque follows Speed^2 law, scaled by the user slider
            activeLt = (baseLt * lScale) * Math.pow(speed / 100, 2);
            if (speed < 5) activeLt = baseLt * lScale; // Minimum breakaway torque
        } else {
            // Constant Torque: value from grid scaled by slider
            activeLt = baseLt * lScale;
        }

        let activeMt, activeMc;
        if (mode === 'SS') {
            let curLimit = (time < ramp) ? initI + (limI - initI) * (time / ramp) : limI;
            let vRatio = Math.min(1, curLimit / rawMc);
            activeMt = rawMt * (vRatio * vRatio);
            activeMc = rawMc * vRatio;
        } else {
            activeMt = rawMt;
            activeMc = rawMc;
        }

        let netT = activeMt - activeLt;
        if (netT < minNet) minNet = netT;
        if ((activeMc * mFLC / 100) > maxA) maxA = (activeMc * mFLC / 100);
        thermal += Math.pow(activeMc / 100, 2) * dt;
        if (netT <= 0.01) break;

        speed += ((netT * fltNm / 100) / totalJ) * 9.549 * dt / (mRPM / 100);
        time += dt;
    }

    // Chart Data Generation
    labels.forEach(s => {
        let baseMt = interpolate(s, S_POINTS, tableMt);
        let baseMc = interpolate(s, S_POINTS, tableMc);
        let baseLt = interpolate(s, S_POINTS, tableLt);
        let activeLt = (lType === 'centrifugal') ? (baseLt * lScale) * Math.pow(s / 100, 2) : baseLt * lScale;
        if (s < 5 && lType === 'centrifugal') activeLt = baseLt * lScale;

        plotLt.push(activeLt);
        if (mode === 'SS') {
            let vRatio = Math.min(1, limI / baseMc);
            plotMt.push(baseMt * vRatio * vRatio);
            plotMc.push(baseMc * vRatio);
        } else {
            plotMt.push(baseMt);
            plotMc.push(baseMc);
        }
    });

    updateStats(mode, time, thermal, minNet, maxA);
    renderChart(mode, labels, plotMt, plotMc, plotLt);
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
                { label: 'Motor Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.4 },
                { label: 'Load Torque %', data: lt, borderColor: '#f43f5e', borderDash: [5, 5], pointRadius: 0, tension: 0.1 },
                { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0, tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %' } },
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, position: 'right', title: { display: true, text: 'Current %' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}
window.onload = init;