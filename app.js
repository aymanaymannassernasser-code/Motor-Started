const S_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];

const PRESETS = {
    motor: {
        oem: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
        designC: [250, 240, 220, 205, 195, 190, 192, 200, 215, 230, 245, 255, 260, 250, 230, 185, 120, 60, 0],
        highSlip: [160, 162, 165, 170, 175, 185, 200, 215, 230, 235, 240, 245, 235, 215, 190, 150, 100, 50, 0]
    },
    current: {
        oem: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
        designC: [550, 545, 538, 530, 520, 510, 500, 485, 465, 455, 435, 405, 370, 320, 270, 210, 140, 75, 10],
        highSlip: [620, 610, 600, 585, 570, 550, 525, 500, 470, 450, 420, 385, 340, 285, 220, 160, 110, 65, 10]
    },
    load: {
        oem: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42],
        centrifugal: [5, 6, 8, 12, 17, 23, 30, 38, 48, 51, 54, 58, 62, 67, 73, 80, 88, 95, 100],
        constant: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40]
    }
};

let charts = { DOL: null, SS: null };

function init() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    S_POINTS.forEach((s, i) => {
        tbody.innerHTML += `<tr><td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${PRESETS.motor.oem[i]}"></td>
            <td><input type="number" class="val-mc" value="${PRESETS.current.oem[i]}"></td>
            <td><input type="number" class="val-lt" value="${PRESETS.load.oem[i]}"></td></tr>`;
    });

    document.getElementById('motorPreset').onchange = (e) => applyPreset('motor', e.target.value);
    document.getElementById('loadPreset').onchange = (e) => applyPreset('load', e.target.value);
    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
    document.getElementById('btnSaveCase').onclick = saveCase;
    document.getElementById('btnClearCases').onclick = clearLibrary;
    document.getElementById('caseDropdown').onchange = loadCase;

    loadCaseList();
    updateHeader();
}

function applyPreset(type, key) {
    if (key === 'current') return;
    const mts = document.querySelectorAll('.val-mt'), mcs = document.querySelectorAll('.val-mc'), lts = document.querySelectorAll('.val-lt');
    if (type === 'motor') {
        PRESETS.motor[key].forEach((v, i) => mts[i].value = v);
        PRESETS.current[key].forEach((v, i) => mcs[i].value = v);
    } else {
        PRESETS.load[key].forEach((v, i) => lts[i].value = v);
    }
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
    updateHeader();
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('totalJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const hStall = parseFloat(document.getElementById('hStall').value);
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    let minStartI = 100;
    for (let i = 100; i < 600; i += 0.5) {
        let stall = false;
        for (let s = 0; s <= 92; s++) {
            let vr = Math.min(1, i / interpolate(s, S_POINTS, tableMc));
            if (interpolate(s, S_POINTS, tableMt) * vr * vr <= interpolate(s, S_POINTS, tableLt)) { stall = true; break; }
        }
        if (!stall) { minStartI = i; break; }
    }

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, isStalled = false, stallSpd = null;
    const dt = 0.01, targetRadS = (mRPM * 2 * Math.PI) / 60, ssLim = parseFloat(document.getElementById('ssLimitI').value);
    let speedRadS = 0;

    while (time < 60) {
        let rMt = interpolate(speedPerc, S_POINTS, tableMt), rMc = interpolate(speedPerc, S_POINTS, tableMc), cLt = interpolate(speedPerc, S_POINTS, tableLt);
        let aMt = rMt, aMc = rMc;
        if (mode === 'SS') { let vr = Math.min(1, ssLim / rMc); aMt *= (vr * vr); aMc *= vr; }
        let net = aMt - cLt;
        if (speedPerc < 95 && net < minNet) minNet = net;
        if (speedPerc < 98.5) {
            if (net <= 0.005 && time > 0.2) { isStalled = true; stallSpd = speedPerc; break; }
            speedRadS += ((net / 100) * fltNm / totalJ) * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            thermal += (Math.pow(aMc / 600, 2) / hStall) * 100 * dt;
        }
        time += dt; if (speedPerc >= 99) break;
    }

    const id = mode.toLowerCase();
    document.getElementById(`${id}Time`).innerText = isStalled ? "STALL" : time.toFixed(2) + "s";
    document.getElementById(`${id}Therm`).innerText = thermal.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = minNet.toFixed(1) + "%";
    if(mode === 'SS') document.getElementById('ssMinI').innerText = minStartI.toFixed(1) + "%";

    let lbls = Array.from({length: 101}, (_, i) => i), pMt = [], pMc = [], pLt = [], gMt = [], gMc = [];
    lbls.forEach(s => {
        let rm = interpolate(s, S_POINTS, tableMt), rc = interpolate(s, S_POINTS, tableMc), rl = interpolate(s, S_POINTS, tableLt);
        pLt.push(rl); gMt.push(rm); gMc.push(rc);
        if (mode === 'SS') { let vr = Math.min(1, ssLim / rc); pMt.push(rm * vr * vr); pMc.push(rc * vr); }
        else { pMt.push(rm); pMc.push(rc); }
    });
    renderChart(mode, lbls, pMt, pMc, pLt, gMt, gMc, stallSpd);
}

function renderChart(m, labels, mt, mc, lt, gmt, gmc, stallSpd) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    let datasets = [
        { label: 'Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.2 },
        { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 },
        { label: 'Current %', data: mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0 }
    ];
    if (m === 'SS') {
        datasets.push({ label: 'DOL Torque', data: gmt, borderColor: 'rgba(34, 211, 238, 0.15)', borderWidth: 1, pointRadius: 0 });
        datasets.push({ label: 'DOL Current', data: gmc, borderColor: 'rgba(251, 191, 36, 0.15)', borderWidth: 1, yAxisID: 'y1', pointRadius: 0 });
    }
    if (stallSpd !== null) {
        datasets.push({ label: 'STALL', data: [{x: Math.round(stallSpd), y: mt[Math.round(stallSpd)]}], pointStyle: 'crossRot', pointRadius: 12, pointBorderColor: '#ff0000', pointBorderWidth: 3, showLine: false });
    }
    charts[m] = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x:{title:{display:true,text:'Speed %'}}, y:{min:0, title:{display:true,text:'Torque %'}}, y1:{position:'right', min:0, grid:{drawOnChartArea:false}, title:{display:true,text:'Current %'}} } } });
}

function saveCase() {
    const name = document.getElementById('caseName').value;
    if(!name) return;
    const data = {
        config: { kw: document.getElementById('mKW').value, flc: document.getElementById('mFLC').value, rpm: document.getElementById('mRPM').value, j: document.getElementById('totalJ').value, stall: document.getElementById('hStall').value },
        table: { mt: [...document.querySelectorAll('.val-mt')].map(e => e.value), mc: [...document.querySelectorAll('.val-mc')].map(e => e.value), lt: [...document.querySelectorAll('.val-lt')].map(e => e.value) }
    };
    localStorage.setItem('case_' + name, JSON.stringify(data));
    loadCaseList();
}

function loadCaseList() {
    const dropdown = document.getElementById('caseDropdown');
    dropdown.innerHTML = '<option value="">-- Select Saved Case --</option>';
    Object.keys(localStorage).forEach(key => {
        if(key.startsWith('case_')) dropdown.innerHTML += `<option value="${key}">${key.replace('case_', '')}</option>`;
    });
}

function loadCase(e) {
    const data = JSON.parse(localStorage.getItem(e.target.value));
    if(!data) return;
    document.getElementById('mKW').value = data.config.kw;
    document.getElementById('mFLC').value = data.config.flc;
    document.getElementById('mRPM').value = data.config.rpm;
    document.getElementById('totalJ').value = data.config.j;
    document.getElementById('hStall').value = data.config.stall;
    const mts = document.querySelectorAll('.val-mt'), mcs = document.querySelectorAll('.val-mc'), lts = document.querySelectorAll('.val-lt');
    data.table.mt.forEach((v, i) => mts[i].value = v);
    data.table.mc.forEach((v, i) => mcs[i].value = v);
    data.table.lt.forEach((v, i) => lts[i].value = v);
    updateHeader();
}

function clearLibrary() {
    if(confirm("Wipe cases?")) {
        Object.keys(localStorage).forEach(key => { if(key.startsWith('case_')) localStorage.removeItem(key); });
        loadCaseList();
    }
}

window.onload = init;