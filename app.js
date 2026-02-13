const S_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];

// OEM Data Default
const DEFAULT_GRID = {
    mt: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
    mc: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
    lt: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42]
};

let charts = { DOL: null, SS: null };

function init() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
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

function saveCase() {
    const name = document.getElementById('caseName').value;
    if (!name) return alert("Enter case name");
    const data = {
        name, mVolts: document.getElementById('mVolts').value, mKW: document.getElementById('mKW').value,
        mFLC: document.getElementById('mFLC').value, mRPM: document.getElementById('mRPM').value,
        mJ: document.getElementById('mJ').value, lJ: document.getElementById('lJ').value,
        hStall: document.getElementById('hStall').value,
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
    document.getElementById('hStall').value = d.hStall;
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
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const hStall = parseFloat(document.getElementById('hStall').value);
    
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    // 1. Minimum Starting Current Calculation
    let minPossibleI = 100;
    for (let testI = 100; testI < 600; testI += 5) {
        let isStallAtThisI = false;
        for (let s = 0; s <= 100; s++) {
            let rm = interpolate(s, S_POINTS, tableMt);
            let rc = interpolate(s, S_POINTS, tableMc);
            let rl = interpolate(s, S_POINTS, tableLt);
            let vr = Math.min(1, testI / rc);
            if ((rm * vr * vr) - rl <= 0.5) { isStallAtThisI = true; break; }
        }
        if (!isStallAtThisI) { minPossibleI = testI; break; }
    }

    // 2. Main Simulation Loop
    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, maxA = 0;
    const dt = 0.01, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0, isStalled = false, finalTime = 0;

    const ssLimitI = parseFloat(document.getElementById('ssLimitI').value);

    while (time < 60) {
        let rawMt = interpolate(speedPerc, S_POINTS, tableMt);
        let rawMc = interpolate(speedPerc, S_POINTS, tableMc);
        let curLt = interpolate(speedPerc, S_POINTS, tableLt);

        let activeMt = rawMt, activeMc = rawMc;
        if (mode === 'SS') {
            let vr = Math.min(1, ssLimitI / rawMc);
            activeMt *= (vr * vr); activeMc *= vr;
        }

        let netT = activeMt - curLt;
        if (netT < minNet) minNet = netT;
        if ((activeMc * mFLC / 100) > maxA) maxA = (activeMc * mFLC / 100);

        if (speedPerc < 98.5) {
            if (netT <= 0.01 && time > 0.5) { isStalled = true; break; }
            speedRadS += ((netT / 100) * fltNm / totalJ) * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            
            // Standard Thermal Model: TCU increase relative to I^2 / Stall_Time
            // Reference current for stall time is usually 600% FLC
            let iRatio = (activeMc / 600);
            thermal += (Math.pow(iRatio, 2) / hStall) * 100 * dt;
            finalTime = time;
        }
        time += dt;
        if (speedPerc >= 99) break;
    }

    // 3. UI Update
    const id = mode.toLowerCase();
    document.getElementById(`${id}Time`).innerText = isStalled ? "STALL" : finalTime.toFixed(2) + "s";
    const thermEl = document.getElementById(`${id}Therm`);
    thermEl.innerText = thermal.toFixed(1) + "%";
    thermEl.style.color = thermal > 100 ? "#f43f5e" : "";
    document.getElementById(`${id}Net`).innerText = (minNet < 0 ? 0 : minNet).toFixed(1) + "%";
    if (mode === 'SS') document.getElementById('ssMinI').innerText = minPossibleI + "%";

    // 4. Chart Render
    let lbls = Array.from({length: 101}, (_, i) => i);
    let pMt = [], pMc = [], pLt = [];
    lbls.forEach(s => {
        let rm = interpolate(s, S_POINTS, tableMt);
        let rc = interpolate(s, S_POINTS, tableMc);
        let rl = interpolate(s, S_POINTS, tableLt);
        if (mode === 'SS') {
            let vr = Math.min(1, ssLimitI / rc);
            pMt.push(rm * vr * vr); pMc.push(rc * vr);
        } else {
            pMt.push(rm); pMc.push(rc);
        }
        pLt.push(rl);
    });
    renderChart(mode, lbls, pMt, pMc, pLt);
}

function renderChart(m, labels, mt, mc, lt) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    charts[m] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 2, pointRadius: 0, tension: 0.3 },
                { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, tension: 0.3 },
                { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0, tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %', color: '#94a3b8' } },
                y: { min: 0, title: { display: true, text: 'Torque %', color: '#94a3b8' } },
                y1: { position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: 'Current %', color: '#fbbf24' } }
            }
        }
    });
}
window.onload = init;