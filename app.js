const S_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
const DEFAULT_GRID = {
    mt: [150, 145, 140, 135, 130, 140, 160, 180, 210, 220, 230, 240, 250, 240, 220, 180, 120, 50, 0],
    mc: [600, 595, 590, 580, 570, 560, 550, 530, 500, 480, 450, 400, 350, 300, 250, 180, 120, 80, 10],
    lt: [15, 16, 17, 18, 20, 22, 25, 28, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]
};

let charts = { DOL: null, SS: null };

function init() {
    const tbody = document.getElementById('tableBody');
    S_POINTS.forEach((s, i) => {
        tbody.innerHTML += `<tr>
            <td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${DEFAULT_GRID.mt[i]}"></td>
            <td><input type="number" class="val-mc" value="${DEFAULT_GRID.mc[i]}"></td>
            <td><input type="number" class="val-lt" value="${DEFAULT_GRID.lt[i]}"></td>
        </tr>`;
    });

    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
    document.getElementById('btnSaveCase').onclick = saveCase;
    document.getElementById('caseDropdown').onchange = loadCase;
    document.getElementById('btnClearCases').onclick = clearStorage;
    document.querySelectorAll('input').forEach(i => i.addEventListener('input', updateHeader));
    
    updateHeader();
    refreshDropdown();
}

// Logic for Save/Load (Serialized as in v2.9)
function saveCase() {
    const name = document.getElementById('caseName').value;
    if (!name) return alert("Enter case name");
    const data = {
        name, mVolts: document.getElementById('mVolts').value, mKW: document.getElementById('mKW').value,
        mFLC: document.getElementById('mFLC').value, mRPM: document.getElementById('mRPM').value,
        mJ: document.getElementById('mJ').value, lJ: document.getElementById('lJ').value,
        motorType: document.getElementById('motorType').value, loadType: document.getElementById('loadType').value,
        mt: [...document.querySelectorAll('.val-mt')].map(e => e.value),
        mc: [...document.querySelectorAll('.val-mc')].map(e => e.value),
        lt: [...document.querySelectorAll('.val-lt')].map(e => e.value)
    };
    let cases = JSON.parse(localStorage.getItem('motorCases') || "[]");
    cases.push(data);
    localStorage.setItem('motorCases', JSON.stringify(cases));
    refreshDropdown();
}

function loadCase() {
    const name = document.getElementById('caseDropdown').value;
    if (!name) return;
    const cases = JSON.parse(localStorage.getItem('motorCases') || "[]");
    const d = cases.find(c => c.name === name);
    if (!d) return;
    document.getElementById('mVolts').value = d.mVolts;
    document.getElementById('mKW').value = d.mKW;
    document.getElementById('mFLC').value = d.mFLC;
    document.getElementById('mRPM').value = d.mRPM;
    document.getElementById('mJ').value = d.mJ;
    document.getElementById('lJ').value = d.lJ;
    document.getElementById('motorType').value = d.motorType;
    document.getElementById('loadType').value = d.loadType;
    const mts = document.querySelectorAll('.val-mt'), mcs = document.querySelectorAll('.val-mc'), lts = document.querySelectorAll('.val-lt');
    S_POINTS.forEach((_, i) => { mts[i].value = d.mt[i]; mcs[i].value = d.mc[i]; lts[i].value = d.lt[i]; });
    updateHeader();
}

function refreshDropdown() {
    const dd = document.getElementById('caseDropdown');
    const cases = JSON.parse(localStorage.getItem('motorCases') || "[]");
    dd.innerHTML = '<option value="">-- Select Saved Case --</option>' + cases.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function clearStorage() { if(confirm("Wipe all data?")) { localStorage.removeItem('motorCases'); refreshDropdown(); } }

function updateHeader() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    document.getElementById('resFLT').innerText = ((kw * 9550) / rpm).toFixed(1);
}

function interpolate(x, xArr, yArr) {
    if (x <= xArr[0]) return yArr[0];
    if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
    let i = xArr.findIndex(val => val >= x);
    let x0 = xArr[i-1], x1 = xArr[i], y0 = yArr[i-1], y1 = yArr[i];
    return parseFloat(y0) + (x - x0) * (parseFloat(y1) - parseFloat(y0)) / (x1 - x0);
}

function runSim(mode) {
    const mFLC = parseFloat(document.getElementById('mFLC').value), mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const mType = document.getElementById('motorType').value, lType = document.getElementById('loadType').value;
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, maxA = 0;
    const dt = 0.005, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0, isStalled = false, finalTime = 0;

    while (time < 40) {
        let rawMt = (mType === 'custom') ? interpolate(speedPerc, S_POINTS, tableMt) : (mType === 'designB' ? ((speedPerc < 80) ? 150 - (speedPerc * 0.25) : 130 + (speedPerc - 80) * 8 - Math.pow(speedPerc-80, 2) * 0.35) : (speedPerc < 70 ? 250 - (speedPerc * 0.8) : 194 + (speedPerc-70)*3 - Math.pow(speedPerc-70, 2)*0.15));
        let rawMc = interpolate(speedPerc, S_POINTS, tableMc);
        let curLt = (lType === 'grid') ? interpolate(speedPerc, S_POINTS, tableLt) : (lType === 'centrifugal' ? parseFloat(tableLt[0]) + (parseFloat(tableLt[18]) - parseFloat(tableLt[0])) * Math.pow(speedPerc/100, 2) : parseFloat(tableLt[18]));

        let activeMt = rawMt, activeMc = rawMc;
        if (mode === 'SS') {
            const lim = parseFloat(document.getElementById('ssLimitI').value);
            let vr = Math.min(1, lim / rawMc);
            activeMt *= (vr * vr); activeMc *= vr;
        }

        let netT = activeMt - curLt;
        if (netT < minNet) minNet = netT;
        if ((activeMc * mFLC / 100) > maxA) maxA = (activeMc * mFLC / 100);

        if (speedPerc < 98.5) {
            if (netT <= 0.01) { isStalled = true; }
            else {
                speedRadS += ((netT / 100) * fltNm / totalJ) * dt;
                speedPerc = (speedRadS / targetRadS) * 100;
                thermal += Math.pow(activeMc / 100, 2) * dt;
                finalTime = time;
            }
        }
        time += dt;
    }
    updateUI(mode, finalTime, thermal, minNet, maxA, isStalled);
    
    let labels = Array.from({length: 101}, (_, i) => i);
    let pMt = [], pMc = [], pLt = [];
    labels.forEach(s => {
        let m = (mType === 'custom') ? interpolate(s, S_POINTS, tableMt) : (mType === 'designB' ? ((s < 80) ? 150 - (s * 0.25) : 130 + (s - 80) * 8 - Math.pow(s-80, 2) * 0.35) : (s < 70 ? 250 - (s * 0.8) : 194 + (s-70)*3 - Math.pow(s-70, 2)*0.15));
        let c = interpolate(s, S_POINTS, tableMc), l = (lType === 'grid') ? interpolate(s, S_POINTS, tableLt) : (lType === 'centrifugal' ? parseFloat(tableLt[0]) + (parseFloat(tableLt[18]) - parseFloat(tableLt[0])) * Math.pow(s/100, 2) : parseFloat(tableLt[18]));
        if (mode === 'SS') { const lim = parseFloat(document.getElementById('ssLimitI').value); let vr = Math.min(1, lim / c); pMt.push(m * vr * vr); pMc.push(c * vr); } else { pMt.push(m); pMc.push(c); }
        pLt.push(l);
    });
    renderChart(mode, labels, pMt, pMc, pLt);
}

function updateUI(mode, t, tcu, net, peak, stalled) {
    const id = mode.toLowerCase();
    const timeEl = document.getElementById(`${id}Time`);
    timeEl.innerText = stalled ? "STALL" : t.toFixed(2) + "s";
    timeEl.style.color = stalled ? "#f43f5e" : "";
    document.getElementById(`${id}Therm`).innerText = tcu.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = (net < 0 ? 0 : net).toFixed(1) + "%";
    document.getElementById(`${id}MaxI`).innerText = Math.round(peak);
}

function renderChart(m, l, mt, mc, lt) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    charts[m] = new Chart(ctx, {
        type: 'line', data: { labels: l, datasets: [
            { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.3 },
            { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 },
            { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0 }, y1: { position: 'right', min: 0, grid: { drawOnChartArea: false } } } }
    });
}
window.onload = init;