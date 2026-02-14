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
    
    // Local Storage Logic from v3.6
    document.getElementById('btnSaveCase').onclick = saveCase;
    document.getElementById('btnClearCases').onclick = () => { localStorage.removeItem('motorCases'); loadCases(); };
    loadCases();
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
    const mFLC = parseFloat(document.getElementById('mFLC').value), mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('totalJ').value), fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const hStall = parseFloat(document.getElementById('hStall').value);
    
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    // Precise Min Start I Search (0.5% resolution)
    let minStartI = 100;
    for (let testI = 100; testI < 600; testI += 0.5) {
        let ok = true;
        for (let s = 0; s <= 92; s++) {
            let vr = Math.min(1, testI / interpolate(s, S_POINTS, tableMc));
            if (interpolate(s, S_POINTS, tableMt) * vr * vr <= interpolate(s, S_POINTS, tableLt)) { ok = false; break; }
        }
        if (ok) { minStartI = testI; break; }
    }

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, isStalled = false, isTripped = false;
    const dt = 0.02, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0, peakI = 0, plot = { t: [], s: [], m: [], l: [], c: [] };

    const ssInit = parseFloat(document.getElementById('ssInitI').value);
    const ssLim = parseFloat(document.getElementById('ssLimitI').value);
    const ssRamp = parseFloat(document.getElementById('ssRamp').value);

    while (time < 60) {
        let rMt = interpolate(speedPerc, S_POINTS, tableMt), rMc = interpolate(speedPerc, S_POINTS, tableMc), rLt = interpolate(speedPerc, S_POINTS, tableLt);
        let aMt = rMt, aMc = rMc;

        if (mode === 'SS') {
            let rampI = ssInit + (ssLim - ssInit) * (time / ssRamp);
            let activeLim = Math.min(rampI, ssLim);
            let vr = Math.min(1, activeLim / rMc);
            aMt *= (vr * vr); aMc *= vr;
        }

        let net = aMt - rLt;
        if (speedPerc < 95 && net < minNet) minNet = net;
        if (aMc > peakI) peakI = aMc;

        plot.t.push(time.toFixed(2)); plot.s.push(speedPerc.toFixed(1)); 
        plot.m.push(aMt.toFixed(1)); plot.l.push(rLt.toFixed(1)); plot.c.push(aMc.toFixed(1));

        if (speedPerc < 99.5) {
            if (net <= 0.005 && time > 0.2) { isStalled = true; } 
            else { speedRadS += ((net / 100) * fltNm / totalJ) * dt; }
            speedPerc = Math.max(0, (speedRadS / targetRadS) * 100);
            
            // Thermal Capacity Used calculation (Cold Curve assumption)
            thermal += (Math.pow(aMc / 600, 2) / hStall) * 100 * dt;
            if (thermal >= 100) { isTripped = true; break; }
        } else { break; }
        time += dt;
    }

    const id = mode.toLowerCase();
    let resTime = isTripped ? "TRIP" : (isStalled ? "STALL" : time.toFixed(2) + "s");
    document.getElementById(`${id}Time`).innerText = resTime;
    document.getElementById(`${id}Therm`).innerText = thermal.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = minNet.toFixed(1) + "%";
    if (mode === 'DOL') document.getElementById('dolMaxI').innerText = (peakI * mFLC / 100).toFixed(0);
    if (mode === 'SS') document.getElementById('ssMinI').innerText = minStartI.toFixed(1) + "%";

    renderChart(mode, plot);
}

function renderChart(m, d) {
    const ctx = document.getElementById(m === 'DOL' ? 'chartDOL' : 'chartSS');
    if (charts[m]) charts[m].destroy();
    charts[m] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: d.t,
            datasets: [
                { label: 'Speed %', data: d.s, borderColor: '#10b981', borderWidth: 3, pointRadius: 0 },
                { label: 'Current %', data: d.c, borderColor: '#fbbf24', yAxisID: 'y1', pointRadius: 0 },
                { label: 'Motor Torque %', data: d.m, borderColor: '#22d3ee', pointRadius: 0 },
                { label: 'Load Torque %', data: d.l, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Time (s)' } },
                y: { min: 0, title: { display: true, text: 'Torque/Speed %' } },
                y1: { position: 'right', min: 0, title: { display: true, text: 'Current %' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// Case Study Persistence from v3.6
function saveCase() {
    const name = document.getElementById('caseName').value || "Unnamed Case";
    const data = {
        config: { kw: document.getElementById('mKW').value, flc: document.getElementById('mFLC').value, rpm: document.getElementById('mRPM').value, j: document.getElementById('totalJ').value, stall: document.getElementById('hStall').value },
        grid: [...document.querySelectorAll('tbody tr')].map(tr => ({
            mt: tr.querySelector('.val-mt').value, mc: tr.querySelector('.val-mc').value, lt: tr.querySelector('.val-lt').value
        }))
    };
    let cases = JSON.parse(localStorage.getItem('motorCases') || "{}");
    cases[name] = data;
    localStorage.setItem('motorCases', JSON.stringify(cases));
    loadCases();
}

function loadCases() {
    const dropdown = document.getElementById('caseDropdown');
    const cases = JSON.parse(localStorage.getItem('motorCases') || "{}");
    dropdown.innerHTML = '<option value="">-- Select Saved Case --</option>';
    Object.keys(cases).forEach(c => { dropdown.innerHTML += `<option value="${c}">${c}</option>`; });
    dropdown.onchange = (e) => {
        const c = cases[e.target.value];
        if (!c) return;
        document.getElementById('mKW').value = c.config.kw;
        document.getElementById('mFLC').value = c.config.flc;
        document.getElementById('mRPM').value = c.config.rpm;
        document.getElementById('totalJ').value = c.config.j;
        document.getElementById('hStall').value = c.config.stall;
        const rows = document.querySelectorAll('tbody tr');
        c.grid.forEach((g, i) => {
            rows[i].querySelector('.val-mt').value = g.mt;
            rows[i].querySelector('.val-mc').value = g.mc;
            rows[i].querySelector('.val-lt').value = g.lt;
        });
        updateHeader();
    };
}
window.onload = init;