let chart;

function init() {
    updateCalculations();
    document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateCalculations));
    document.getElementById('runSim').addEventListener('click', runSimulation);
}

function updateCalculations() {
    const kw = parseFloat(document.getElementById('mKW').value);
    const rpm = parseFloat(document.getElementById('mRPM').value);
    const mJ = parseFloat(document.getElementById('mJ').value);
    const lJ = parseFloat(document.getElementById('lJ').value);

    const flt = (kw * 9550) / rpm;
    document.getElementById('resFLT').innerText = flt.toFixed(1);
    document.getElementById('resTotalJ').innerText = (mJ + lJ).toFixed(2);
}

function interpolate(x, x0, y0, x1, y1) {
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

// Cubic spline logic for Motor Curves
function getMotorPoint(speedPct, type) {
    const p0 = { s: 0, t: parseFloat(document.getElementById('pLRT').value), i: parseFloat(document.getElementById('pLRC').value) };
    const p1 = { s: 25, t: parseFloat(document.getElementById('pPUT').value), i: parseFloat(document.getElementById('pPUC').value) };
    const p2 = { s: 85, t: parseFloat(document.getElementById('pBDT').value), i: parseFloat(document.getElementById('pBDC').value) };
    const p3 = { s: 100, t: 0, i: 50 }; // No-load current approx 50%

    let val;
    if (speedPct <= 25) val = interpolate(speedPct, p0.s, p0[type], p1.s, p1[type]);
    else if (speedPct <= 85) val = interpolate(speedPct, p1.s, p1[type], p2.s, p2[type]);
    else val = interpolate(speedPct, p2.s, p2[type], p3.s, p3[type]);
    return val;
}

function runSimulation() {
    const speedPoints = [];
    const dolTorque = [];
    const ssTorque = [];
    const loadTorque = [];
    const dolCurrent = [];
    const ssCurrent = [];
    
    const totalJ = parseFloat(document.getElementById('resTotalJ').innerText);
    const iLimit = parseFloat(document.getElementById('ssLimitI').value);
    const syncSpeed = parseFloat(document.getElementById('mRPM').value) * 1.02; // Simple sync speed approx
    const dt = 0.05; 
    
    let currentSpeed = 0;
    let time = 0;
    let stall = false;
    let thermalAcc = 0;
    let minNetT = Infinity;
    let minStartI = Infinity;

    // Build visualization curves (0-100% Speed)
    for (let s = 0; s <= 100; s++) {
        speedPoints.push(s);
        const t_dol = getMotorPoint(s, 't');
        const i_dol = getMotorPoint(s, 'i');
        const t_load = document.getElementById('loadProfile').value === 'fan' ? Math.pow(s / 100, 2) * 100 : 100;

        dolTorque.push(t_dol);
        dolCurrent.push(i_dol);
        loadTorque.push(t_load);

        // Soft Start Logic
        let vRatio = Math.min(1, iLimit / i_dol);
        ssCurrent.push(i_dol * vRatio);
        ssTorque.push(t_dol * Math.pow(vRatio, 2));
    }

    // Step-by-step Simulation for Results
    const ratedTorqueNm = parseFloat(document.getElementById('resFLT').innerText);
    const iLRC = parseFloat(document.getElementById('pLRC').value);
    const tStall = parseFloat(document.getElementById('tStall').value);
    const thermalLimit = Math.pow(iLRC, 2) * tStall;

    while (currentSpeed < 95 && time < 60) {
        let sIdx = Math.floor(currentSpeed);
        let tMot = ssTorque[sIdx];
        let tLd = loadTorque[sIdx];
        let iAct = ssCurrent[sIdx];

        let netT = tMot - tLd;
        if (netT < minNetT) minNetT = netT;
        if (iAct < minStartI) minStartI = iAct;

        if (netT <= 0) { stall = true; break; }

        let accel = (netT * ratedTorqueNm / 100) / totalJ;
        let deltaSpeedRpm = (accel * 9.55) * dt;
        currentSpeed += (deltaSpeedRpm / syncSpeed) * 100;
        
        thermalAcc += Math.pow(iAct, 2) * dt;
        time += dt;
    }

    // Update UI
    document.getElementById('outTime').innerText = stall ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('outThermal').innerText = ((thermalAcc / thermalLimit) * 100).toFixed(1) + "%";
    document.getElementById('outMinTorque').innerText = minNetT.toFixed(1) + "%";
    document.getElementById('outMinI').innerText = minStartI.toFixed(1) + "%";
    document.getElementById('stallAlert').className = stall ? 'alert' : 'hidden';

    renderChart(speedPoints, dolTorque, ssTorque, loadTorque, dolCurrent, ssCurrent);
}

function renderChart(labels, dolT, ssT, loadT, dolI, ssI) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'DOL Torque %', data: dolT, borderColor: '#94a3b8', borderDash: [5, 5], yAxisID: 'y' },
                { label: 'SS Torque %', data: ssT, borderColor: '#22d3ee', borderWidth: 3, yAxisID: 'y' },
                { label: 'Load Torque %', data: loadT, borderColor: '#f43f5e', borderDash: [2, 2], yAxisID: 'y' },
                { label: 'DOL Current %', data: dolI, borderColor: '#475569', borderDash: [5, 5], yAxisID: 'y1' },
                { label: 'SS Current %', data: ssI, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed %' } },
                y: { title: { display: true, text: 'Torque %' }, position: 'left' },
                y1: { title: { display: true, text: 'Current %' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}

window.onload = init;