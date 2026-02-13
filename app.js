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

// Improved Realistic Curve Spline (Catmull-Rom logic)
function getMotorPhysics(speedPct, type) {
    const p0 = { s: 0, t: parseFloat(document.getElementById('pLRT').value), i: parseFloat(document.getElementById('pLRC').value) };
    const p1 = { s: 25, t: parseFloat(document.getElementById('pPUT').value), i: parseFloat(document.getElementById('pPUC').value) };
    const p2 = { s: 85, t: parseFloat(document.getElementById('pBDT').value), i: parseFloat(document.getElementById('pBDC').value) };
    const p3 = { s: 100, t: 0, i: 40 }; // Estimated No-load

    // Smooth spline interpolation for realistic physics
    if (speedPct <= 25) return interpolate(speedPct, 0, p0[type], 25, p1[type]);
    if (speedPct <= 85) {
        // Add a slight "dip" for more realistic pull-up sag
        let base = interpolate(speedPct, 25, p1[type], 85, p2[type]);
        return type === 't' ? base * (1 - 0.05 * Math.sin((speedPct-25)/60 * Math.PI)) : base;
    }
    return interpolate(speedPct, 85, p2[type], 100, p3[type]);
}

function interpolate(x, x0, y0, x1, y1) {
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function runSimulation(mode) {
    const labels = Array.from({length: 101}, (_, i) => i);
    const data = { dolT: [], dolI: [], loadT: [], actT: [], actI: [] };
    
    const totalJ = parseFloat(document.getElementById('resTotalJ').innerText);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const iLimit = parseFloat(document.getElementById('ssLimitI').value);
    const syncSpeed = parseFloat(document.getElementById('mRPM').value) * 1.02;
    const tStallMax = parseFloat(document.getElementById('tStall').value);
    const lrc = parseFloat(document.getElementById('pLRC').value);
    
    // Generate Curves
    labels.forEach(s => {
        const t_dol = getMotorPhysics(s, 't');
        const i_dol = getMotorPhysics(s, 'i');
        const t_load = document.getElementById('loadProfile').value === 'fan' ? Math.pow(s / 100, 2) * 100 : 100;
        
        data.dolT.push(t_dol);
        data.dolI.push(i_dol);
        data.loadT.push(t_load);

        if (mode === 'SS') {
            let vRatio = Math.min(1, iLimit / i_dol);
            data.actI.push(i_dol * vRatio);
            data.actT.push(t_dol * Math.pow(vRatio, 2));
        } else {
            data.actI.push(i_dol);
            data.actT.push(t_dol);
        }
    });

    // Numerical Integration
    let speed = 0, time = 0, thermal = 0, minNet = Infinity, minI = Infinity, stall = false;
    const dt = 0.02;
    const thermalLimit = Math.pow(lrc, 2) * tStallMax;

    while (speed < 98 && time < 60) {
        let idx = Math.min(100, Math.floor(speed));
        let tM = data.actT[idx];
        let tL = data.loadT[idx];
        let iA = data.actI[idx];
        
        let net = tM - tL;
        if (net < minNet) minNet = net;
        if (iA < minI) minI = iA;
        if (net <= 0 && speed < 90) { stall = true; break; }

        let accel = (net * fltNm / 100) / totalJ;
        speed += ((accel * 9.55) * dt / syncSpeed) * 100;
        thermal += Math.pow(iA, 2) * dt;
        time += dt;
    }

    updateUI(mode, time, thermal, thermalLimit, minNet, minI, stall);
    renderChart(mode, labels, data);
}

function updateUI(mode, t, therm, lim, minT, minI, stalled) {
    const container = mode === 'DOL' ? 'statsDOL' : 'statsSS';
    const cards = document.getElementById(container).querySelectorAll('.val');
    cards[0].innerText = stalled ? "STALL" : t.toFixed(2) + "s";
    cards[1].innerText = ((therm/lim)*100).toFixed(1) + "%";
    cards[2].innerText = minT.toFixed(1) + "%";
    cards[3].innerText = minI.toFixed(1) + "%";
    document.getElementById('stallAlert').className = stalled ? 'alert' : 'hidden';
}

function renderChart(mode, labels, data) {
    const ctx = document.getElementById(mode === 'DOL' ? 'chartDOL' : 'chartSS').getContext('2d');
    const isSS = mode === 'SS';
    
    if (mode === 'DOL' && chartDOL) chartDOL.destroy();
    if (mode === 'SS' && chartSS) chartSS.destroy();

    const datasets = [
        { label: 'Torque %', data: isSS ? data.actT : data.dolT, borderColor: '#22d3ee', borderWidth: 3, yAxisID: 'y', tension: 0.4 },
        { label: 'Load %', data: data.loadT, borderColor: '#f43f5e', borderDash: [3, 3], yAxisID: 'y', tension: 0.4 },
        { label: 'Current %', data: isSS ? data.actI : data.dolI, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', tension: 0.4 }
    ];

    if (isSS) {
        datasets.push({ label: 'DOL Torque Ref', data: data.dolT, borderColor: '#94a3b8', borderDash: [5, 5], yAxisID: 'y', tension: 0.4 });
    }

    const config = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            elements: { point: { radius: 0 } },
            scales: {
                y: { title: { display: true, text: 'Torque %' } },
                y1: { title: { display: true, text: 'Current %' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    };

    if (mode === 'DOL') chartDOL = new Chart(ctx, config);
    else chartSS = new Chart(ctx, config);
}

window.onload = init;