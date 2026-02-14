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

    // Precise Min Start I Search
    let minStartI = 100;
    for (let i = 100; i < 600; i += 0.5) {
        let stall = false;
        for (let s = 0; s <= 92; s++) {
            let vr = Math.min(1, i / interpolate(s, S_POINTS, tableMc));
            if (interpolate(s, S_POINTS, tableMt) * vr * vr <= interpolate(s, S_POINTS, tableLt)) { stall = true; break; }
        }
        if (!stall) { minStartI = i; break; }
    }

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, isStalled = false;
    const dt = 0.01, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0;

    const ssInit = parseFloat(document.getElementById('ssInitI').value);
    const ssLim = parseFloat(document.getElementById('ssLimitI').value);
    const ssRamp = parseFloat(document.getElementById('ssRamp').value);

    // Physics Results Array for the Speed-Domain Chart
    let speedResults = Array.from({length: 101}, (_, i) => ({ s: i, mt: 0, mc: 0, lt: 0 }));

    // Simulation Loop
    while (time < 60) {
        let rMt = interpolate(speedPerc, S_POINTS, tableMt), rMc = interpolate(speedPerc, S_POINTS, tableMc), rLt = interpolate(speedPerc, S_POINTS, tableLt);
        let aMt = rMt, aMc = rMc;

        if (mode === 'SS') {
            let rampI = ssInit + (ssLim - ssInit) * (time / ssRamp);
            let activeLimit = Math.min(rampI, ssLim);
            let vr = Math.min(1, activeLimit / rMc);
            aMt *= (vr * vr); aMc *= vr;
        }

        let net = aMt - rLt;
        if (speedPerc < 95 && net < minNet) minNet = net;

        // Capture data point for the specific speed integer
        let sIdx = Math.round(speedPerc);
        if (sIdx <= 100 && speedResults[sIdx].mt === 0) {
            speedResults[sIdx] = { s: sIdx, mt: aMt, mc: aMc, lt: rLt };
        }

        if (speedPerc < 99.5) {
            if (net <= 0.005 && time > 0.2) { isStalled = true; break; }
            speedRadS += ((net / 100) * fltNm / totalJ) * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            thermal += (Math.pow(aMc / 600, 2) / hStall) * 100 * dt;
            if (thermal >= 100) break;
        } else { break; }
        time += dt;
    }

    // Fill in gaps for the chart if simulation stalled
    speedResults.forEach((res, i) => {
        if (res.mt === 0 && i > 0) {
            let rMt = interpolate(i, S_POINTS, tableMt), rMc = interpolate(i, S_POINTS, tableMc), rLt = interpolate(i, S_POINTS, tableLt);
            if (mode === 'SS') { 
                let vr = Math.min(1, ssLim / rMc);
                res.mt = rMt * vr * vr; res.mc = rMc * vr; 
            } else { res.mt = rMt; res.mc = rMc; }
            res.lt = rLt;
        }
    });

    const id = mode.toLowerCase();
    document.getElementById(`${id}Time`).innerText = isStalled ? "STALL" : time.toFixed(2) + "s";
    document.getElementById(`${id}Therm`).innerText = thermal.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = minNet.toFixed(1) + "%";
    if(mode === 'SS') document.getElementById('ssMinI').innerText = minStartI.toFixed(1) + "%";

    renderSpeedChart(mode, speedResults);
}

function renderSpeedChart(m, data) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    charts[m] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.s),
            datasets: [
                { label: 'Torque %', data: data.map(d => d.mt), borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.1 },
                { label: 'Current %', data: data.map(d => d.mc), borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0 },
                { label: 'Load %', data: data.map(d => d.lt), borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %' } },
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { position: 'right', min: 0, title: { display: true, text: 'Current %' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}
window.onload = init;