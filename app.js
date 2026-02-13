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
    updateHeader();
    document.getElementById('btnDOL').onclick = () => runSim('DOL');
    document.getElementById('btnSS').onclick = () => runSim('SS');
}

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
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function getMotorTorque(speed, type, tableMt) {
    if (type === 'custom') return interpolate(speed, S_POINTS, tableMt);
    if (type === 'designB') return (speed < 80) ? 150 - (speed * 0.25) : 130 + (speed - 80) * 8 - Math.pow(speed-80, 2) * 0.35;
    if (type === 'designC') return (speed < 70) ? 250 - (speed * 0.8) : 194 + (speed-70)*3 - Math.pow(speed-70, 2)*0.15;
    return interpolate(speed, S_POINTS, tableMt);
}

function getLoadTorque(speed, type, tableLt) {
    let breakaway = tableLt[0], rated = tableLt[tableLt.length-1];
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

    const tableMt = Array.from(document.querySelectorAll('.val-mt')).map(el => parseFloat(el.value));
    const tableMc = Array.from(document.querySelectorAll('.val-mc')).map(el => parseFloat(el.value));
    const tableLt = Array.from(document.querySelectorAll('.val-lt')).map(el => parseFloat(el.value));

    let time = 0, speed = 0, thermal = 0, minNet = 999, maxA = 0;
    const dt = 0.01; // Optimized step for balance
    let isStalled = false;
    let finalTime = 0;

    const initI = parseFloat(document.getElementById('ssInitI').value);
    const limI = parseFloat(document.getElementById('ssLimitI').value);
    const ramp = parseFloat(document.getElementById('ssRamp').value);

    while (time < 60) {
        let rawMt = getMotorTorque(speed, mType, tableMt);
        let rawMc = interpolate(speed, S_POINTS, tableMc);
        let curLt = getLoadTorque(speed, lType, tableLt);

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

        let netT = activeMt - curLt;
        if (netT < minNet) minNet = netT;
        if ((activeMc * mFLC / 100) > maxA) maxA = (activeMc * mFLC / 100);

        if (speed < 98.0) { // Standard engineering cutoff for "Started"
            thermal += Math.pow(activeMc / 100, 2) * dt;
            if (netT <= 0.5) { // Threshold for stall
                isStalled = true;
            } else {
                // Acceleration = Torque / Inertia
                let accelRadS = (netT * fltNm / 100) / totalJ;
                let deltaRPM = (accelRadS * 9.549) * dt;
                speed += (deltaRPM / mRPM) * 100;
            }
            finalTime = time;
        }
        time += dt;
    }

    updateUI(mode, finalTime, thermal, minNet, maxA, isStalled);
    
    let labels = Array.from({length: 101}, (_, i) => i);
    let pMt = [], pMc = [], pLt = [];
    labels.forEach(s => {
        let m = getMotorTorque(s, mType, tableMt);
        let c = interpolate(s, S_POINTS, tableMc);
        let l = getLoadTorque(s, lType, tableLt);
        if (mode === 'SS') {
            let vr = Math.min(1, limI / c);
            pMt.push(m * vr * vr);
            pMc.push(c * vr);
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
    if (stalled || t >= 59) {
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