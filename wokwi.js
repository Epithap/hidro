// ==================================================================================
// SKADUTA WOKWI IoT LAB JAVASCRIPT ENGINE
// ESP32 Simulation Deck, Multi-Sensor Telemetry & 4-Lamp Firebase Bridge
// ==================================================================================

const firebaseConfig = {
  apiKey: "AIzaSyDRtm0CGH0Whia-odsOpk6o0nJlT8gJi9I",
  authDomain: "smart-agriculture-316d0.firebaseapp.com",
  databaseURL: "https://smart-agriculture-316d0-default-rtdb.firebaseio.com",
  projectId: "smart-agriculture-316d0",
  storageBucket: "smart-agriculture-316d0.firebasestorage.app",
  messagingSenderId: "417867548109",
  appId: "1:417867548109:web:67913b243a1efa66b4f084",
  measurementId: "G-Y78H2E5CHH"
};

// Inisialisasi Firebase Compat SDK
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
}
const database = (typeof firebase !== 'undefined' && firebase.database) ? firebase.database() : null;

// State Lampu
const lampState = {
  lampu1: false,
  lampu2: false,
  lampu3: false,
  lampu4: false
};

const lampColorClass = {
  lampu1: 'active-red',
  lampu2: 'active-yellow',
  lampu3: 'active-green',
  lampu4: 'active-blue'
};

// State Sensor
const sensorState = {
  suhu: 28.5,
  kelembaban: 65.0,
  jarak: 48.2,
  cahaya: 72,
  gerak: false
};

// --- Terminal Logger ---
const terminal = document.getElementById('terminal-logs');
function logWokwiEvent(tag, message, level = 'info') {
  if (!terminal) return;
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const line = document.createElement('div');
  line.className = `terminal-line ${level}`;
  line.innerHTML = `
    <span class="t-stamp">[${timeStr}]</span>
    <span class="t-tag">[${tag}]</span>
    <span>${message}</span>
  `;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
  while (terminal.children.length > 40) {
    terminal.removeChild(terminal.firstChild);
  }
}

// --- Toast Popup ---
function showToast(message) {
  const toast = document.getElementById('toast-msg');
  const toastText = document.getElementById('toast-text');
  if (toast && toastText) {
    toastText.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
}

// --- Realtime Clock ---
function updateClock() {
  const clockElem = document.getElementById('clock-display');
  if (clockElem) {
    clockElem.innerText = new Date().toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
  }
}
setInterval(updateClock, 1000);
updateClock();

// --- Chart.js Setup ---
let wokwiChart = null;
const chartCanvas = document.getElementById('wokwiSensorChart');
if (chartCanvas) {
  const ctx = chartCanvas.getContext('2d');
  wokwiChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Suhu (°C)',
          data: [],
          borderColor: '#ffb830',
          backgroundColor: 'rgba(255, 184, 48, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          yAxisID: 'yTemp'
        },
        {
          label: 'Kelembaban (%)',
          data: [],
          borderColor: '#00e5ff',
          backgroundColor: 'rgba(0, 229, 255, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          yAxisID: 'yHum'
        },
        {
          label: 'Jarak (cm)',
          data: [],
          borderColor: '#00f5a0',
          borderWidth: 2,
          tension: 0.35,
          yAxisID: 'yDist'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#88a0b8', font: { size: 11 } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#687e95', font: { family: 'JetBrains Mono', size: 10 } }
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          min: 15,
          max: 45,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#ffb830', font: { family: 'JetBrains Mono', size: 10 } }
        },
        yHum: {
          type: 'linear',
          position: 'right',
          min: 20,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: '#00e5ff', font: { family: 'JetBrains Mono', size: 10 } }
        },
        yDist: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 150,
          grid: { drawOnChartArea: false },
          ticks: { color: '#00f5a0', font: { family: 'JetBrains Mono', size: 10 } }
        }
      }
    }
  });
}

// --- Lamp Control Engine ---
window.toggleWokwiLamp = function (lampId, isChecked) {
  lampState[lampId] = isChecked;
  const num = lampId.replace('lampu', '');
  const card = document.getElementById('lamp-card-' + num);
  const statusLabel = document.getElementById(lampId + '-status');

  if (card) {
    const cls = lampColorClass[lampId];
    card.classList.toggle(cls, isChecked);
  }
  if (statusLabel) {
    statusLabel.innerText = isChecked ? 'AKTIF (ON)' : 'OFF';
    statusLabel.style.color = isChecked ? '#fff' : 'var(--text-muted)';
  }

  logWokwiEvent('AKTUATOR', `${lampId.toUpperCase()} disetel ke => ${isChecked ? 'ON (MENYALA)' : 'OFF (PADAM)'}`, isChecked ? 'success' : 'warning');

  // Push ke Firebase Realtime Database
  if (database) {
    const updates = {};
    updates['wokwi_iot/lamps/' + lampId] = isChecked;
    // Map ke relay standar untuk interoperabilitas
    const relayMap = { lampu1: 'relay1', lampu2: 'relay2', lampu3: 'relay3', lampu4: 'relay4' };
    const rId = relayMap[lampId];
    if (rId) {
      updates['agriculture_iot/relays/' + rId] = isChecked;
      updates['relays/' + rId] = isChecked;
    }

    database.ref().update(updates)
      .then(() => logWokwiEvent('SYNC', `Sinkronisasi Firebase sukses untuk ${lampId}`, 'info'))
      .catch((err) => logWokwiEvent('ERROR', `Gagal sync Firebase: ${err.message}`, 'danger'));
  }
};

window.setAllLamps = function (state) {
  for (let i = 1; i <= 4; i++) {
    const lId = 'lampu' + i;
    const toggle = document.getElementById(lId);
    if (toggle) toggle.checked = state;
    window.toggleWokwiLamp(lId, state);
  }
};

window.triggerTimedLamp = function (lampId, seconds) {
  window.toggleWokwiLamp(lampId, true);
  const toggle = document.getElementById(lampId);
  if (toggle) toggle.checked = true;
  showToast(`⏱️ ${lampId.toUpperCase()} dinyalakan selama ${seconds} detik.`);

  setTimeout(() => {
    window.toggleWokwiLamp(lampId, false);
    if (toggle) toggle.checked = false;
    showToast(`⏱️ ${lampId.toUpperCase()} otomatis dimatikan.`);
  }, seconds * 1000);
};

// --- Telemetry Display Updater ---
function updateSensorUI(data) {
  if (!data) return;
  const timeStr = new Date().toLocaleTimeString('id-ID', { hour12: false });

  // Suhu
  if (data.suhu !== undefined) {
    sensorState.suhu = parseFloat(data.suhu);
    const elem = document.getElementById('suhu-val');
    const badge = document.getElementById('suhu-badge');
    if (elem) elem.innerText = sensorState.suhu.toFixed(1) + ' °C';
    if (badge) {
      if (sensorState.suhu > 32) {
        badge.innerText = 'PANAS';
        badge.className = 'badge-pill badge-danger';
      } else if (sensorState.suhu < 20) {
        badge.innerText = 'DINGIN';
        badge.className = 'badge-pill badge-warning';
      } else {
        badge.innerText = 'NORMAL';
        badge.className = 'badge-pill badge-optimal';
      }
    }
  }

  // Kelembaban
  if (data.kelembaban !== undefined) {
    sensorState.kelembaban = parseFloat(data.kelembaban);
    const elem = document.getElementById('hum-val');
    if (elem) elem.innerText = sensorState.kelembaban.toFixed(1) + ' %';
  }

  // Jarak
  if (data.jarak !== undefined) {
    sensorState.jarak = parseFloat(data.jarak);
    const elem = document.getElementById('sonar-val');
    const badge = document.getElementById('sonar-badge');
    if (elem) elem.innerText = sensorState.jarak.toFixed(1) + ' cm';
    if (badge) {
      if (sensorState.jarak < 15) {
        badge.innerText = 'DEKAT';
        badge.style.color = '#ff4444';
        badge.style.background = 'rgba(255, 68, 68, 0.2)';
      } else {
        badge.innerText = 'AMAN';
        badge.style.color = '#00f5a0';
        badge.style.background = 'rgba(0, 245, 160, 0.15)';
      }
    }
  }

  // Cahaya LDR
  if (data.cahaya !== undefined) {
    sensorState.cahaya = parseInt(data.cahaya, 10);
    const elem = document.getElementById('ldr-val');
    const badge = document.getElementById('ldr-badge');
    if (elem) elem.innerText = sensorState.cahaya + ' %';
    if (badge) {
      badge.innerText = sensorState.cahaya > 40 ? 'TERANG' : 'GELAP';
    }
  }

  // PIR Gerak
  if (data.gerak !== undefined) {
    sensorState.gerak = Boolean(data.gerak);
    const elem = document.getElementById('pir-val');
    const badge = document.getElementById('pir-badge');
    if (elem) {
      elem.innerText = sensorState.gerak ? 'GERAKAN AKTIF' : 'TIDAK ADA';
      elem.style.color = sensorState.gerak ? '#ff4444' : '#b0c2d6';
    }
    if (badge) {
      badge.innerText = sensorState.gerak ? 'TERDETEKSI' : 'STANDBY';
      badge.style.color = sensorState.gerak ? '#ff4444' : '#b0c2d6';
      badge.style.background = sensorState.gerak ? 'rgba(255, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)';
    }
  }

  // Update Chart
  if (wokwiChart) {
    wokwiChart.data.labels.push(timeStr);
    wokwiChart.data.datasets[0].data.push(sensorState.suhu);
    wokwiChart.data.datasets[1].data.push(sensorState.kelembaban);
    wokwiChart.data.datasets[2].data.push(sensorState.jarak);

    if (wokwiChart.data.labels.length > 12) {
      wokwiChart.data.labels.shift();
      wokwiChart.data.datasets[0].data.shift();
      wokwiChart.data.datasets[1].data.shift();
      wokwiChart.data.datasets[2].data.shift();
    }
    wokwiChart.update();
  }
}

// --- Random Sensor Reading Simulator ---
window.simulateRandomSensorReadings = function () {
  const simulated = {
    suhu: (26.0 + Math.random() * 5.0).toFixed(1),
    kelembaban: (60.0 + Math.random() * 18.0).toFixed(1),
    jarak: (20.0 + Math.random() * 60.0).toFixed(1),
    cahaya: Math.round(35 + Math.random() * 55),
    gerak: Math.random() > 0.65
  };

  updateSensorUI(simulated);
  logWokwiEvent('SIMULASI', `Simulasi sensor: Suhu=${simulated.suhu}°C | Jarak=${simulated.jarak}cm | Gerak=${simulated.gerak}`, 'info');
  showToast("🎲 Data simulasi sensor berhasil diinjeksikan!");

  if (database) {
    database.ref('wokwi_iot/sensors').update(simulated);
  }
};

// --- Firebase Listeners ---
if (database) {
  // 1. Connection Monitor
  database.ref('.info/connected').on('value', (snap) => {
    const isOnline = snap.val() === true;
    const statusElem = document.getElementById('db-status');
    const badge = document.getElementById('telemetry-badge');
    if (isOnline) {
      if (statusElem) {
        statusElem.innerText = "STREAM ONLINE";
        statusElem.style.color = "#00f5a0";
      }
      if (badge) {
        badge.style.borderColor = "rgba(0, 245, 160, 0.4)";
        badge.style.background = "rgba(0, 245, 160, 0.08)";
      }
      logWokwiEvent('FIREBASE', 'Terhubung ke Google Realtime Database (Wokwi Bridge Ready)', 'success');
    } else {
      if (statusElem) {
        statusElem.innerText = "MENYAMBUNGKAN...";
        statusElem.style.color = "#ffb830";
      }
    }
  });

  // 2. Sensor Listener (/wokwi_iot/sensors)
  database.ref('wokwi_iot/sensors').on('value', (snap) => {
    const data = snap.val();
    if (data) {
      updateSensorUI(data);
      logWokwiEvent('DATA', `Paket Sensor ESP32 diterima: Suhu=${data.suhu || '-'}°C | Hum=${data.kelembaban || '-'}%`, 'info');
    }
  });

  // 3. Lamp Listener (/wokwi_iot/lamps)
  database.ref('wokwi_iot/lamps').on('value', (snap) => {
    const lamps = snap.val();
    if (lamps) {
      for (let i = 1; i <= 4; i++) {
        const lId = 'lampu' + i;
        if (lamps[lId] !== undefined) {
          const isOn = Boolean(lamps[lId]);
          const toggle = document.getElementById(lId);
          const card = document.getElementById('lamp-card-' + i);
          const statusLabel = document.getElementById(lId + '-status');
          if (toggle && toggle.checked !== isOn) toggle.checked = isOn;
          if (card) card.classList.toggle(lampColorClass[lId], isOn);
          if (statusLabel) {
            statusLabel.innerText = isOn ? 'AKTIF (ON)' : 'OFF';
            statusLabel.style.color = isOn ? '#fff' : 'var(--text-muted)';
          }
        }
      }
    }
  });
}

// --- One-Click Download & Clipboard Copy Features ---
window.downloadFile = function (filename, filepath) {
  fetch(filepath)
    .then(res => res.text())
    .then(content => {
      const blob = new Blob([content], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`📥 Berhasil mengunduh ${filename}!`);
      logWokwiEvent('EXPORT', `File ${filename} berhasil diunduh ke komputer pengguna`, 'success');
    })
    .catch(err => {
      console.error(err);
      showToast(`Gagal mengunduh ${filename}`);
    });
};

window.copyDiagramJson = function () {
  fetch('diagram.json')
    .then(res => res.text())
    .then(text => {
      navigator.clipboard.writeText(text).then(() => {
        showToast("📋 diagram.json berhasil disalin ke clipboard!");
        logWokwiEvent('CLIPBOARD', 'Isi diagram.json siap ditempel di tab diagram.json Wokwi', 'success');
      });
    })
    .catch(err => {
      // Fallback
      showToast("Gagal menyalin diagram.json");
    });
};

window.copySketchIno = function () {
  fetch('sketch.ino')
    .then(res => res.text())
    .then(text => {
      navigator.clipboard.writeText(text).then(() => {
        showToast("💻 sketch.ino berhasil disalin ke clipboard!");
        logWokwiEvent('CLIPBOARD', 'Kode firmware sketch.ino siap ditempel di tab kode Wokwi', 'success');
      });
    })
    .catch(err => {
      showToast("Gagal menyalin sketch.ino");
    });
};
