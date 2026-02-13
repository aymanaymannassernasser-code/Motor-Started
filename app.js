let chartDOL, chartSS;

function init() {
    updateCalculations();
    document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updateCalculations));
    document.getElementById('btnDOL').addEventListener('click', () => runSimulation('DOL'));
    document.getElementById('btnSS').addEventListener('click', () => runSimulation('SS'));
}

function updateCalculations() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    const mJ = parseFloat(document.getElementById('mJ').value) || 0;
    const lJ = parseFloat(document.getElementById('lJ').value) || 0;
    const flt = (kw * 9550) / rpm;
    document.getElementById('resFLT').innerText = flt.toFixed(1);
    document.getElementById('resTotalJ').innerText = (mJ + lJ).toFixed(2);
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
        i = lerp(speedPct, 85, I_bdc, 100, 35);
    }
    return { torque: t, current: i };
}

function lerp(x, x0, y0, x1, y1) { return y0 + (x - x0) * (y1 - y0) / (x1 - x0); }

function runSimulation(mode) {
    const labels = Array.from({length: 101}, (_, i) => i);
    const data = { dolT: [], dolI: [], loadT: [], actT: [], actI: [] };
    const totalJ = parseFloat(document.getElementById('resTotalJ').innerText);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const iLimit = parseFloat(document.getElementById('ssLimitI').value);
    const syncSpeed = parseFloat(document.getElementById('mRPM').value) * 1.02;
    const tStallMax = parseFloat(document.getElementById('tStall').value);
    const lrc = parseFloat(document.getElementById('pLRC').value);

    // Generate Visual Curves
    labels.forEach(s => {
        const phys = getMotorPhysics(s);
        const t_load = document.getElementById('loadProfile').value === 'fan' ? Math.pow(s / 100, 2) * 100 : 100;
        data.dolT.push(phys.torque);
        data.dolI.push(phys.current);
        data.loadT.push(t_load);
        if (mode === 'SS') {
            let vRatio = Math.min(1, iLimit / phys.current);
            data.actI.push(phys.current * vRatio);
            data.actT.push(phys.torque * Math.pow(vRatio, 2));
        } else {
            data.actI.push(phys.current);
            data.actT.push(phys.torque);
        }
    });

    // Numerical Simulation
    let speed = 0, time = 0, thermal = 0, minNet = Infinity, minI = Infinity;
    let isStall = false, isThermalTrip = false;
    const dt = 0.02; 
    const thermalLimit = Math.pow(lrc, 2) * tStallMax;

    while (speed < 98) {
        let idx = Math.min(100, Math.floor(speed));
        let tM = data.actT[idx];
        let tL = data.loadT[idx];
        let iA = data.actI[idx];
        
        let net = tM - tL;
        if (net < minNet) minNet = net;
        if (iA < minI) minI = iA;

        // Condition 1: Mechanical Stall
        if (net <= 0.5) { isStall = true; break; }

        // Condition 2: Thermal Trip
        thermal += Math.pow(iA, 2) * dt;
        if (thermal >= thermalLimit) { isThermalTrip = true; break; }

        // Condition 3: Hard Time Limit (60s)
        if (time > 60) { isThermalTrip = true; break; }

        let accel = (net * fltNm / 100) / totalJ;
        speed += ((accel * 9.55) * dt / syncSpeed) * 100;
        time += dt;
    }

    updateUI(mode, time, thermal, thermalLimit, minNet, minI, isStall, isThermalTrip);
    renderChart(mode, labels, data);
}

function updateUI(mode, t, therm, lim, minT, minI, stalled, burned) {
    const container = mode === 'DOL' ? 'statsDOL' : 'statsSS';
    const cards = document.getElementById(container).querySelectorAll('.val');
    
    if (stalled) cards[0].innerText = "STALL";
    else if (burned) cards[0].innerText = "TRIP";
    else cards[0].innerText = t.toFixed(2) + "s";

    cards[1].innerText = ((therm / lim) * 100).toFixed(1) + "%";
    cards[2].innerText = minT.toFixed(1) + "%";
    cards[3].innerText = minI.toFixed(1) + "%";
    
    document.getElementById('stallAlert').className = stalled ? 'alert' : 'hidden';
    document.getElementById('thermalAlert').className = burned ? 'alert' : 'hidden';
}

function renderChart(mode, labels, data) {
    const ctx = document.getElementById(mode === 'DOL' ? 'chartDOL' : 'chartSS').getContext('2d');
    const isSS = mode === 'SS';
    if (mode === 'DOL' && chartDOL) chartDOL.destroy();
    if (mode === 'SS' && chartSS) chartSS.destroy();

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Torque %', data: isSS ? data.actT : data.dolT, borderColor: '#22d3ee', borderWidth: 3, yAxisID: 'y', tension: 0.2 },
                { label: 'Load %', data: data.loadT, borderColor: '#f43f5e', borderDash: [4, 4], yAxisID: 'y', tension: 0.1 },
                { label: 'Current %', data: isSS ? data.actI : data.dolI, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', tension: 0.1 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            elements: { point: { radius: 0 } },
            scales: {
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, title: { display: true, text: 'Current %' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    };
    if (isSS) config.data.datasets.push({ label: 'DOL Torque Ref', data: data.dolT, borderColor: '#94a3b8', borderDash: [5, 5], yAxisID: 'y', tension: 0.2 });
    const c = new Chart(ctx, config);
    if (mode === 'DOL') chartDOL = c; else chartSS = c;
}

window.onload = init;