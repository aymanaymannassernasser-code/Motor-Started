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
    const mFLC = parseFloat(document.getElementById('mFLC').value), mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('totalJ').value), hStall = parseFloat(document.getElementById('hStall').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, isStalled = false, peakI = 0;
    const dt = 0.01, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0;

    const ssInit = parseFloat(document.getElementById('ssInitI').value);
    const ssLim = parseFloat(document.getElementById('ssLimitI').value);
    const ssRamp = parseFloat(document.getElementById('ssRamp').value);

    let speedMap = Array.from({length: 101}, (_, i) => ({ mt: null, mc: null, lt: null }));

    while (time < 60) {
        let rMt = interpolate(speedPerc, S_POINTS, tableMt), rMc = interpolate(speedPerc, S_POINTS, tableMc), rLt = interpolate(speedPerc, S_POINTS, tableLt);
        let aMt = rMt, aMc = rMc;

        if (mode === 'SS') {
            let limitT = ssInit + (ssLim - ssInit) * Math.min(1, time / ssRamp);
            let vr = Math.min(1, limitT / rMc);
            aMt *= (vr * vr); aMc *= vr;
        }

        let net = aMt - rLt;
        if (speedPerc < 95 && net < minNet) minNet = net;
        if (aMc > peakI) peakI = aMc;

        let sIdx = Math.floor(speedPerc);
        if (sIdx <= 100 && speedMap[sIdx].mt === null) speedMap[sIdx] = { mt: aMt, mc: aMc, lt: rLt };

        if (speedPerc < 99.5) {
            if (net <= 0.005 && time > 0.2) { isStalled = true; break; }
            speedRadS += ((net / 100) * fltNm / totalJ) * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            thermal += (Math.pow(aMc / 600, 2) / hStall) * 100 * dt;
        } else break;
        time += dt;
    }

    // Chart Data Preparation
    let labels = [], pMt = [], pMc = [], pLt = [], gMt = [], gMc = [];
    for(let s=0; s<=100; s++) {
        labels.push(s);
        let dm = interpolate(s, S_POINTS, tableMt), dc = interpolate(s, S_POINTS, tableMc), dl = interpolate(s, S_POINTS, tableLt);
        gMt.push(dm); gMc.push(dc); pLt.push(dl);
        if (speedMap[s].mt !== null) { pMt.push(speedMap[s].mt); pMc.push(speedMap[s].mc); }
        else { // Pre-fill or Post-stall calculation
            let vr = (mode==='SS') ? Math.min(1, ssLim/dc) : 1;
            pMt.push(dm*vr*vr); pMc.push(dc*vr);
        }
    }

    const id = mode.toLowerCase();
    document.getElementById(`${id}Time`).innerText = isStalled ? "STALL" : time.toFixed(2) + "s";
    document.getElementById(`${id}Therm`).innerText = thermal.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = minNet.toFixed(1) + "%";
    if (mode === 'DOL') document.getElementById('dolMaxI').innerText = (peakI * mFLC / 100).toFixed(0);

    renderChart(mode, labels, pMt, pMc, pLt, gMt, gMc);
}

function renderChart(m, labels, mt, mc, lt, gmt, gmc) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    let datasets = [
        { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.1 },
        { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0, tension: 0.1 },
        { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 }
    ];
    if (m === 'SS') {
        datasets.push({ label: 'DOL Torque', data: gmt, borderColor: 'rgba(34, 211, 238, 0.1)', borderWidth: 1, pointRadius: 0 });
        datasets.push({ label: 'DOL Current', data: gmc, borderColor: 'rgba(251, 191, 36, 0.1)', borderWidth: 1, yAxisID: 'y1', pointRadius: 0 });
    }
    charts[m] = new Chart(ctx, { 
        type: 'line', 
        data: { labels, datasets }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { 
                x:{ title:{display:true, text:'Speed %'}}, 
                y:{ min:0, title:{display:true, text:'Torque %'}}, 
                y1:{ position:'right', min:0, grid:{drawOnChartArea:false}, title:{display:true, text:'Current %'}} 
            } 
        } 
    });
}
window.onload = init;