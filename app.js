/**
 * Motor Started v1.4
 * Added: Manual Load Scaling, Persistent Curve Drawing on Stall, Failed Point Markers.
 */

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
    const lScale = document.getElementById('loadScale').value;
    document.getElementById('valLoadScale').innerText = lScale;
    
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
    const lScaleFactor = parseFloat(document.getElementById('loadScale').value) / 100;

    // 1. Generate FULL curves (even for stall scenarios)
    labels.forEach(s => {
        const phys = getMotorPhysics(s);
        let t_load = document.getElementById('loadProfile').value === 'fan' ? Math.pow(s / 100, 2) * 100 : 100;
        t_load *= lScaleFactor; // Apply manual load scaling

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

    // 2. Simulation Logic
    let speed = 0, time = 0, thermal = 0, minNet = Infinity, stallPoint = null, resultType = "SUCCESS";
    const dt = 0.02;
    const thermalLimit = Math.pow(parseFloat(document.getElementById('pLRC').value), 2) * tStallMax;

    while (speed < 98) {
        let idx = Math.min(100, Math.floor(speed));
        let tM = data.actT[idx];
        let tL = data.loadT[idx];
        let iA = data.actI[idx];
        
        let net = tM - tL;
        if (net < minNet) minNet = net;

        if (net <= 0.1) { resultType = "STALL"; stallPoint = idx; break; }

        thermal += Math.pow(iA, 2) * dt;
        if (thermal >= thermalLimit || time > 60) { resultType = "TRIP"; stallPoint = idx; break; }

        let accel = (net * fltNm / 100) / totalJ;
        speed += ((accel * 9.55) * dt / syncSpeed) * 100;
        time += dt;
    }

    updateUI(mode, time, thermal, thermalLimit, minNet, resultType);
    renderChart(mode, labels, data, stallPoint);
}

function updateUI(mode, t, therm, lim, minT, status) {
    const container = mode === 'DOL' ? 'statsDOL' : 'statsSS';
    const cards = document.getElementById(container).querySelectorAll('.val');
    
    cards[0].innerText = (status === "SUCCESS") ? t.toFixed(2) + "s" : "--";
    cards[1].innerText = ((therm / lim) * 100).toFixed(1) + "%";
    cards[2].innerText = minT.toFixed(1) + "%";
    cards[3].innerText = status;

    const alert = document.getElementById('statusAlert');
    alert.className = "alert " + status.toLowerCase();
    alert.innerText = status === "SUCCESS" ? "Motor Successfully Started" : "Failure: Motor " + status;
    alert.classList.remove('hidden');
}

function renderChart(mode, labels, data, stallIdx) {
    const ctx = document.getElementById(mode === 'DOL' ? 'chartDOL' : 'chartSS').getContext('2d');
    const isSS = mode === 'SS';
    if (mode === 'DOL' && chartDOL) chartDOL.destroy();
    if (mode === 'SS' && chartSS) chartSS.destroy();

    const annotations = [];
    if (stallIdx !== null) {
        annotations.push({
            type: 'point',
            xValue: stallIdx,
            yValue: data.actT[stallIdx],
            backgroundColor: 'red',
            radius: 8,
            label: { content: 'STALL', enabled: true }
        });
    }

    const config = {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Torque %', data: isSS ? data.actT : data.dolT, borderColor: '#22d3ee', borderWidth: 3, tension: 0.2 },
                { label: 'Load %', data: data.loadT, borderColor: '#f43f5e', borderDash: [4, 4], tension: 0.1 },
                { label: 'Current %', data: isSS ? data.actI : data.dolI, borderColor: '#fbbf24', borderWidth: 1.5, yAxisID: 'y1', tension: 0.1 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            elements: { point: { radius: (ctx) => (stallIdx !== null && ctx.dataIndex === stallIdx) ? 6 : 0, backgroundColor: 'red' } },
            scales: {
                y: { min: 0, title: { display: true, text: 'Torque %' } },
                y1: { min: 0, title: { display: true, text: 'Current %' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    };
    if (isSS) config.data.datasets.push({ label: 'DOL Torque Ref', data: data.dolT, borderColor: '#94a3b8', borderDash: [5, 5], tension: 0.2 });
    
    const c = new Chart(ctx, config);
    if (mode === 'DOL') chartDOL = c; else chartSS = c;
}

window.onload = init;