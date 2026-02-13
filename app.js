/**
 * Motor Started Digital Twin Engine
 * Developed by Ayman Elkhodary
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
    const mJ = parseFloat(document.getElementById('mJ').value) || 0;
    const lJ = parseFloat(document.getElementById('lJ').value) || 0;
    
    const flt = (kw * 9550) / rpm;
    document.getElementById('resFLT').innerText = flt.toFixed(1);
    document.getElementById('resTotalJ').innerText = (mJ + lJ).toFixed(2);
}

/**
 * PHYSICS ENGINE: Modified Kloss Model
 * Generates high-fidelity torque/current data points based on induction motor slip.
 */
function getMotorPhysics(speedPct) {
    const s = Math.max(0.0001, (100.01 - speedPct) / 100); // Slip (avoiding zero)
    
    // Technical Setpoints from UI
    const T_lrt = parseFloat(document.getElementById('pLRT').value) / 100;
    const T_bdt = parseFloat(document.getElementById('pBDT').value) / 100;
    const I_lrc = parseFloat(document.getElementById('pLRC').value) / 100;
    const T_put = parseFloat(document.getElementById('pPUT').value) / 100;

    // 1. Calculate Breakdown Slip (sk)
    // T_lrt = (2 * T_bdt) / (1/sk + sk/1) -> Solving for sk
    const a = T_lrt / (2 * T_bdt);
    const sk = a + Math.sqrt(Math.max(0, a * a - 1 + 2 * a)) || 0.18;

    // 2. Kloss Torque Formula (Fundamental)
    let torque = (2 * T_bdt) / (s / sk + sk / s);
    
    // 3. Realistic "Deep Bar" / Pull-up Adjustment
    // Corrects the Kloss symmetry to include the characteristic pull-up sag.
    if (speedPct > 0 && speedPct < 60) {
        const weight = Math.sin((speedPct / 60) * Math.PI);
        const sagFactor = (T_put / 100) / (torque); 
        if (sagFactor < 1) torque *= (1 - (1 - sagFactor) * weight * 0.4);
    }

    // 4. Admittance-Based Current Model
    // Current in induction motors follows an impedance curve that stays high 
    // until slip is significantly reduced (the 'Plateau' effect).
    const i_mag = 0.30; // 30% Magnetizing current baseline
    const i_active = (I_lrc - i_mag) * Math.pow(s, 0.4); 
    let current = Math.sqrt(Math.pow(i_active, 2) + Math.pow(i_mag, 2));

    return { torque: torque * 100, current: current * 100 };
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
    
    // Build Data Arrays
    labels.forEach(s => {
        const phys = getMotorPhysics(s);
        const t_load = document.getElementById('loadProfile').value === 'fan' ? 
                       Math.pow(s / 100, 2) * 100 : 100;
        
        data.dolT.push(phys.torque);
        data.dolI.push(phys.current);
        data.loadT.push(t_load);

        if (mode === 'SS') {
            // Soft Start Physics: Torque scales with V^2, Current with V
            let vRatio = Math.min(1, iLimit / phys.current);
            data.actI.push(phys.current * vRatio);
            data.actT.push(phys.torque * Math.pow(vRatio, 2));
        } else {
            data.actI.push(phys.current);
            data.actT.push(phys.torque);
        }
    });

    // Numerical Simulation (Euler Integration)
    let speed = 0, time = 0, thermal = 0, minNet = Infinity, minI = Infinity, stall = false;
    const dt = 0.01; 
    const thermalLimit = Math.pow(lrc, 2) * tStallMax;

    while (speed < 98 && time < 120) {
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
    
    const alert = document.getElementById('stallAlert');
    if (stalled) alert.classList.remove('hidden'); else alert.classList.add('hidden');
}

function renderChart(mode, labels, data) {
    const canvasId = mode === 'DOL' ? 'chartDOL' : 'chartSS';
    const ctx = document.getElementById(canvasId).getContext('2d');
    const isSS = mode === 'SS';
    
    if (mode === 'DOL' && chartDOL) chartDOL.destroy();
    if (mode === 'SS' && chartSS) chartSS.destroy();

    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Torque %', data: isSS ? data.actT : data.dolT, borderColor: '#22d3ee', borderWidth: 3, yAxisID: 'y', tension: 0.3 },
                { label: 'Load %', data: data.loadT, borderColor: '#f43f5e', borderDash: [4, 4], yAxisID: 'y', tension: 0.1 },
                { label: 'Current %', data: isSS ? data.actI : data.dolI, borderColor: '#fbbf24', borderWidth: 2, yAxisID: 'y1', tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            elements: { point: { radius: 0 } },
            scales: {
                x: { title: { display: true, text: 'Speed (%)' }, grid: { color: '#f1f5f9' } },
                y: { min: 0, title: { display: true, text: 'Torque (% FLT)' }, position: 'left' },
                y1: { min: 0, title: { display: true, text: 'Current (% FLC)' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    };

    if (isSS) {
        chartConfig.data.datasets.push({ label: 'DOL Torque (Ref)', data: data.dolT, borderColor: '#cbd5e1', borderDash: [5, 5], yAxisID: 'y', tension: 0.3 });
    }

    const newChart = new Chart(ctx, chartConfig);
    if (mode === 'DOL') chartDOL = newChart; else chartSS = newChart;
}

window.onload = init;