// Motor Starter Simulator v3.0 - LINEAR VS CUBIC COMPARISON
// Testing to find which interpolation method is more accurate

const S_POINTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];

const PRESETS = {
    motor: {
        oem: [80, 80, 80, 80, 80, 80, 81, 89, 108, 114, 121, 131, 141, 152, 166, 178, 173, 125, 0],
        designC: [250, 240, 220, 205, 195, 190, 192, 200, 215, 230, 245, 255, 260, 250, 230, 185, 120, 60, 0],
        highSlip: [160, 162, 165, 170, 175, 185, 200, 215, 230, 235, 240, 245, 235, 215, 190, 150, 100, 50, 0]
    },
    current: {
        oem: [590, 585, 580, 577, 574, 570, 565, 562, 548, 540, 525, 505, 480, 450, 415, 360, 255, 150, 10],
        designC: [550, 545, 538, 530, 520, 510, 500, 485, 465, 455, 435, 405, 370, 320, 270, 210, 140, 75, 10],
        highSlip: [620, 610, 600, 585, 570, 550, 525, 500, 470, 450, 420, 385, 340, 285, 220, 160, 110, 65, 10]
    },
    load: {
        oem: [12, 7, 6, 7, 9, 12, 16, 21, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42],
        centrifugal: [5, 6, 8, 12, 17, 23, 30, 38, 48, 51, 54, 58, 62, 67, 73, 80, 88, 95, 100],
        constant: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40]
    }
};

let chart = null;
let thermalMode = 'percent';
let simulationMode = 'DOL';
let lastSimResults = null;
let useSpline = true; // Toggle between linear and cubic

// LINEAR interpolation
function interpolateLinear(x, xArr, yArr) {
    x = parseFloat(x);
    if (x <= xArr[0]) return parseFloat(yArr[0]);
    if (x >= xArr[xArr.length - 1]) return parseFloat(yArr[yArr.length - 1]);
    
    for (let i = 1; i < xArr.length; i++) {
        if (x <= xArr[i]) {
            let x0 = xArr[i-1], x1 = xArr[i];
            let y0 = parseFloat(yArr[i-1]), y1 = parseFloat(yArr[i]);
            return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
        }
    }
    return parseFloat(yArr[yArr.length - 1]);
}

// CUBIC SPLINE with monotonic constraints
function createMonotonicSpline(xArr, yArr) {
    const n = xArr.length - 1;
    const h = [], delta = [], m = new Array(n + 1);
    
    for (let i = 0; i < n; i++) {
        h[i] = xArr[i + 1] - xArr[i];
        delta[i] = (parseFloat(yArr[i + 1]) - parseFloat(yArr[i])) / h[i];
    }
    
    // Initialize slopes (Fritsch-Carlson method)
    m[0] = delta[0];
    for (let i = 1; i < n; i++) {
        m[i] = (delta[i-1] + delta[i]) / 2;
        
        // Monotonicity constraint
        if (delta[i-1] * delta[i] <= 0) {
            m[i] = 0;
        } else {
            const alpha = m[i] / delta[i-1];
            const beta = m[i] / delta[i];
            if (alpha * alpha + beta * beta > 9) {
                const tau = 3 / Math.sqrt(alpha * alpha + beta * beta);
                m[i] = tau * delta[i-1];
            }
        }
    }
    m[n] = delta[n-1];
    
    return { x: xArr, y: yArr, m: m, h: h };
}

function evaluateMonotonicSpline(spline, x) {
    x = parseFloat(x);
    const n = spline.x.length - 1;
    
    if (x <= spline.x[0]) return parseFloat(spline.y[0]);
    if (x >= spline.x[n]) return parseFloat(spline.y[n]);
    
    let i = 0;
    for (let j = 0; j < n; j++) {
        if (x >= spline.x[j] && x <= spline.x[j + 1]) {
            i = j;
            break;
        }
    }
    
    const h = spline.h[i];
    const t = (x - spline.x[i]) / h;
    const y0 = parseFloat(spline.y[i]);
    const y1 = parseFloat(spline.y[i + 1]);
    const m0 = spline.m[i];
    const m1 = spline.m[i + 1];
    
    // Hermite interpolation
    const h00 = (1 + 2*t) * (1 - t) * (1 - t);
    const h10 = t * (1 - t) * (1 - t);
    const h01 = t * t * (3 - 2*t);
    const h11 = t * t * (t - 1);
    
    return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

// Unified interpolation function
function interpolate(x, xArr, yArr) {
    if (useSpline) {
        // Cache splines
        const key = yArr.join(',');
        if (!window.splineCache) window.splineCache = {};
        if (!window.splineCache[key]) {
            window.splineCache[key] = createMonotonicSpline(xArr, yArr);
        }
        return evaluateMonotonicSpline(window.splineCache[key], x);
    } else {
        return interpolateLinear(x, xArr, yArr);
    }
}

function init() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    S_POINTS.forEach((s, i) => {
        tbody.innerHTML += `<tr><td><b>${s}%</b></td>
            <td><input type="number" class="val-mt" value="${PRESETS.motor.oem[i]}"></td>
            <td><input type="number" class="val-mc" value="${PRESETS.current.oem[i]}"></td>
            <td><input type="number" class="val-lt" value="${PRESETS.load.oem[i]}"></td></tr>`;
    });

    document.getElementById('motorPreset').onchange = (e) => applyPreset('motor', e.target.value);
    document.getElementById('loadPreset').onchange = (e) => applyPreset('load', e.target.value);
    document.getElementById('btnSimulate').onclick = runSimulation;
    document.getElementById('btnSaveCase').onclick = saveCase;
    document.getElementById('btnClearCases').onclick = clearLibrary;
    document.getElementById('btnExportPDF').onclick = exportToPDF;
    document.getElementById('caseDropdown').onchange = loadCase;
    document.getElementById('thermalToggle')?.addEventListener('click', toggleThermal);
    document.getElementById('splineToggle')?.addEventListener('click', toggleSpline);
    document.getElementById('resultTime')?.addEventListener('blur', onStartTimeEdit);
    document.getElementById('resultTime')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') onStartTimeEdit();
    });
    document.getElementById('modeDOL')?.addEventListener('click', () => setMode('DOL'));
    document.getElementById('modeSS')?.addEventListener('click', () => setMode('SS'));
    document.getElementById('motorJ')?.addEventListener('input', updateCombinedJ);
    document.getElementById('loadJ')?.addEventListener('input', updateCombinedJ);

    loadCaseList();
    updateHeader();
    updateCombinedJ();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function toggleSpline() {
    useSpline = !useSpline;
    window.splineCache = {}; // Clear cache
    const btn = document.getElementById('splineToggle');
    if (btn) btn.textContent = useSpline ? 'Cubic ✓' : 'Linear ✓';
    document.getElementById('interpolationMethod').innerText = useSpline ? 'Cubic Spline (Excel-style)' : 'Linear';
}

function onStartTimeEdit() {
    if (simulationMode !== 'SS') return;
    const timeField = document.getElementById('resultTime');
    const timeText = timeField.innerText;
    const timeMatch = timeText.match(/(\d+\.?\d*)/);
    if (!timeMatch) return;
    const targetTime = parseFloat(timeMatch[1]);
    if (isNaN(targetTime) || targetTime <= 0) return;
    solveForCurrentFromTime(targetTime);
}

function updateCombinedJ() {
    const motorJ = parseFloat(document.getElementById('motorJ')?.value) || 0;
    const loadJ = parseFloat(document.getElementById('loadJ')?.value) || 0;
    document.getElementById('totalJ').innerText = (motorJ + loadJ).toFixed(2);
}

function setMode(mode) {
    simulationMode = mode;
    document.getElementById('modeDOL').className = mode === 'DOL' ? 'mode-btn active' : 'mode-btn';
    document.getElementById('modeSS').className = mode === 'SS' ? 'mode-btn active' : 'mode-btn';
    document.getElementById('ssControls').style.display = mode === 'SS' ? 'block' : 'none';
}

function toggleThermal() {
    thermalMode = thermalMode === 'percent' ? 'absolute' : 'percent';
    const btn = document.getElementById('thermalToggle');
    if (btn) btn.textContent = thermalMode === 'percent' ? '→ I²t' : '→ %';
    if (lastSimResults) displayResults(lastSimResults);
}

function applyPreset(type, key) {
    if (key === 'current') return;
    window.splineCache = {}; // Clear cache when data changes
    const mts = document.querySelectorAll('.val-mt'), mcs = document.querySelectorAll('.val-mc'), lts = document.querySelectorAll('.val-lt');
    if (type === 'motor') {
        PRESETS.motor[key].forEach((v, i) => mts[i].value = v);
        PRESETS.current[key].forEach((v, i) => mcs[i].value = v);
    } else {
        PRESETS.load[key].forEach((v, i) => lts[i].value = v);
    }
}

function updateHeader() {
    const kw = parseFloat(document.getElementById('mKW').value) || 0;
    const rpm = parseFloat(document.getElementById('mRPM').value) || 1;
    const poles = parseFloat(document.getElementById('mPoles').value) || 4;
    const freq = parseFloat(document.getElementById('mFreq').value) || 50;
    document.getElementById('resFLT').innerText = ((kw * 9550) / rpm).toFixed(1);
    document.getElementById('resSyncSpeed').innerText = ((120 * freq) / poles).toFixed(0);
}

function calculateMinStartingCurrent(tableMt, tableMc, tableLt) {
    for (let testCurrent = 200; testCurrent <= 700; testCurrent += 2) {
        let minNetTorque = 999, stallDetected = false, criticalSpeedPoint = 0;
        
        for (let i = 0; i < S_POINTS.length; i++) {
            if (S_POINTS[i] >= 95) continue;
            let motorTorque = parseFloat(tableMt[i]);
            let motorCurrent = parseFloat(tableMc[i]);
            let loadTorque = parseFloat(tableLt[i]);
            let vr = Math.min(1.0, testCurrent / motorCurrent);
            let netTorque = motorTorque * vr * vr - loadTorque;
            
            if (netTorque < minNetTorque) {
                minNetTorque = netTorque;
                criticalSpeedPoint = S_POINTS[i];
            }
            if (netTorque < 0) {
                stallDetected = true;
                break;
            }
        }
        if (!stallDetected && minNetTorque >= 2.0) {
            return { current: testCurrent, criticalSpeed: criticalSpeedPoint };
        }
    }
    return { current: 700, criticalSpeed: 0 };
}

function runSimulationCore(mode, ssInitialI, ssFinalI, ssRampTime, returnData = false) {
    const mRPM = parseFloat(document.getElementById('mRPM').value);
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const motorJ = parseFloat(document.getElementById('motorJ')?.value) || 0;
    const loadJ = parseFloat(document.getElementById('loadJ')?.value) || 0;
    const totalJ = motorJ + loadJ;
    
    if (totalJ <= 0) {
        alert('ERROR: Total inertia must be > 0');
        return { time: 60, isStalled: true, stallReason: "Invalid" };
    }
    
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const hStall = parseFloat(document.getElementById('hStall').value);
    const freq = parseFloat(document.getElementById('mFreq').value) || 50;
    const poles = parseFloat(document.getElementById('mPoles').value) || 4;
    
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);
    
    const ns = (120 * freq) / poles;
    const targetRPM = mRPM;
    const targetRadS = (targetRPM * 2 * Math.PI) / 60;
    const lockedRotorCurrentAmps = (parseFloat(tableMc[0]) / 100) * mFLC;
    
    if (mode === 'SS') {
        if (ssInitialI === ssFinalI || ssRampTime === 0 || !ssRampTime) {
            ssRampTime = 0;
            ssFinalI = ssInitialI;
        }
    }

    let time = 0, speedPerc = 0, thermal = 0, thermalAbsRaw = 0;
    let minNet = 999, criticalNetSpeed = 0;
    let isStalled = false, stallSpd = null, stallReason = "";
    let speedRadS = 0, rampEndSpeed = 0;
    
    const dt = 0.01;

    while (time < 60 && speedPerc < 99) {
        let motorTorquePct = interpolate(speedPerc, S_POINTS, tableMt);
        let motorCurrentPct = interpolate(speedPerc, S_POINTS, tableMc);
        let loadTorquePct = interpolate(speedPerc, S_POINTS, tableLt);
        
        let actualMotorTorquePct = motorTorquePct;
        let actualMotorCurrentPct = motorCurrentPct;
        
        if (mode === 'SS') {
            let currentLimit;
            if (ssRampTime > 0 && time <= ssRampTime) {
                currentLimit = ssInitialI + (ssFinalI - ssInitialI) * (time / ssRampTime);
                if (rampEndSpeed === 0 && time >= ssRampTime - dt) {
                    rampEndSpeed = speedPerc;
                }
            } else {
                currentLimit = ssFinalI;
            }
            let voltageRatio = Math.min(1.0, currentLimit / motorCurrentPct);
            actualMotorTorquePct = motorTorquePct * voltageRatio * voltageRatio;
            actualMotorCurrentPct = motorCurrentPct * voltageRatio;
        }
        
        let netTorquePct = actualMotorTorquePct - loadTorquePct;
        
        if (speedPerc < 95 && netTorquePct < minNet) {
            minNet = netTorquePct;
            criticalNetSpeed = speedPerc;
        }
        
        if (speedPerc < 90 && netTorquePct < -0.5) {
            isStalled = true;
            stallReason = "Mechanical";
            stallSpd = speedPerc;
            break;
        }
        
        let netTorqueNm = (netTorquePct / 100.0) * fltNm;
        let angularAccel = netTorqueNm / totalJ;
        speedRadS += angularAccel * dt;
        speedPerc = (speedRadS / targetRadS) * 100.0;
        
        let actualCurrentAmps = (actualMotorCurrentPct / 100.0) * mFLC;
        thermalAbsRaw += actualCurrentAmps * actualCurrentAmps * dt;
        thermal = (thermalAbsRaw / (lockedRotorCurrentAmps * lockedRotorCurrentAmps * hStall)) * 100.0;
        
        time += dt;
    }
    
    if (returnData) {
        return {
            time, isStalled, stallReason, thermal, thermalAbs: thermalAbsRaw,
            minNet, criticalNetSpeed, finalSlip: 1 - (speedPerc / 100),
            ns, stallSpd, rampEndSpeed
        };
    }
    return { time, isStalled, stallReason };
}

function runSimulation() {
    window.splineCache = {}; // Clear cache
    updateHeader();
    
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);

    let ssInitialI = parseFloat(document.getElementById('ssInitialI')?.value) || 250;
    let ssFinalI = parseFloat(document.getElementById('ssFinalI')?.value) || 300;
    let ssRampTime = parseFloat(document.getElementById('ssRampTime')?.value) || 1;
    
    let minStartResult = { current: 0, criticalSpeed: 0 };
    if (simulationMode === 'SS') {
        minStartResult = calculateMinStartingCurrent(tableMt, tableMc, tableLt);
    }

    let results = runSimulationCore(simulationMode, ssInitialI, ssFinalI, ssRampTime, true);
    results.minStartResult = minStartResult;
    results.mFLC = mFLC;
    results.fltNm = fltNm;
    results.ssInitialI = ssInitialI;
    results.ssFinalI = ssFinalI;
    
    lastSimResults = results;
    displayResults(results);
    
    let lbls = Array.from({length: 501}, (_, i) => i * 0.2);
    let dolMt = [], dolMc = [], pLt = [], ssMt = [], ssMc = [];
    
    lbls.forEach(s => {
        let rm = interpolate(s, S_POINTS, tableMt);
        let rc = interpolate(s, S_POINTS, tableMc);
        let rl = interpolate(s, S_POINTS, tableLt);
        
        dolMt.push(rm);
        dolMc.push(rc);
        pLt.push(rl);
        
        if (simulationMode === 'SS') {
            let currentAtThisSpeed;
            if (ssRampTime > 0 && s <= results.rampEndSpeed && results.rampEndSpeed > 0) {
                currentAtThisSpeed = ssInitialI + (ssFinalI - ssInitialI) * (s / results.rampEndSpeed);
            } else {
                currentAtThisSpeed = ssFinalI;
            }
            let vr = Math.min(1, currentAtThisSpeed / rc);
            ssMt.push(rm * vr * vr);
            ssMc.push(currentAtThisSpeed);
        }
    });
    
    renderChart(lbls, dolMt, dolMc, ssMt, ssMc, pLt, results.stallSpd, minStartResult.criticalSpeed, mFLC, fltNm);
}

function displayResults(results) {
    const timeField = document.getElementById('resultTime');
    
    if (results.isStalled) {
        timeField.innerText = `STALL (${results.stallReason})`;
        timeField.contentEditable = 'false';
    } else {
        timeField.innerText = results.time.toFixed(2) + "s";
        timeField.contentEditable = simulationMode === 'SS' ? 'true' : 'false';
        timeField.style.cursor = simulationMode === 'SS' ? 'text' : 'default';
    }
    
    document.getElementById('resultTherm').innerText = thermalMode === 'absolute' ? 
        results.thermalAbs.toFixed(0) + " A²·s" : results.thermal.toFixed(1) + "%";
    
    const minNetAbs = (results.minNet * results.fltNm / 100).toFixed(1);
    const criticalSlip = (1 - (results.criticalNetSpeed / 100)).toFixed(3);
    document.getElementById('resultNet').innerText = 
        `${results.minNet.toFixed(1)}% (${minNetAbs} Nm) @ ${results.criticalNetSpeed.toFixed(0)}%spd (slip ${criticalSlip})`;
    
    if (simulationMode === 'SS') {
        const minStartAbs = (results.minStartResult.current * results.mFLC / 100).toFixed(1);
        document.getElementById('resultMinI').innerText = 
            `${results.minStartResult.current.toFixed(0)}% (${minStartAbs}A) @ ${results.minStartResult.criticalSpeed}%spd`;
    } else {
        document.getElementById('resultMinI').innerText = 'N/A (DOL mode)';
    }
    
    document.getElementById('resultFinalSlip').innerText = results.finalSlip.toFixed(3);
    document.getElementById('resultSyncSpeed').innerText = results.ns.toFixed(0) + " RPM";
}

function renderChart(labels, dolMt, dolMc, ssMt, ssMc, pLt, stallSpd, criticalSpeed, mFLC, fltNm) {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    if (chart) chart.destroy();
    
    const dolIsSolid = (simulationMode === 'DOL');
    
    let datasets = [
        { label: 'Motor Torque (DOL)', data: dolMt, borderColor: '#22d3ee', borderWidth: dolIsSolid ? 3 : 1, borderDash: dolIsSolid ? [] : [5, 5], pointRadius: 0, tension: 0, yAxisID: 'y' },
        { label: 'Load Torque', data: pLt, borderColor: '#f43f5e', borderDash: [5,5], borderWidth: 2, pointRadius: 0, tension: 0, yAxisID: 'y' },
        { label: 'Motor Current (DOL)', data: dolMc, borderColor: '#fbbf24', borderWidth: dolIsSolid ? 2 : 1, borderDash: dolIsSolid ? [] : [5, 5], yAxisID: 'y1', pointRadius: 0, tension: 0 }
    ];
    
    if (simulationMode === 'SS') {
        datasets.push({ label: 'Motor Torque (SS)', data: ssMt, borderColor: '#10b981', borderWidth: 3, pointRadius: 0, tension: 0, yAxisID: 'y' });
        datasets.push({ label: 'Motor Current (SS)', data: ssMc, borderColor: '#f59e0b', borderWidth: 3, pointRadius: 0, tension: 0, yAxisID: 'y1' });
        
        if (criticalSpeed > 0) {
            const critIdx = Math.round(criticalSpeed / 0.2);
            datasets.push({
                label: 'Critical', data: [{x: criticalSpeed, y: ssMt[critIdx]}],
                pointStyle: 'triangle', pointRadius: 12, pointBackgroundColor: '#a855f7',
                pointBorderColor: '#fff', pointBorderWidth: 2, showLine: false, yAxisID: 'y'
            });
        }
    }
    
    if (stallSpd !== null) {
        const stallIdx = Math.round(stallSpd / 0.2);
        datasets.push({ 
            label: 'STALL', data: [{x: stallSpd, y: (simulationMode === 'SS' ? ssMt : dolMt)[stallIdx]}], 
            pointStyle: 'crossRot', pointRadius: 15, pointBackgroundColor: '#ff0000',
            pointBorderColor: '#fff', pointBorderWidth: 3, showLine: false, yAxisID: 'y'
        });
    }
    
    chart = new Chart(ctx, { 
        type: 'line', data: { labels, datasets }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { 
                x: {title: {display:true, text:'Motor Speed (%)', font: {size: 14, weight: 'bold'}, color: '#333'}, grid: {color: 'rgba(0,0,0,0.1)'}, ticks: {color: '#666'}}, 
                y: {min:0, title: {display:true, text:'Torque (%)', font: {size: 14, weight: 'bold'}, color: '#333'}, grid: {color: 'rgba(0,0,0,0.1)'}, position: 'left', ticks: {color: '#666'}}, 
                y1: {position:'right', min:0, grid: {drawOnChartArea: false}, title: {display:true, text:'Current (%)', font: {size: 14, weight: 'bold'}, color: '#333'}, ticks: {color: '#666'}} 
            },
            plugins: {
                legend: {display: true, position: 'top', labels: {color: '#333', font: {size: 11, weight: '600'}, boxWidth: 25, padding: 10, filter: (i) => !i.text.includes('Critical') && !i.text.includes('STALL')}},
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            let l = ctx.dataset.label || '';
                            if (l) l += ': ';
                            l += ctx.parsed.y.toFixed(1) + '%';
                            if (l.includes('Current')) l += ` (${(ctx.parsed.y * mFLC / 100).toFixed(1)}A)`;
                            else if (l.includes('Torque')) l += ` (${(ctx.parsed.y * fltNm / 100).toFixed(1)} Nm)`;
                            l += ` | Slip: ${(1 - ctx.parsed.x / 100).toFixed(3)}`;
                            return l;
                        }
                    }
                }
            }
        } 
    });
}

function solveForCurrentFromTime(targetTime) {
    const ssRampTime = parseFloat(document.getElementById('ssRampTime')?.value) || 0;
    let low = 200, high = 700, iterations = 0, bestCurrent = 0, bestTime = 0;
    
    while (high - low > 2 && iterations < 20) {
        let mid = Math.floor((low + high) / 2);
        let result = runSimulationCore('SS', mid, mid, ssRampTime, true);
        if (result.isStalled || result.time > targetTime) low = mid;
        else { high = mid; bestCurrent = mid; bestTime = result.time; }
        iterations++;
    }
    
    if (bestCurrent > 0) {
        document.getElementById('ssInitialI').value = bestCurrent;
        document.getElementById('ssFinalI').value = bestCurrent;
        runSimulation();
    }
}

function exportToPDF() {
    // Mobile-friendly PDF export
    if (typeof html2canvas !== 'undefined') {
        // Advanced export with chart capture
        window.print();
    } else {
        // Simple print dialog
        window.print();
    }
}

function saveCase() { const name = document.getElementById('caseName').value; if(!name) return; const data = { config: { kw: document.getElementById('mKW').value, flc: document.getElementById('mFLC').value, rpm: document.getElementById('mRPM').value, poles: document.getElementById('mPoles').value, freq: document.getElementById('mFreq').value, motorJ: document.getElementById('motorJ').value, loadJ: document.getElementById('loadJ').value, stall: document.getElementById('hStall').value, ssInitialI: document.getElementById('ssInitialI').value, ssFinalI: document.getElementById('ssFinalI').value, ssRampTime: document.getElementById('ssRampTime').value }, table: { mt: [...document.querySelectorAll('.val-mt')].map(e => e.value), mc: [...document.querySelectorAll('.val-mc')].map(e => e.value), lt: [...document.querySelectorAll('.val-lt')].map(e => e.value) } }; localStorage.setItem('case_' + name, JSON.stringify(data)); loadCaseList(); alert('Saved!'); }
function loadCaseList() { const dropdown = document.getElementById('caseDropdown'); dropdown.innerHTML = '<option value="">-- Select Saved Case --</option>'; Object.keys(localStorage).forEach(key => { if(key.startsWith('case_')) dropdown.innerHTML += `<option value="${key}">${key.replace('case_', '')}</option>`; }); }
function loadCase(e) { const data = JSON.parse(localStorage.getItem(e.target.value)); if(!data) return; document.getElementById('mKW').value = data.config.kw; document.getElementById('mFLC').value = data.config.flc; document.getElementById('mRPM').value = data.config.rpm; document.getElementById('mPoles').value = data.config.poles || 4; document.getElementById('mFreq').value = data.config.freq || 50; document.getElementById('motorJ').value = data.config.motorJ || 0; document.getElementById('loadJ').value = data.config.loadJ || 0; document.getElementById('hStall').value = data.config.stall; if (data.config.ssInitialI) document.getElementById('ssInitialI').value = data.config.ssInitialI; if (data.config.ssFinalI) document.getElementById('ssFinalI').value = data.config.ssFinalI; if (data.config.ssRampTime) document.getElementById('ssRampTime').value = data.config.ssRampTime; const mts = document.querySelectorAll('.val-mt'), mcs = document.querySelectorAll('.val-mc'), lts = document.querySelectorAll('.val-lt'); data.table.mt.forEach((v, i) => mts[i].value = v); data.table.mc.forEach((v, i) => mcs[i].value = v); data.table.lt.forEach((v, i) => lts[i].value = v); updateHeader(); updateCombinedJ(); window.splineCache = {}; }
function clearLibrary() { if(confirm("Wipe all saved cases?")) { Object.keys(localStorage).forEach(key => { if(key.startsWith('case_')) localStorage.removeItem(key); }); loadCaseList(); } }
window.onload = init;
