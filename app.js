/**
 * Motor Started v2.9
 * Includes LocalStorage Persistence & Validation Physics
 */

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

    // Event Listeners
    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
    document.getElementById('btnSaveCase').onclick = saveCase;
    document.getElementById('caseDropdown').onchange = loadCase;
    document.getElementById('btnClearCases').onclick = clearStorage;
    
    document.querySelectorAll('input').forEach(i => i.addEventListener('input', updateHeader));
    
    updateHeader();
    refreshDropdown();
}

// --- CASE STORAGE LOGIC ---

function saveCase() {
    const name = document.getElementById('caseName').value;
    if (!name) return alert("Enter a name for the case study");

    const caseData = {
        name: name,
        mVolts: document.getElementById('mVolts').value,
        mKW: document.getElementById('mKW').value,
        mFLC: document.getElementById('mFLC').value,
        mRPM: document.getElementById('mRPM').value,
        mJ: document.getElementById('mJ').value,
        lJ: document.getElementById('lJ').value,
        motorType: document.getElementById('motorType').value,
        loadType: document.getElementById('loadType').value,
        mt: Array.from(document.querySelectorAll('.val-mt')).map(el => el.value),
        mc: Array.from(document.querySelectorAll('.val-mc')).map(el => el.value),
        lt: Array.from(document.querySelectorAll('.val-lt')).map(el => el.value)
    };

    let cases = JSON.parse(localStorage.getItem('motorCases') || "[]");
    cases.push(caseData);
    localStorage.setItem('motorCases', JSON.stringify(cases));
    
    document.getElementById('caseName').value = "";
    refreshDropdown();
}

function loadCase() {
    const name = document.getElementById('caseDropdown').value;
    if (!name) return;

    let cases = JSON.parse(localStorage.getItem('motorCases') || "[]");
    const data = cases.find(c => c.name === name);
    if (!data) return;

    // Load inputs
    document.getElementById('mVolts').value = data.mVolts;
    document.getElementById('mKW').value = data.mKW;
    document.getElementById('mFLC').value = data.mFLC;
    document.getElementById('mRPM').value = data.mRPM;
    document.getElementById('mJ').value = data.mJ;
    document.getElementById('lJ').value = data.lJ;
    document.getElementById('motorType').value = data.motorType;
    document.getElementById('loadType').value = data.loadType;

    // Load Grid
    const mts = document.querySelectorAll('.val-mt');
    const mcs = document.querySelectorAll('.val-mc');
    const lts = document.querySelectorAll('.val-lt');
    
    S_POINTS.forEach((_, i) => {
        mts[i].value = data.mt[i];
        mcs[i].value = data.mc[i];
        lts[i].value = data.lt[i];
    });

    updateHeader();
    runSim('DOL');
}

function refreshDropdown() {
    const dropdown = document.getElementById('caseDropdown');
    const cases = JSON.parse(localStorage.getItem('motorCases') || "[]");
    dropdown.innerHTML = '<option value="">-- Select Saved Case --</option>';
    cases.forEach(c => {
        dropdown.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
}

function clearStorage() {
    if(confirm("Wipe all saved case studies?")) {
        localStorage.removeItem('motorCases');
        refreshDropdown();
    }
}

// --- PHYSICS ENGINE ---

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

function getMotorTorque(speed, type, tableMt) {
    if (type === 'custom') return interpolate(speed, S_POINTS, tableMt);
    if (type === 'designB') return (speed < 80) ? 150 - (speed * 0.25) : 130 + (speed - 80) * 8 - Math.pow(speed-80, 2) * 0.35;
    if (type === 'designC') return (speed < 70) ? 250 - (speed * 0.8) : 194 + (speed-70)*3 - Math.pow(speed-70, 2)*0.15;
    return interpolate(speed, S_POINTS, tableMt);
}

function getLoadTorque(speed, type, tableLt) {
    let breakaway = parseFloat(tableLt[0]), rated = parseFloat(tableLt[tableLt.length-1]);
    if (type === 'centrifugal') return breakaway + (rated - breakaway) * Math.pow(speed/100, 2);
    if (type === 'constant') return rated;
    return interpolate(speed, S_POINTS, tableLt);
}

function runSim(mode) {
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const mType = document.getElementById('motorType').value;
    const lType = document.getElementById('loadType').value;

    const tableMt = Array.from(document.querySelectorAll('.val-mt')).map(el => el.value);
    const tableMc = Array.from(document.querySelectorAll('.val-mc')).map(el => el.value);
    const tableLt = Array.from(document.querySelectorAll('.val-lt')).map(el => el.value);

    let time = 0, speedPerc = 0, thermal = 0, minNet = 999, maxA = 0;
    const dt = 0.005;
    let isStalled = false, finalTime = 0;

    const targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0;

    while (time < 60) {
        let rawMt = getMotorTorque(speedPerc, mType, tableMt);
        let rawMc = interpolate(speedPerc, S_POINTS, tableMc);
        let curLt = getLoadTorque(speedPerc, lType, tableLt);

        let activeMt, activeMc;
        if (mode === 'SS') {
            const limI = parseFloat(document.getElementById('ssLimitI').value);
            let vRatio = Math.min(1, limI / rawMc);
            activeMt = rawMt * (vRatio * vRatio);
            activeMc = rawMc * vRatio;
        } else {
            activeMt = rawMt;
            activeMc = rawMc;
        }

        let netT = activeMt - curLt;
        if (netT < minNet) minNet = netT;
        if ((activeMc * mFLC / 100) > maxA) maxA = (activeMc * mFLC / 100);

        if (speedPerc < 98.5) {
            if (netT <= 0.1) { isStalled = true; break; }
            let netT_Nm = (netT / 100) * fltNm;
            let acceleration = netT_Nm / totalJ;
            speedRadS += acceleration * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            finalTime = time;
            thermal += Math.pow(activeMc / 100, 2) * dt;
        }
        time += dt;
    }

    updateUI(mode, finalTime, thermal, minNet, maxA, isStalled);
    
    // Chart Plotting
    let labels = Array.from({length: 101}, (_, i) => i);
    let pMt = [], pMc = [], pLt = [];
    labels.forEach(s => {
        let m = getMotorTorque(s, mType, tableMt);
        let c = interpolate(s, S_POINTS, tableMc);
        let l = getLoadTorque(s, lType, tableLt);
        if (mode === 'SS') {
            const limI = parseFloat(document.getElementById('ssLimitI').value);
            let vr = Math.min(1, limI / c);
            pMt.push(m * vr * vr); pMc.push(c * vr);
        } else {
            pMt.push(m); pMc.push(c);
        }
        pLt.push(l);
    });
    renderChart(mode, labels, pMt, pMc, pLt);
}

function updateUI(mode, t, tcu, net, peak, stalled) {
    const id = mode.toLowerCase();
    const timeEl = document.getElementById(`${id}Time`);
    if (stalled) {
        timeEl.innerText = "STALL";
        timeEl.style.color = "#f43f5e";
    } else {
        timeEl.innerText = t.toFixed(2) + "s";
        timeEl.style.color = "";
    }
    document.getElementById(`${id}Therm`).innerText = tcu.toFixed(1) + "%";
    document.getElementById(`${id}Net`).innerText = (net < 0 ? 0 : net).toFixed(1) + "%";
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
                { label: 'Motor Torque %', data: mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.3 },
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