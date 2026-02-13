/**
 * Motor Started v1.5
 * Fixed: Chart rendering crash, Stall indicator logic.
 * Added: Live Load Scaling display.
 */

let chartDOL = null;
let chartSS = null;

function init() {
    updateCalculations();
    document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateCalculations));
    document.getElementById('btnDOL').onclick = () => runSimulation('DOL');
    document.getElementById('btnSS').onclick = () => runSimulation('SS');
}

function updateCalculations() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    const lScale = document.getElementById('loadScale').value;
    document.getElementById('loadValDisplay').innerText = lScale + "%";
    
    const flt = (kw * 9550) / rpm;
    document.getElementById('resFLT').innerText = flt.toFixed(1);
    document.getElementById('resTotalJ').innerText = (parseFloat(document.getElementById('mJ').value) + parseFloat(document.getElementById('lJ').value)).toFixed(2);
}

function getMotorPhysics(speedPct) {
    const T_lrt = parseFloat(document.getElementById('pLRT').value);
    const T_put = parseFloat(document.getElementById('pPUT').value);
    const T_bdt = parseFloat(document.getElementById('pBDT').value);
    const I_lrc = parseFloat(document.getElementById('pLRC').value);
    const I_puc = parseFloat(document.getElementById('pPUC').value);
    const I_bdc = parseFloat(document.getElementById('pBDC').value);

    let t, i;
    if (speedPct <= 25) {
        t = lerp(speedPct, 0, T_lrt, 25, T_put);
        i = lerp(speedPct, 0, I_lrc, 25, I_puc);
    } else if (speedPct <= 85) {
        t = lerp(speedPct, 25, T_put, 85, T_bdt);
        i = lerp(speedPct, 25, I_puc, 85, I_bdc);
    } else {
        t = lerp(speedPct, 85, T_bdt, 100, 0);
        i = lerp(speedPct, 85, I_bdc, 100, 30);
    }
    return { torque: t, current: i };
}

function lerp(x, x0, y0, x1, y1) { return y0 + (x - x0) * (y1 - y0) / (x1 - x0); }

function runSimulation(mode) {
    const labels = Array.from({length: 101}, (_, i) => i);
    const data = { motorT: [], loadT: [], currentI: [] };
    const lScale = parseFloat(document.getElementById('loadScale').value) / 100;
    const iLimit = parseFloat(document.getElementById('ssLimitI').value);

    // Pre-calculate full curves for the chart
    for (let s = 0; s <= 100; s++) {
        const phys = getMotorPhysics(s);
        let tl = document.getElementById('loadProfile').value === 'fan' ? Math.pow(s/100, 2) * 100 : 100;
        tl *= lScale;
        
        data.loadT.push(tl);
        if (mode === 'SS') {
            let v = Math.min(1, iLimit / phys.current);
            data.motorT.push(phys.torque * v * v);
            data.currentI.push(phys.current * v);
        } else {
            data.motorT.push(phys.torque);
            data.currentI.push(phys.current);
        }
    }

    // Step-by-step Simulation for stats
    let speed = 0, time = 0, thermal = 0, minNet = 999, stallIdx = null, status = "HEALTHY";
    const dt = 0.05;

    while (speed < 98 && time < 30) {
        let idx = Math.floor(speed);
        let net = data.motorT[idx] - data.loadT[idx];
        if (net < minNet) minNet = net;
        
        if (net <= 0) { status = "STALL"; stallIdx = idx; break; }
        
        // Simple acceleration: speed += (net torque) * constant
        speed += net * 0.1; 
        time += dt;
        thermal += (data.currentI[idx] / 100) * dt;
    }

    if (time >= 30 && speed < 98) status = "TIMEOUT";

    updateUI(mode, time, thermal, minNet, status);
    renderChart(mode, labels, data, stallIdx);
}

function updateUI(mode, t, therm, minT, status) {
    const container = mode === 'DOL' ? 'statsDOL' : 'statsSS';
    const cards = document.getElementById(container).querySelectorAll('.val');
    cards[0].innerText = status === "HEALTHY" ? t.toFixed(2) + "s" : "--";
    cards[1].innerText = therm.toFixed(1);
    cards[2].innerText = minT.toFixed(1) + "%";
    cards[3].innerText = status;
    cards[3].style.color = status === "HEALTHY" ? "#10b981" : "#f43f5e";
}

function renderChart(mode, labels, data, stallIdx) {
    const canvasId = mode === 'DOL' ? 'chartDOL' : 'chartSS';
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    if (mode === 'DOL' && chartDOL) chartDOL.destroy();
    if (mode === 'SS' && chartSS) chartSS.destroy();

    const chartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Torque%', data: data.motorT, borderColor: '#22d3ee', borderWidth: 2, pointRadius: 0 },
                { label: 'Load%', data: data.loadT, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 },
                { label: 'Current%', data: data.currentI, borderColor: '#fbbf24', borderWidth: 1, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, position: 'right', grid: { drawOnChartArea: false } }
            },
            plugins: {
                tooltip: { enabled: true }
            }
        }
    });

    if (mode === 'DOL') chartDOL = chartObj; else chartSS = chartObj;
}

window.onload = init;