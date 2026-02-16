// Motor Starter Simulator v3.0 Final - Production Grade
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
    document.getElementById('btnSolveTime').onclick = solveForCurrent;
    document.getElementById('btnSaveCase').onclick = saveCase;
    document.getElementById('btnClearCases').onclick = clearLibrary;
    document.getElementById('btnExportPDF').onclick = exportToPDF;
    document.getElementById('caseDropdown').onchange = loadCase;
    document.getElementById('thermalToggle')?.addEventListener('click', toggleThermal);
    
    document.getElementById('modeDOL')?.addEventListener('click', () => setMode('DOL'));
    document.getElementById('modeSS')?.addEventListener('click', () => setMode('SS'));
    
    // Update combined inertia when motor or load inertia changes
    document.getElementById('motorJ')?.addEventListener('input', updateCombinedJ);
    document.getElementById('loadJ')?.addEventListener('input', updateCombinedJ);

    loadCaseList();
    updateHeader();
    updateCombinedJ();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

function updateCombinedJ() {
    const motorJ = parseFloat(document.getElementById('motorJ')?.value) || 0;
    const loadJ = parseFloat(document.getElementById('loadJ')?.value) || 0;
    const total = motorJ + loadJ;
    document.getElementById('totalJ').innerText = total.toFixed(2);
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
    
    // Update display if we have results
    if (lastSimResults) {
        displayResults(lastSimResults);
    }
}

function applyPreset(type, key) {
    if (key === 'current') return;
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
    
    const torque = ((kw * 9550) / rpm).toFixed(1);
    const ns = (120 * freq) / poles;
    
    document.getElementById('resFLT').innerText = torque;
    document.getElementById('resSyncSpeed').innerText = ns.toFixed(0);
}

function interpolate(x, xArr, yArr) {
    if (x <= xArr[0]) return parseFloat(yArr[0]);
    if (x >= xArr[xArr.length - 1]) return parseFloat(yArr[yArr.length - 1]);
    let i = xArr.findIndex(val => val >= x);
    let x0 = xArr[i-1], x1 = xArr[i], y0 = parseFloat(yArr[i-1]), y1 = parseFloat(yArr[i]);
    return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

function calculateMinStartingCurrent(tableMt, tableMc, tableLt) {
    const SAFETY_MARGIN = 2.0;
    
    for (let testCurrent = 200; testCurrent <= 700; testCurrent += 2) {
        let minNetTorque = 999;
        let criticalSpeedPoint = 0;
        let stallDetected = false;
        
        for (let i = 0; i < S_POINTS.length; i++) {
            let speedPercent = S_POINTS[i];
            if (speedPercent >= 95) continue;
            
            let motorTorqueFull = parseFloat(tableMt[i]);
            let motorCurrentFull = parseFloat(tableMc[i]);
            let loadTorque = parseFloat(tableLt[i]);
            
            let voltageRatio = Math.min(1.0, testCurrent / motorCurrentFull);
            let motorTorqueReduced = motorTorqueFull * voltageRatio * voltageRatio;
            let netTorque = motorTorqueReduced - loadTorque;
            
            if (netTorque < minNetTorque) {
                minNetTorque = netTorque;
                criticalSpeedPoint = speedPercent;
            }
            
            if (netTorque < 0) {
                stallDetected = true;
                break;
            }
        }
        
        if (!stallDetected && minNetTorque >= SAFETY_MARGIN) {
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
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const hStall = parseFloat(document.getElementById('hStall').value);
    const freq = parseFloat(document.getElementById('mFreq').value) || 50;
    const poles = parseFloat(document.getElementById('mPoles').value) || 4;
    
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);
    
    const ns = (120 * freq) / poles;
    const lockedRotorCurrent = parseFloat(tableMc[0]);
    const lockedRotorCurrentAmps = (lockedRotorCurrent / 100) * mFLC;
    
    // Handle edge cases
    if (mode === 'SS') {
        if (ssInitialI === ssFinalI || ssRampTime === 0 || !ssRampTime) {
            ssRampTime = 0;
            ssFinalI = ssInitialI;
        }
    }

    let time = 0, speedPerc = 0, thermal = 0, thermalAbsRaw = 0;
    let minNet = 999, criticalNetSpeed = 0;
    let isStalled = false, stallSpd = null, stallReason = "";
    const dt = 0.01, targetRadS = (mRPM * 2 * Math.PI) / 60;
    let speedRadS = 0;
    let lastSpeedCheck = 0, lastSpeedValue = 0;
    let rampEndSpeed = 0;

    while (time < 60) {
        let rMt = interpolate(speedPerc, S_POINTS, tableMt);
        let rMc = interpolate(speedPerc, S_POINTS, tableMc);
        let cLt = interpolate(speedPerc, S_POINTS, tableLt);
        
        let aMt = rMt, aMc = rMc;
        
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
            
            let vr = Math.min(1, currentLimit / rMc);
            aMt = rMt * (vr * vr);
            aMc = rMc * vr;
        }
        
        let net = aMt - cLt;
        
        if (speedPerc < 95 && net < minNet) {
            minNet = net;
            criticalNetSpeed = speedPerc;
        }
        
        if (speedPerc < 90 && !isStalled) {
            if (net < -0.5) {
                isStalled = true;
                stallReason = "Mechanical Stall";
                stallSpd = speedPerc;
            } else if (thermal >= 100) {
                isStalled = true;
                stallReason = "Thermal Limit";
                stallSpd = speedPerc;
            } else if (time - lastSpeedCheck >= 2.0) {
                if (Math.abs(speedPerc - lastSpeedValue) < 1.0 && time > 2.0) {
                    isStalled = true;
                    stallReason = "Hung Start";
                    stallSpd = speedPerc;
                }
                lastSpeedCheck = time;
                lastSpeedValue = speedPerc;
            }
        }
        
        if (isStalled) break;
        
        if (speedPerc < 98.5) {
            let alpha = (net / 100) * fltNm / totalJ;
            speedRadS += alpha * dt;
            speedPerc = (speedRadS / targetRadS) * 100;
            
            // Thermal calculation - FIXED
            // Absolute: ∫ I² dt in A²·s
            let actualCurrent = (aMc / 100) * mFLC;  // Amperes
            thermalAbsRaw += actualCurrent * actualCurrent * dt;  // A²·s
            
            // Percentage: relative to locked rotor thermal limit
            let thermalLimit = lockedRotorCurrentAmps * lockedRotorCurrentAmps * hStall;
            thermal = (thermalAbsRaw / thermalLimit) * 100;
        }
        
        time += dt;
        if (speedPerc >= 99) break;
    }
    
    if (returnData) {
        return {
            time: time,
            isStalled: isStalled,
            stallReason: stallReason,
            thermal: thermal,
            thermalAbs: thermalAbsRaw,
            minNet: minNet,
            criticalNetSpeed: criticalNetSpeed,
            finalSlip: 1 - (speedPerc / 100),
            ns: ns,
            stallSpd: stallSpd,
            rampEndSpeed: rampEndSpeed
        };
    }
    
    return { time, isStalled, stallReason };
}

function runSimulation() {
    updateHeader();
    
    const mFLC = parseFloat(document.getElementById('mFLC').value);
    const fltNm = parseFloat(document.getElementById('resFLT').innerText);
    const tableMt = [...document.querySelectorAll('.val-mt')].map(e => e.value);
    const tableMc = [...document.querySelectorAll('.val-mc')].map(e => e.value);
    const tableLt = [...document.querySelectorAll('.val-lt')].map(e => e.value);
    const freq = parseFloat(document.getElementById('mFreq').value) || 50;
    const poles = parseFloat(document.getElementById('mPoles').value) || 4;
    const ns = (120 * freq) / poles;

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
    
    // Generate 500-point curves for smooth but fast plotting
    let lbls = Array.from({length: 501}, (_, i) => i * 0.2);
    let dolMt = [], dolMc = [], pLt = [], ssMt = [], ssMc = [];
    
    lbls.forEach(s => {
        let rm = interpolate(s, S_POINTS, tableMt);
        let rc = interpolate(s, S_POINTS, tableMc);
        let rl = interpolate(s, S_POINTS, tableLt);
        
        pLt.push(rl);
        dolMt.push(rm);
        dolMc.push(rc);
        
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
    
    renderChart(lbls, dolMt, dolMc, ssMt, ssMc, pLt, results.stallSpd, minStartResult.criticalSpeed, results.rampEndSpeed, mFLC, fltNm);
}

function displayResults(results) {
    const finalSlip = results.finalSlip.toFixed(3);
    
    document.getElementById('resultTime').innerText = results.isStalled ? `STALL (${results.stallReason})` : results.time.toFixed(2) + "s";
    
    if (thermalMode === 'absolute') {
        document.getElementById('resultTherm').innerText = results.thermalAbs.toFixed(0) + " A²·s";
    } else {
        document.getElementById('resultTherm').innerText = results.thermal.toFixed(1) + "%";
    }
    
    const minNetAbs = (results.minNet * results.fltNm / 100).toFixed(1);
    const criticalSlip = (1 - (results.criticalNetSpeed / 100)).toFixed(3);
    document.getElementById('resultNet').innerText = `${results.minNet.toFixed(1)}% (${minNetAbs} Nm) @ ${results.criticalNetSpeed.toFixed(0)}%spd (slip ${criticalSlip})`;
    
    if (simulationMode === 'SS') {
        const minStartAbs = (results.minStartResult.current * results.mFLC / 100).toFixed(1);
        document.getElementById('resultMinI').innerText = `${results.minStartResult.current.toFixed(0)}% (${minStartAbs}A) @ ${results.minStartResult.criticalSpeed}%spd`;
    } else {
        document.getElementById('resultMinI').innerText = 'N/A (DOL mode)';
    }
    
    document.getElementById('resultFinalSlip').innerText = finalSlip;
    document.getElementById('resultSyncSpeed').innerText = results.ns.toFixed(0) + " RPM";
}

function renderChart(labels, dolMt, dolMc, ssMt, ssMc, pLt, stallSpd, criticalSpeed, rampEndSpeed, mFLC, fltNm) {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    if (chart) chart.destroy();
    
    const dolIsSolid = (simulationMode === 'DOL');
    
    let datasets = [
        { 
            label: 'Motor Torque % (DOL)', 
            data: dolMt, 
            borderColor: '#22d3ee', 
            borderWidth: dolIsSolid ? 3 : 1, 
            borderDash: dolIsSolid ? [] : [5, 5],
            pointRadius: 0, 
            tension: 0.3,
            yAxisID: 'y'
        },
        { 
            label: 'Load Torque %', 
            data: pLt, 
            borderColor: '#f43f5e', 
            borderDash: [5,5], 
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y'
        },
        { 
            label: 'Motor Current % (DOL)', 
            data: dolMc, 
            borderColor: '#fbbf24', 
            borderWidth: dolIsSolid ? 2 : 1, 
            borderDash: dolIsSolid ? [] : [5, 5],
            yAxisID: 'y1', 
            pointRadius: 0
        }
    ];
    
    if (simulationMode === 'SS') {
        datasets.push({ 
            label: 'Motor Torque % (Soft Start)', 
            data: ssMt, 
            borderColor: '#10b981', 
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.3,
            yAxisID: 'y'
        });
        
        datasets.push({ 
            label: 'Motor Current % (Soft Start)', 
            data: ssMc, 
            borderColor: '#f59e0b', 
            borderWidth: 3,
            pointRadius: 0,
            yAxisID: 'y1'
        });
        
        if (criticalSpeed > 0) {
            datasets.push({
                label: 'Critical Speed',
                data: [{x: criticalSpeed, y: interpolate(criticalSpeed, labels, ssMt)}],
                pointStyle: 'triangle',
                pointRadius: 12,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                showLine: false,
                yAxisID: 'y'
            });
        }
    }
    
    if (stallSpd !== null) {
        datasets.push({ 
            label: 'STALL', 
            data: [{x: stallSpd, y: interpolate(stallSpd, labels, simulationMode === 'SS' ? ssMt : dolMt)}], 
            pointStyle: 'crossRot', 
            pointRadius: 15, 
            pointBackgroundColor: '#ff0000',
            pointBorderColor: '#fff', 
            pointBorderWidth: 3, 
            showLine: false,
            yAxisID: 'y'
        });
    }
    
    chart = new Chart(ctx, { 
        type: 'line', 
        data: { labels, datasets }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
                x: {
                    title: {display:true, text:'Motor Speed (%)', font: {size: 14, weight: 'bold'}},
                    grid: {color: 'rgba(255,255,255,0.1)'}
                }, 
                y: {
                    min:0, 
                    title: {display:true, text:'Torque (%)', font: {size: 14, weight: 'bold'}},
                    grid: {color: 'rgba(255,255,255,0.1)'},
                    position: 'left'
                }, 
                y1: {
                    position:'right', 
                    min:0, 
                    grid: {drawOnChartArea: false}, 
                    title: {display:true, text:'Current (%)', font: {size: 14, weight: 'bold'}}
                } 
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#fff',
                        font: {size: 11},
                        boxWidth: 25,
                        padding: 10,
                        filter: (item) => !item.text.includes('Critical') && !item.text.includes('STALL')
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            label += context.parsed.y.toFixed(1) + '%';
                            
                            if (label.includes('Current')) {
                                const absVal = (context.parsed.y * mFLC / 100).toFixed(1);
                                label += ` (${absVal}A)`;
                            } else if (label.includes('Torque')) {
                                const absVal = (context.parsed.y * fltNm / 100).toFixed(1);
                                label += ` (${absVal} Nm)`;
                            }
                            
                            const slip = (1 - context.parsed.x / 100).toFixed(3);
                            label += ` | Slip: ${slip}`;
                            
                            return label;
                        }
                    }
                }
            }
        } 
    });
}

function solveForCurrent() {
    const targetTime = parseFloat(document.getElementById('targetTime').value);
    if (!targetTime || targetTime <= 0) {
        alert('Please enter a valid target start time');
        return;
    }
    
    setMode('SS');
    document.getElementById('solverStatus').innerText = 'Calculating...';
    
    const ssRampTime = parseFloat(document.getElementById('ssRampTime')?.value) || 0;
    
    let low = 200, high = 700;
    let iterations = 0;
    let bestCurrent = 0;
    let bestTime = 0;
    
    // Binary search with actual simulation
    while (high - low > 2 && iterations < 20) {
        let mid = Math.floor((low + high) / 2);
        
        let result = runSimulationCore('SS', mid, mid, ssRampTime, true);
        
        if (result.isStalled || result.time > targetTime) {
            low = mid;
        } else {
            high = mid;
            bestCurrent = mid;
            bestTime = result.time;
        }
        
        iterations++;
    }
    
    // Set the found current and run full simulation
    document.getElementById('ssInitialI').value = bestCurrent;
    document.getElementById('ssFinalI').value = bestCurrent;
    runSimulation();
    
    document.getElementById('solverStatus').innerText = `Found: ${bestCurrent}% current → ${bestTime.toFixed(2)}s start time (Target: ${targetTime}s)`;
}

function exportToPDF() {
    window.print();
}

function saveCase() {
    const name = document.getElementById('caseName').value;
    if(!name) return;
    
    const motorJ = document.getElementById('motorJ')?.value || 0;
    const loadJ = document.getElementById('loadJ')?.value || 0;
    
    const data = {
        config: { 
            kw: document.getElementById('mKW').value, 
            flc: document.getElementById('mFLC').value, 
            rpm: document.getElementById('mRPM').value,
            poles: document.getElementById('mPoles').value,
            freq: document.getElementById('mFreq').value,
            motorJ: motorJ,
            loadJ: loadJ,
            stall: document.getElementById('hStall').value,
            ssInitialI: document.getElementById('ssInitialI').value,
            ssFinalI: document.getElementById('ssFinalI').value,
            ssRampTime: document.getElementById('ssRampTime').value
        },
        table: { 
            mt: [...document.querySelectorAll('.val-mt')].map(e => e.value), 
            mc: [...document.querySelectorAll('.val-mc')].map(e => e.value), 
            lt: [...document.querySelectorAll('.val-lt')].map(e => e.value) 
        }
    };
    localStorage.setItem('case_' + name, JSON.stringify(data));
    loadCaseList();
    alert('Case saved!');
}

function loadCaseList() {
    const dropdown = document.getElementById('caseDropdown');
    dropdown.innerHTML = '<option value="">-- Select Saved Case --</option>';
    Object.keys(localStorage).forEach(key => {
        if(key.startsWith('case_')) dropdown.innerHTML += `<option value="${key}">${key.replace('case_', '')}</option>`;
    });
}

function loadCase(e) {
    const data = JSON.parse(localStorage.getItem(e.target.value));
    if(!data) return;
    
    document.getElementById('mKW').value = data.config.kw;
    document.getElementById('mFLC').value = data.config.flc;
    document.getElementById('mRPM').value = data.config.rpm;
    document.getElementById('mPoles').value = data.config.poles || 4;
    document.getElementById('mFreq').value = data.config.freq || 50;
    document.getElementById('motorJ').value = data.config.motorJ || 0;
    document.getElementById('loadJ').value = data.config.loadJ || 0;
    document.getElementById('hStall').value = data.config.stall;
    
    if (data.config.ssInitialI) document.getElementById('ssInitialI').value = data.config.ssInitialI;
    if (data.config.ssFinalI) document.getElementById('ssFinalI').value = data.config.ssFinalI;
    if (data.config.ssRampTime) document.getElementById('ssRampTime').value = data.config.ssRampTime;
    
    const mts = document.querySelectorAll('.val-mt'), mcs = document.querySelectorAll('.val-mc'), lts = document.querySelectorAll('.val-lt');
    data.table.mt.forEach((v, i) => mts[i].value = v);
    data.table.mc.forEach((v, i) => mcs[i].value = v);
    data.table.lt.forEach((v, i) => lts[i].value = v);
    updateHeader();
    updateCombinedJ();
}

function clearLibrary() {
    if(confirm("Wipe all saved cases?")) {
        Object.keys(localStorage).forEach(key => { 
            if(key.startsWith('case_')) localStorage.removeItem(key); 
        });
        loadCaseList();
    }
}

window.onload = init;
