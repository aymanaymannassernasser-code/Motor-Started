/**
 * Motor Started v1.7
 * Added: Soft Start Time Ramp logic, User Default Data Integration.
 */

const speeds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];

// User typical data provided in images
const defaultData = {
    mt: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
    mc: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
    lt: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42]
};

let mainChart = null;

function init() {
    const tbody = document.getElementById('tableBody');
    speeds.forEach((s, i) => {
        const row = `<tr>
            <td>${s}%</td>
            <td><input type="number" class="val-mt" value="${defaultData.mt[i]}"></td>
            <td><input type="number" class="val-mc" value="${defaultData.mc[i]}"></td>
            <td><input type="number" class="val-lt" value="${defaultData.lt[i]}"></td>
        </tr>`;
        tbody.innerHTML += row;
    });

    updateCalculations();
    document.querySelectorAll('input').forEach(el => el.addEventListener('input', updateCalculations));
    document.getElementById('btnDOL').onclick = () => runSimulation('DOL');
    document.getElementById('btnSS').onclick = () => runSimulation('SS');
}

function updateCalculations() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    document.getElementById('loadValDisplay').innerText = document.getElementById('loadScale').value + "%";
    document.getElementById('resFLT').innerText = ((kw * 9550) / rpm).toFixed(1);
}

function runSimulation(mode) {
    const lScale = parseFloat(document.getElementById('loadScale').value) / 100;
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    const rpm = parseFloat(document.getElementById('mRPM').value);
    
    // Soft Start Ramp Params
    const initI = parseFloat(document.getElementById('ssInitI').value);
    const limitI = parseFloat(document.getElementById('ssLimitI').value);
    const rampTime = parseFloat(document.getElementById('ssRamp').value);

    let simData = { s: [], mt: [], lt: [], mc: [] };
    const rows = document.querySelectorAll('#tableBody tr');

    // Numerical Integration variables
    let speed = 0, time = 0, minNet = 999, status = "SUCCESS", peakA = 0;
    const dt = 0.02; 
    let results = { speedArr: [], torqueArr: [], currentArr: [], loadArr: [] };

    while (speed < 98 && time < 60) {
        let idx = speeds.findIndex(v => v >= speed);
        if (idx === -1) idx = speeds.length - 1;

        const mt_raw = parseFloat(rows[idx].querySelector('.val-mt').value);
        const mc_raw = parseFloat(rows[idx].querySelector('.val-mc').value);
        const lt_raw = parseFloat(rows[idx].querySelector('.val-lt').value) * lScale;

        let currentI_pct, torque_pct;

        if (mode === 'SS') {
            // Calculate Ramp-to-Limit Current
            let current_limit_now = (time < rampTime) 
                ? initI + ((limitI - initI) * (time / rampTime)) 
                : limitI;
            
            let vRatio = Math.min(1, current_limit_now / mc_raw);
            torque_pct = mt_raw * vRatio * vRatio;
            currentI_pct = mc_raw * vRatio;
        } else {
            torque_pct = mt_raw;
            currentI_pct = mc_raw;
        }

        let net = torque_pct - lt_raw;
        if (net < minNet) minNet = net;
        if ((currentI_pct * mFLC / 100) > peakA) peakA = (currentI_pct * mFLC / 100);

        if (net <= 0) { status = "STALL"; break; }

        let accel = (net * fltNm / 100) / totalJ;
        speed += (accel * 9.55) * dt / (rpm / 100);
        time += dt;

        // Collect data for charting (sampled)
        if (Math.round(time/dt) % 5 === 0 || speed >= 98) {
            results.speedArr.push(speed.toFixed(1));
            results.torqueArr.push(torque_pct);
            results.currentArr.push(currentI_pct);
            results.loadArr.push(lt_raw);
        }
    }

    if (time >= 60) status = "TIMEOUT";
    updateUI(time, status, minNet, peakA);
    renderChart(results);
}

function updateUI(t, status, minNet, peakA) {
    document.getElementById('statTime').innerText = status === "SUCCESS" ? t.toFixed(2) + "s" : "--";
    document.getElementById('statStatus').innerText = status;
    document.getElementById('statNet').innerText = minNet.toFixed(1) + "%";
    document.getElementById('statPeak').innerText = peakA.toFixed(1);
    document.getElementById('statStatus').style.color = status === "SUCCESS" ? "#10b981" : "#f43f5e";
}

function renderChart(res) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (mainChart) mainChart.destroy();

    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: res.speedArr,
            datasets: [
                { label: 'Motor Torque %', data: res.torqueArr, borderColor: '#22d3ee', borderWidth: 2, pointRadius: 0 },
                { label: 'Load Torque %', data: res.loadArr, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 },
                { label: 'Current %', data: res.currentArr, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', pointRadius: 0 }
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