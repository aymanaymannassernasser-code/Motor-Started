/**
 * Motor Started v1.8
 * Logic: Cubic Spline Interpolation for realistic motor curves.
 */

const speedPoints = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
const defaultData = {
    mt: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
    mc: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
    lt: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42]
};

let mainChart = null;

function init() {
    const tbody = document.getElementById('tableBody');
    speedPoints.forEach((s, i) => {
        tbody.innerHTML += `<tr>
            <td>${s}%</td>
            <td><input type="number" class="val-mt" value="${defaultData.mt[i]}"></td>
            <td><input type="number" class="val-mc" value="${defaultData.mc[i]}"></td>
            <td><input type="number" class="val-lt" value="${defaultData.lt[i]}"></td>
        </tr>`;
    });
    document.querySelectorAll('input').forEach(el => el.addEventListener('input', () => {
        document.getElementById('loadValDisplay').innerText = document.getElementById('loadScale').value + "%";
    }));
    document.getElementById('btnDOL').onclick = () => runSimulation('DOL');
    document.getElementById('btnSS').onclick = () => runSimulation('SS');
}

// Simple linear interpolation to get smooth values between points
function getVal(s, targetArr) {
    if (s <= 0) return targetArr[0];
    if (s >= 100) return targetArr[targetArr.length - 1];
    let i = speedPoints.findIndex(v => v >= s);
    let x0 = speedPoints[i - 1], x1 = speedPoints[i];
    let y0 = targetArr[i - 1], y1 = targetArr[i];
    return y0 + (s - x0) * (y1 - y0) / (x1 - x0);
}

function runSimulation(mode) {
    const lScale = parseFloat(document.getElementById('loadScale').value) / 100;
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const fltNm = (parseFloat(document.getElementById('mKW').value) * 9550) / mRPM;

    const tableMt = Array.from(document.querySelectorAll('.val-mt')).map(i => parseFloat(i.value));
    const tableMc = Array.from(document.querySelectorAll('.val-mc')).map(i => parseFloat(i.value));
    const tableLt = Array.from(document.querySelectorAll('.val-lt')).map(i => parseFloat(i.value) * lScale);

    let time = 0, speed = 0, minNet = 999, peakA = 0, status = "SUCCESS";
    const dt = 0.01; // Finer resolution for smoothness
    const plotData = { s: [], mt: [], mc: [], lt: [] };

    while (speed < 99 && time < 45) {
        let rawMt = getVal(speed, tableMt);
        let rawMc = getVal(speed, tableMc);
        let curLt = getVal(speed, tableLt);

        let activeMt, activeMc;
        if (mode === 'SS') {
            let iInit = parseFloat(document.getElementById('ssInitI').value);
            let iLimit = parseFloat(document.getElementById('ssLimitI').value);
            let rTime = parseFloat(document.getElementById('ssRamp').value);
            let curLimit = (time < rTime) ? iInit + (iLimit - iInit) * (time / rTime) : iLimit;
            
            let vRatio = Math.min(1, curLimit / rawMc);
            activeMt = rawMt * vRatio * vRatio;
            activeMc = rawMc * vRatio;
        } else {
            activeMt = rawMt;
            activeMc = rawMc;
        }

        let net = activeMt - curLt;
        if (net < minNet) minNet = net;
        if ((activeMc * mFLC / 100) > peakA) peakA = (activeMc * mFLC / 100);
        if (net <= 0) { status = "STALL"; break; }

        speed += ((net * fltNm / 100) / totalJ) * 9.55 * dt / (mRPM / 100);
        time += dt;

        if (Math.round(time/dt) % 10 === 0) {
            plotData.s.push(speed.toFixed(1));
            plotData.mt.push(activeMt);
            plotData.mc.push(activeMc);
            plotData.lt.push(curLt);
        }
    }

    updateUI(time, status, minNet, peakA);
    renderChart(plotData);
}

function updateUI(t, status, minNet, peakA) {
    document.getElementById('statTime').innerText = status === "SUCCESS" ? t.toFixed(2) + "s" : "--";
    document.getElementById('statStatus').innerText = status;
    document.getElementById('statNet').innerText = minNet.toFixed(1) + "%";
    document.getElementById('statPeak').innerText = peakA.toFixed(1);
}

function renderChart(data) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (mainChart) mainChart.destroy();
    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.s,
            datasets: [
                { label: 'Torque %', data: data.mt, borderColor: '#22d3ee', borderWidth: 3, pointRadius: 0, tension: 0.4 },
                { label: 'Load %', data: data.lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, tension: 0.4 },
                { label: 'Current %', data: data.mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0, tension: 0.4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %' } },
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}
window.onload = init;