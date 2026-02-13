/**
 * Motor Started v1.6
 * Feature: 19-Point Manual Grid, Persistent Field Restoration, Optimized Physics.
 */

const speeds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
let mainChart = null;

function init() {
    const tbody = document.getElementById('tableBody');
    speeds.forEach(s => {
        // Base Model Logic for initial values
        let baseT = s < 80 ? 150 - (s * 0.2) : 150 + (s - 80) * 5; 
        if (s > 90) baseT = 250 - (s - 90) * 25;
        let baseC = 600 - (s * 3);
        let baseLT = Math.pow(s / 100, 2) * 100;

        const row = `<tr>
            <td>${s}%</td>
            <td><input type="number" class="val-mt" data-s="${s}" value="${Math.max(0, baseT).toFixed(0)}"></td>
            <td><input type="number" class="val-mc" data-s="${s}" value="${Math.max(30, baseC).toFixed(0)}"></td>
            <td><input type="number" class="val-lt" data-s="${s}" value="${baseLT.toFixed(0)}"></td>
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
    const iLimit = parseFloat(document.getElementById('ssLimitI').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const totalJ = parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value);
    
    let simData = { s: [], mt: [], lt: [], mc: [] };
    const rows = document.querySelectorAll('#tableBody tr');

    rows.forEach(row => {
        const s = parseInt(row.cells[0].innerText);
        const mt_raw = parseFloat(row.querySelector('.val-mt').value);
        const mc_raw = parseFloat(row.querySelector('.val-mc').value);
        const lt_raw = parseFloat(row.querySelector('.val-lt').value) * lScale;

        simData.s.push(s);
        if (mode === 'SS') {
            let v = Math.min(1, iLimit / mc_raw);
            simData.mt.push(mt_raw * v * v);
            simData.mc.push(mc_raw * v);
        } else {
            simData.mt.push(mt_raw);
            simData.mc.push(mc_raw);
        }
        simData.lt.push(lt_raw);
    });

    // Numerical Integration
    let speed = 0, time = 0, minNet = 999, status = "SUCCESS";
    const dt = 0.02;

    while (speed < 98 && time < 60) {
        let idx = speeds.findIndex(v => v >= speed);
        if (idx === -1) idx = speeds.length - 1;

        let net = simData.mt[idx] - simData.lt[idx];
        if (net < minNet) minNet = net;

        if (net <= 0.1) { status = "STALL"; break; }

        let accel = (net * fltNm / 100) / totalJ;
        speed += (accel * 9.55) * dt / (parseFloat(document.getElementById('mRPM').value) / 100);
        time += dt;
    }

    if (time >= 60) status = "TIMEOUT";
    
    updateUI(time, status, minNet);
    renderChart(simData);
}

function updateUI(t, status, minNet) {
    document.getElementById('statTime').innerText = status === "SUCCESS" ? t.toFixed(2) + "s" : "--";
    document.getElementById('statStatus').innerText = status;
    document.getElementById('statNet').innerText = minNet.toFixed(1) + "%";
    document.getElementById('statStatus').style.color = status === "SUCCESS" ? "#10b981" : "#f43f5e";
}

function renderChart(data) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (mainChart) mainChart.destroy();

    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.s,
            datasets: [
                { label: 'Motor Torque %', data: data.mt, borderColor: '#22d3ee', borderWidth: 3, tension: 0.3 },
                { label: 'Load Torque %', data: data.lt, borderColor: '#f43f5e', borderDash: [5,5], tension: 0.3 },
                { label: 'Current %', data: data.mc, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, position: 'right', title: { display: true, text: 'Current %' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

window.onload = init;