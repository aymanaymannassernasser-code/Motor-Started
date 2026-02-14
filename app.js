const S_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
let charts = { DOL: null, SS: null };

function init() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    const defT = [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0];
    const defC = [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10];
    const defL = [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42];

    S_POINTS.forEach((s, i) => {
        tbody.innerHTML += `<tr><td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${defT[i]}"></td>
            <td><input type="number" class="val-mc" value="${defC[i]}"></td>
            <td><input type="number" class="val-lt" value="${defL[i]}"></td></tr>`;
    });
    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
    updateHeader();
}

function updateHeader() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    document.getElementById('resFLT').innerText = ((kw * 9550) / rpm).toFixed(1);
}

function interpolate(x, xArr, yArr) {
    if (x <= xArr[0]) return parseFloat(yArr[0]);
    if (x >= xArr[xArr.length - 1]) return parseFloat(yArr[yArr.length - 1]);
    let i = xArr.findIndex(val => val >= x);
    let x0 = xArr[i-1], x1 = xArr[i], y0 = parseFloat(yArr[i-1]), y1 = parseFloat(yArr[i]);
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function runSim(mode) {
    const mRPM = parseFloat(document.getElementById('mRPM').value), totalJ = parseFloat(document.getElementById('totalJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText), hStall = parseFloat(document.getElementById('hStall').value);
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    // Initial Parameters
    const ssInit = parseFloat(document.getElementById('ssInitI').value);
    const ssLim = parseFloat(document.getElementById('ssLimitI').value);
    const ssRamp = parseFloat(document.getElementById('ssRamp').value);

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, isStalled = false, stallSpd = null;
    const dt = 0.01, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0;

    // Track state for the Speed-Domain Chart
    let chartData = Array.from({length: 101}, (_, i) => ({ s: i, mt: null, mc: null, lt: null }));

    // --- HEAVY LIFTING: Time-based Simulation to find the mapping ---
    while (time < 60) {
        let rMt = interpolate(speedPerc, S_POINTS, tableMt);
        let rMc = interpolate(speedPerc, S_POINTS, tableMc);
        let rLt = interpolate(speedPerc, S_POINTS, tableLt);
        
        let aMt = rMt, aMc = rMc;

        if (mode === 'SS') {
            let currentLimitAtT = ssInit + (ssLim - ssInit) * Math.min(1, time / ssRamp);
            let vr = Math.min(1, currentLimitAtT / rMc);
            aMt *= (vr * vr);
            aMc *= vr;
        }

        let net = aMt - rLt;
        if (speedPerc < 95 && net < minNet) minNet = net;

        // Capture data for the chart at every speed integer
        let sInt = Math.floor(speedPerc);
        if (sInt <= 100 && chartData[sInt].mt === null) {
            chartData[sInt] = { s: sInt, mt: aMt, mc: aMc, lt: rLt };
        }

        if (speedPerc < 99.5) {
            if (net <= 0.005 && time > 0.2) { isStalled = true; stallSpd = speedPerc; break; }
            speedRadS += ((net / 100) * fltNm / totalJ) * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            thermal += (Math.pow(aMc / 600, 2) / hStall) * 100 * dt;
        } else break;
        time += dt;
    }

    // Fill "Ghost" data and post-stall data for smooth curves
    let labels = [], pMt = [], pMc = [], pLt = [], gMt = [], gMc = [];
    for (let s = 0; s <= 100; s++) {
        labels.push(s);
        let rMt = interpolate(s, S_POINTS, tableMt);
        let rMc = interpolate(s, S_POINTS, tableMc);
        let rLt = interpolate(s, S_POINTS, tableLt);
        gMt.push(rMt); gMc.push(rMc);
        pLt.push(rLt);

        if (chartData[s].mt !== null) {
            pMt.push(chartData[s].mt); pMc.push(chartData[s].mc);
        } else {
            // If we didn't reach this speed in sim, show the current-limited capability
            let vr = (mode === 'SS') ? Math.min(1, ssLim / rMc) : 1;
            pMt.push(rMt * vr * vr); pMc.push(rMc * vr);
        }
    }

    const id = mode.toLowerCase();
    document.getElementById(`${id}Time`).innerText = isStalled ? "STALL" : time.toFixed(2) + "s";
    document.getElementById(`${id}Therm`).innerText = thermal.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = minNet.toFixed(1) + "%";

    renderChart(mode, labels, pMt, pMc, pLt, gMt, gMc, stallSpd);
}

function renderChart(m, labels, mt, mc, lt, gmt, gmc, stallSpd) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    let datasets = [
        { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.1 },
        { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0 },
        { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 }
    ];
    if (m === 'SS') {
        datasets.push({ label: 'DOL Torque', data: gmt, borderColor: 'rgba(34, 211, 238, 0.1)', borderWidth: 1, pointRadius: 0 });
        datasets.push({ label: 'DOL Current', data: gmc, borderColor: 'rgba(251, 191, 36, 0.1)', borderWidth: 1, yAxisID: 'y1', pointRadius: 0 });
    }
    if (stallSpd !== null) {
        datasets.push({ label: 'STALL', data: [{x: Math.round(stallSpd), y: mt[Math.round(stallSpd)]}], pointStyle: 'crossRot', pointRadius: 12, pointBorderColor: '#ff0000', pointBorderWidth: 3, showLine: false });
    }
    charts[m] = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x:{title:{display:true,text:'Speed %'}}, y:{min:0, title:{display:true,text:'Torque %'}}, y1:{position:'right', min:0, grid:{drawOnChartArea:false}, title:{display:true,text:'Current %'}} } } });
}
window.onload = init;