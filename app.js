/* MotorStart Pro v3.1 Engine */

// Curve Data Points (0-100% speed)
const SPEEDS = [0,10,20,30,40,50,60,70,80,90,95,98,100];
const PRESETS = {
    motor: {
        oem: [160,165,175,185,200,220,240,260,280,240,180,100,0],
        highSlip: [260,250,240,235,230,235,245,260,270,240,190,120,0]
    },
    current: {
        oem: [600,590,580,570,560,545,520,480,420,320,220,120,10],
        highSlip: [650,640,630,620,610,600,580,550,500,400,280,150,10]
    },
    load: {
        centrifugal: [10,12,15,20,28,38,50,65,82,92,96,98,100],
        constant: [90,90,90,90,90,90,90,90,90,90,90,90,90]
    }
};

let chartInstance = null;
let currentMode = 'DOL';

// --- Initialization ---
function init() {
    setupUI();
    // Check if Chart.js is loaded
    if(typeof Chart !== 'undefined') {
        Chart.register(window['chartjs-plugin-annotation']);
        runSimulation(); // Initial run
    } else {
        setTimeout(init, 500); // Retry loop
    }
}

function setupUI() {
    // Mode Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            document.getElementById('ssPanel').style.display = currentMode === 'SS' ? 'block' : 'none';
        };
    });

    // Auto-sum Inertia
    const updateJ = () => {
        const m = parseFloat(document.getElementById('motorJ').value) || 0;
        const l = parseFloat(document.getElementById('loadJ').value) || 0;
        document.getElementById('totalJ').innerText = (m + l).toFixed(2);
    };
    document.getElementById('motorJ').oninput = updateJ;
    document.getElementById('loadJ').oninput = updateJ;

    document.getElementById('btnSimulate').onclick = runSimulation;
    document.getElementById('btnPDF').onclick = () => {
        document.getElementById('printDate').innerText = new Date().toLocaleString();
        window.print();
    };
}

// --- Physics Engine ---
function interpolate(x, xPoints, yPoints) {
    if(x <= xPoints[0]) return yPoints[0];
    if(x >= xPoints[xPoints.length-1]) return yPoints[yPoints.length-1];
    const i = xPoints.findIndex(p => p >= x);
    const x0 = xPoints[i-1], x1 = xPoints[i];
    const y0 = yPoints[i-1], y1 = yPoints[i];
    return y0 + (x - x0)*(y1 - y0)/(x1 - x0);
}

function runSimulation() {
    const P = parseFloat(document.getElementById('mKW').value);
    const RPM = parseFloat(document.getElementById('mRPM').value);
    const I_rated = parseFloat(document.getElementById('mFLC').value);
    const J_total = parseFloat(document.getElementById('totalJ').innerText);
    const stallTime = parseFloat(document.getElementById('hStall').value);

    // Get Curve Data from Presets
    const mType = document.getElementById('motorPreset').value;
    const lType = document.getElementById('loadPreset').value;
    const tCurve = PRESETS.motor[mType];
    const cCurve = PRESETS.current[mType]; // Current vs Speed curve
    const lCurve = PRESETS.load[lType];

    // Simulation Arrays
    let labels = [], dataT = [], dataL = [], dataI = [];
    let time = 0, thermalSum = 0, stallIdx = null;
    let minStartI = 0;

    // Time Step Loop (0-100% Speed)
    for(let i=0; i<=100; i++) {
        let n = i; // Speed %
        let Tm = interpolate(n, SPEEDS, tCurve);
        let Tl = interpolate(n, SPEEDS, lCurve);
        let Im_raw = interpolate(n, SPEEDS, cCurve);
        
        // Soft Start Logic
        let v_applied = 1.0;
        if(currentMode === 'SS') {
            const initI = parseFloat(document.getElementById('ssInitI').value)/100;
            const limitI = parseFloat(document.getElementById('ssLimit').value)/100;
            const rampT = parseFloat(document.getElementById('ssRamp').value);
            
            // Simplified Ramp Logic: Current increases from Init to Limit based on speed/time proxy
            // In a real starter, voltage is throttled. V_ratio = I_limit / I_dol
            let i_target = initI + (limitI - initI) * (n/90); 
            if(i_target > limitI) i_target = limitI;
            
            // Calculate Voltage required to achieve this current
            let v_req = i_target / (Im_raw/100); 
            if(v_req > 1.0) v_req = 1.0;
            v_applied = v_req;
        }

        // Apply V^2 law to Torque, Linear to Current
        let Tm_act = Tm * Math.pow(v_applied, 2);
        let Im_act = Im_raw * v_applied;

        // Min Current Check
        let v_min = Math.sqrt((Tl+5)/Tm); // +5% safety margin
        let i_min_needed = (Im_raw * v_min);
        if(i_min_needed > minStartI) minStartI = i_min_needed;

        // Integration
        let accT = Tm_act - Tl;
        if(accT > 1 && n < 98) {
            // dt = J * dw / T
            // dw for 1% speed = (RPM * 2PI / 60) * 0.01
            let dw = (RPM * 2 * Math.PI / 60) * 0.01;
            let TorqueNm = (accT/100) * (P * 9550 / RPM);
            let dt = (J_total * dw) / TorqueNm;
            
            time += dt;
            // Thermal I^2*t
            let i_abs = (Im_act/100) * I_rated;
            thermalSum += Math.pow(i_abs, 2) * dt;
        } else if (accT <= 1 && stallIdx === null && i > 5) {
            stallIdx = i;
        }

        labels.push(n);
        dataT.push(Tm_act.toFixed(1));
        dataL.push(Tl.toFixed(1));
        dataI.push(Im_act.toFixed(0));
    }

    // Results Update
    document.getElementById('resTime').innerText = stallIdx ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('resNet').innerText = stallIdx ? "NEG" : "OK";
    
    let thermCap = (thermalSum / (Math.pow((cCurve[0]/100)*I_rated, 2) * stallTime)) * 100;
    document.getElementById('resTherm').innerText = thermCap.toFixed(1) + "%";
    document.getElementById('resMinI').innerText = Math.round(minStartI) + "%";

    // Update Chart
    drawChart(labels, dataT, dataL, dataI, stallIdx);
}

function drawChart(labels, t, l, i, stall) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    if(chartInstance) chartInstance.destroy();

    const colorT = currentMode === 'SS' ? '#10b981' : '#38bdf8'; // Green for SS, Blue for DOL

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque %', data: t, borderColor: colorT, borderWidth: 3, pointRadius: 0 },
                { label: 'Load Torque %', data: l, borderColor: '#f43f5e', borderDash: [5,5], borderWidth: 2, pointRadius: 0 },
                { label: 'Current %', data: i, borderColor: '#f59e0b', borderWidth: 2, yAxisID: 'y1', pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top', // Legend inside chart area logic
                    align: 'end',
                    labels: { color: '#333', boxWidth: 12, font: {size: 11} }
                },
                annotation: {
                    annotations: stall ? {
                        line1: {
                            type: 'line', xMin: stall, xMax: stall, borderColor: 'red', borderWidth: 2,
                            label: { display: true, content: 'STALL', position: 'start', backgroundColor: 'red' }
                        }
                    } : {}
                }
            },
            scales: {
                x: { title: {display:true, text:'Speed (%)'}, grid: {color: '#e5e7eb'} },
                y: { min: 0, title: {display:true, text:'Torque %'}, grid: {color: '#e5e7eb'} },
                y1: { position: 'right', min: 0, grid: {drawOnChartArea: false}, title: {display:true, text:'Current %'} }
            }
        }
    });
}

// Start
window.onload = init;