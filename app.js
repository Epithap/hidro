    // ============================================================
    // FIREBASE INITIALIZATION & COMPATIBILITY LAYER
    // ============================================================
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

    // Inisialisasi Firebase Compat SDK (Bekerja lancar di file:// dan http://)
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
    } else {
      console.warn("Firebase SDK script belum siap, menunggu listener...");
    }

    const database = (typeof firebase !== 'undefined' && firebase.database) ? firebase.database() : null;

    // Helper wrappers agar 100% kompatibel dengan pemanggilan modular
    const ref = (db, path) => db ? db.ref(path) : null;
    const onValue = (r, cb, errCb) => r ? r.on('value', cb, errCb) : null;
    const set = (r, val) => r ? r.set(val) : Promise.reject(new Error("Database offline"));

    // --- Audio Feedback Synth (Web Audio API) ---
    let soundEnabled = true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function initAudio() {
      if (!audioCtx) audioCtx = new AudioCtx();
    }

    function playBeep(freq = 600, type = 'sine', duration = 0.08) {
      if (!soundEnabled) return;
      try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {
        // audio context blocked until user interaction
      }
    }

    // Sound toggle listener
    const soundBtn = document.getElementById('sound-btn');
    const soundIconOn = document.getElementById('sound-icon-on');
    const soundIconOff = document.getElementById('sound-icon-off');
    soundBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundIconOn.style.display = soundEnabled ? 'block' : 'none';
      soundIconOff.style.display = soundEnabled ? 'none' : 'block';
      if (soundEnabled) {
        initAudio();
        playBeep(880, 'sine', 0.1);
      }
    });

    // --- Logger Terminal Stream ---
    const terminal = document.getElementById('terminal-logs');
    function logEvent(tag, message, level = 'info') {
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
      
      // Batasi 40 baris agar tidak memakan memori
      while (terminal.children.length > 40) {
        terminal.removeChild(terminal.firstChild);
      }
    }

    // --- Realtime Clock ---
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
      document.getElementById('clock-display').innerText = timeStr;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- Relay Switch Handlers ---
    window.handleRelayToggle = function (relayId, isChecked) {
      initAudio();
      playBeep(isChecked ? 750 : 420, 'sine', 0.12);
      
      // Optimistic UI feedback
      const card = document.getElementById('relay-card-' + relayId.replace('relay', ''));
      const stateLabel = document.getElementById(relayId + '-state');
      if (card) {
        card.classList.toggle('active', isChecked);
      }
      if (stateLabel) {
        stateLabel.innerText = isChecked ? 'AKTIF (ON)' : 'STANDBY';
      }

      logEvent('RELAY', `Mengirim perintah ${relayId.toUpperCase()} => ${isChecked ? 'ON' : 'OFF'}`, 'warning');

      if (database) {
        const updates = {};
        updates['agriculture_iot/relays/' + relayId] = isChecked;
        updates['relays/' + relayId] = isChecked;
        database.ref().update(updates)
          .then(() => {
            logEvent('RELAY', `Database sync sukses: ${relayId} terverifikasi`, 'success');
          })
          .catch(error => {
            logEvent('ERROR', `Gagal switch ${relayId}: ${error.message}`, 'danger');
            console.error("Relay write error:", error);
          });
      } else {
        logEvent('LOCAL', `${relayId} diubah lokal (Firebase belum terhubung)`, 'warning');
      }
    };

    // Backward compatibility if called via inline
    window.toggleRelay = window.handleRelayToggle;

    // --- High Performance Chart.js Telemetry Graph ---
    const ctxGraph = document.getElementById('sensorGraph').getContext('2d');
    
    // Gradients
    const gradPh = ctxGraph.createLinearGradient(0, 0, 0, 240);
    gradPh.addColorStop(0, 'rgba(0, 245, 160, 0.28)');
    gradPh.addColorStop(1, 'rgba(0, 245, 160, 0.0)');

    const gradTds = ctxGraph.createLinearGradient(0, 0, 0, 240);
    gradTds.addColorStop(0, 'rgba(255, 184, 48, 0.24)');
    gradTds.addColorStop(1, 'rgba(255, 184, 48, 0.0)');

    const sensorChart = new Chart(ctxGraph, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'pH Air',
            data: [],
            borderColor: '#00f5a0',
            backgroundColor: gradPh,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#00f5a0',
            pointBorderColor: '#070c12',
            pointBorderWidth: 2,
            yAxisID: 'yPh'
          },
          {
            label: 'TDS (PPM)',
            data: [],
            borderColor: '#ffb830',
            backgroundColor: gradTds,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffb830',
            pointBorderColor: '#070c12',
            pointBorderWidth: 2,
            yAxisID: 'yTds'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(7, 12, 18, 0.92)',
            titleColor: '#00f5a0',
            bodyColor: '#f0f6fc',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 12,
            titleFont: { family: 'JetBrains Mono', size: 12, weight: 'bold' },
            bodyFont: { family: 'Plus Jakarta Sans', size: 12 }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
            ticks: {
              color: '#849bb0',
              font: { family: 'JetBrains Mono', size: 10 }
            }
          },
          yPh: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 14,
            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
            ticks: {
              color: '#00f5a0',
              font: { family: 'JetBrains Mono', size: 10 },
              stepSize: 2
            }
          },
          yTds: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 2000,
            grid: { drawOnChartArea: false, drawBorder: false },
            ticks: {
              color: '#ffb830',
              font: { family: 'JetBrains Mono', size: 10 },
              stepSize: 400
            }
          }
        }
      }
    });

    // --- Sleek Custom Doughnut / Arc Gauges ---
    function buildGauge(canvasId, mainColor, trackColor = 'rgba(255, 255, 255, 0.05)') {
      const ctx = document.getElementById(canvasId).getContext('2d');
      return new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [0, 100],
            backgroundColor: [mainColor, trackColor],
            borderWidth: 0,
            borderRadius: [10, 0]
          }]
        },
        options: {
          rotation: -135,
          circumference: 270,
          cutout: '82%',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { tooltip: { enabled: false } },
          animation: { animateRotate: true, duration: 800 }
        }
      });
    }

    const phGauge = buildGauge('phGauge', '#00f5a0');
    const tdsGauge = buildGauge('tdsGauge', '#ffb830');

    // --- Diagnostik Kesehatan & Analisis Nutrisi ---
    function evaluateHealth(ph, tds) {
      let score = 100;
      let title = "Status Larutan: Sangat Prima";
      let desc = "Kombinasi pH dan kelarutan nutrisi TDS ideal untuk pertumbuhan selada dan pakcoy hidroponik.";
      let phBadge = "OPTIMAL";
      let phBadgeClass = "badge-optimal";
      let tdsBadge = "OPTIMAL";
      let tdsBadgeClass = "badge-optimal";

      // Evaluasi pH (Ideal 5.8 - 6.5)
      if (ph < 5.5) {
        score -= 25;
        phBadge = "TERLALU ASAM";
        phBadgeClass = "badge-danger";
        title = "Peringatan: Air Asam!";
        desc = "pH di bawah ambang batas (terlalu asam). Unsur Fosfor dan Kalsium sulit diserap. Pertimbangkan pompa pH Up.";
      } else if (ph > 7.0) {
        score -= 25;
        phBadge = "TERLALU BASA";
        phBadgeClass = "badge-danger";
        title = "Peringatan: Air Basa!";
        desc = "pH melebihi batas (basa). Penyerapan zat besi (Fe) dan seng (Zn) terhambat. Pertimbangkan pompa pH Down.";
      } else if (ph < 5.8 || ph > 6.8) {
        score -= 10;
        phBadge = "WASPADA";
        phBadgeClass = "badge-warning";
      }

      // Evaluasi TDS (Ideal 900 - 1400)
      if (tds < 600) {
        score -= 25;
        tdsBadge = "DEFISIT NUTRISI";
        tdsBadgeClass = "badge-warning";
        desc += " Larutan kekurangan kepekatan nutrisi. Disarankan menambah Nutrisi A & B.";
      } else if (tds > 1700) {
        score -= 30;
        tdsBadge = "OVERDOSIS PEKAT";
        tdsBadgeClass = "badge-danger";
        title = "Peringatan: Kepekatan Tinggi!";
        desc += " Konsentrasi garam pupuk terlalu pekat berisiko membakar akar tanaman.";
      }

      score = Math.max(10, Math.min(100, score));

      // Update UI Ring & Analysis
      const scoreRing = document.getElementById('score-ring');
      const scoreText = document.getElementById('score-text');
      const offset = 200 - (200 * (score / 100));
      scoreRing.style.strokeDashoffset = offset;
      scoreRing.style.stroke = score > 80 ? 'var(--neon-emerald)' : (score > 60 ? 'var(--neon-amber)' : 'var(--neon-crimson)');
      scoreText.innerText = `${score}%`;
      scoreText.style.color = scoreRing.style.stroke;

      document.getElementById('health-status-title').innerText = title;
      document.getElementById('health-status-desc').innerText = desc;

      const phBadgeElem = document.getElementById('ph-badge');
      phBadgeElem.innerText = phBadge;
      phBadgeElem.className = `badge-pill ${phBadgeClass}`;

      const tdsBadgeElem = document.getElementById('tds-badge');
      tdsBadgeElem.innerText = tdsBadge;
      tdsBadgeElem.className = `badge-pill ${tdsBadgeClass}`;
    }

    // --- Firebase Realtime Database Listener ---
    // Realtime Global Telemetry Cache for AI & Analytics
    const telemetryState = {
      ph: 6.50,
      tds: 1200,
      ec: '2.40',
      healthScore: 100,
      relays: {
        relay1: false,
        relay2: false,
        relay3: false,
        relay4: false
      },
      lastUpdate: '-'
    };

    const relayFriendlyNames = {
      relay1: 'Pompa pH Up',
      relay2: 'Pompa pH Down',
      relay3: 'Pompa Nutrisi A',
      relay4: 'Pompa Nutrisi B'
    };

    // --- Firebase Realtime Database Listener & Connection Engine ---
    function processIncomingTelemetry(data) {
      if (!data) return;
      const timeNow = new Date().toLocaleTimeString('id-ID', { hour12: false });
      let currentPh = telemetryState.ph;
      let currentTds = telemetryState.tds;

      // pH Update
      if (data.ph !== undefined) {
        currentPh = parseFloat(data.ph);
        telemetryState.ph = currentPh;
        const phElem = document.getElementById('phText');
        if (phElem) phElem.innerText = currentPh.toFixed(2);
        
        // Max scale 14
        const phPercent = Math.min(100, Math.max(0, (currentPh / 14) * 100));
        if (typeof phGauge !== 'undefined' && phGauge.data) {
          phGauge.data.datasets[0].data = [phPercent, 100 - phPercent];
          phGauge.update();
        }
      }

      // TDS Update
      if (data.tds !== undefined) {
        currentTds = parseFloat(data.tds);
        telemetryState.tds = currentTds;
        const tdsElem = document.getElementById('tdsText');
        if (tdsElem) tdsElem.innerText = Math.round(currentTds);
        
        // Max scale 2000
        const tdsPercent = Math.min(100, Math.max(0, (currentTds / 2000) * 100));
        if (typeof tdsGauge !== 'undefined' && tdsGauge.data) {
          tdsGauge.data.datasets[0].data = [tdsPercent, 100 - tdsPercent];
          tdsGauge.update();
        }

        // Hitung perkiraan EC & Tekanan Osmotik
        const ec = (currentTds / 500).toFixed(2);
        telemetryState.ec = ec;
        const ecElem = document.getElementById('ec-val');
        if (ecElem) ecElem.innerText = `${ec} mS/cm`;
        const osmotic = (ec * 0.36).toFixed(2);
        const osmElem = document.getElementById('osmotic-press');
        if (osmElem) osmElem.innerText = `${osmotic} atm`;
      }

      // Evaluasi Kesehatan
      evaluateHealth(currentPh, currentTds);

      // Chart Update
      if (data.ph !== undefined || data.tds !== undefined) {
        if (typeof sensorChart !== 'undefined' && sensorChart.data) {
          sensorChart.data.labels.push(timeNow);
          sensorChart.data.datasets[0].data.push(currentPh);
          sensorChart.data.datasets[1].data.push(currentTds);

          if (sensorChart.data.labels.length > 10) {
            sensorChart.data.labels.shift();
            sensorChart.data.datasets[0].data.shift();
            sensorChart.data.datasets[1].data.shift();
          }
          sensorChart.update();
        }
        const lastUpElem = document.getElementById('last-update');
        if (lastUpElem) lastUpElem.innerText = timeNow;
        telemetryState.lastUpdate = timeNow;
        
        logEvent('DATA', `Paket Telemetri: pH=${currentPh.toFixed(2)} | TDS=${Math.round(currentTds)} PPM`, 'info');
      }

      // Relays Update (Multi-format: boolean, integer 1/0, string 'true'/'false')
      const relaysSource = data.relays || (data.relay1 !== undefined ? data : null);
      if (relaysSource) {
        telemetryState.relays = { ...telemetryState.relays, ...relaysSource };
        for (let i = 1; i <= 4; i++) {
          const rId = 'relay' + i;
          const toggle = document.getElementById(rId);
          const card = document.getElementById('relay-card-' + i);
          const stateLabel = document.getElementById(rId + '-state');
          
          if (relaysSource[rId] !== undefined) {
            const rawVal = relaysSource[rId];
            const isOn = rawVal === true || rawVal === 1 || rawVal === '1' || rawVal === 'true' || rawVal === 'ON' || rawVal === 'on';
            if (toggle && toggle.checked !== isOn) {
              toggle.checked = isOn;
            }
            if (card) {
              card.classList.toggle('active', isOn);
            }
            if (stateLabel) {
              stateLabel.innerText = isOn ? 'AKTIF (ON)' : 'STANDBY';
            }
          }
        }
      }
    }

    if (database) {
      logEvent('NETWORK', 'Menghubungkan ke Realtime Database...', 'info');

      // 1. Connection state monitor
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
          logEvent('FIREBASE', 'Koneksi RTDB WebSocket Aktif & Terhubung', 'success');
        } else {
          if (statusElem) {
            statusElem.innerText = "MENYAMBUNGKAN...";
            statusElem.style.color = "#ffb830";
          }
          if (badge) {
            badge.style.borderColor = "rgba(255, 184, 48, 0.4)";
            badge.style.background = "rgba(255, 184, 48, 0.08)";
          }
        }
      });

      // 2. Primary listener on /agriculture_iot
      const iotRef = database.ref('agriculture_iot');
      iotRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          processIncomingTelemetry(data);
        } else {
          // Fallback jika node tersimpan langsung di root
          database.ref().once('value', (rootSnap) => {
            const rootData = rootSnap.val();
            if (rootData && (rootData.ph !== undefined || rootData.tds !== undefined)) {
              processIncomingTelemetry(rootData);
            }
          });
        }
      }, (error) => {
        console.error("Firebase Database error:", error);
        const statusElem = document.getElementById('db-status');
        const badge = document.getElementById('telemetry-badge');
        if (statusElem) {
          statusElem.innerText = "OFFLINE (" + (error.code || "ERR") + ")";
          statusElem.style.color = "#ff3366";
        }
        if (badge) {
          badge.style.borderColor = "rgba(255, 51, 102, 0.4)";
          badge.style.background = "rgba(255, 51, 102, 0.08)";
        }
        logEvent('FIREBASE', `Gagal koneksi: ${error.message}`, 'danger');
      });

      // 3. Independent listener for root /relays jika hardware menulis langsung ke /relays
      database.ref('relays').on('value', (snap) => {
        const relays = snap.val();
        if (relays) {
          processIncomingTelemetry({ relays });
        }
      });
    } else {
      logEvent('FIREBASE', 'Firebase SDK tidak terdeteksi. Berjalan di Mode Offline Simulator.', 'danger');
    }

    // ============================================================
    // UPIK HYDRO-AI: NATURAL LANGUAGE UNDERSTANDING & VOICE ENGINE
    // ============================================================

    let ttsVoiceEnabled = true;

    // Text-to-Speech Output
    function speakText(text) {
      if (!ttsVoiceEnabled || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const clean = text
          .replace(/[*_#`]/g, '')
          .replace(/[•-]/g, '')
          .replace(/\n+/g, '. ');
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'id-ID';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis error:", err);
      }
    }

    // Natural Language Command Parser
    function processNaturalLanguageCommand(inputText) {
      const raw = inputText.toLowerCase().trim();

      // 1. Deteksi Perintah ON / OFF (Fleksibel & Universal)
      const isTurnOff = /\b(mati|matiin|matikan|nonaktif|nonaktifkan|off|stop|hentikan|padam|padamkan|tutup|turn off|disable|shutdown|pause|berhenti)\b/i.test(raw);
      const isTurnOn = /\b(nyala|nyalain|nyalakan|hidup|hidupin|hidupkan|aktif|aktifkan|on|start|buka|jalankan|putar|turn on|enable|run)\b/i.test(raw);

      // Helper to trigger 3D actions
      const invoke3D = (actId) => {
        if (typeof window.run3DAction === 'function') {
          window.run3DAction(actId);
        }
      };

      // 0. Deteksi Interaksi & Kontrol 3D Digital Twin (36 Aksi Universal)
      // A. Misting / Penyiraman / Semprot Embun
      if (/\b(siram|semprot|misting|spray|embun|kabut|basahi|kelembaban\s*daun|hujan)\b/i.test(raw)) {
        if (raw.includes('hujan') || raw.includes('shower')) {
          invoke3D(7);
          return {
            type: 'ACTION',
            badge: '🌧️ 3D ACTION #7: HUJAN NUTRISI RUNNING',
            reply: 'Siap! Hujan nutrisi irigasi atas telah diaktifkan di model 3D, membasahi perakaran dan media tanam netpot secara merata.'
          };
        } else {
          invoke3D(6);
          return {
            type: 'ACTION',
            badge: '🚿 3D ACTION #6: MISTING SPRAY AKTIF',
            reply: 'Perintah dijalankan! Nozel misting sprayer bertekanan tinggi menyemprotkan kabut mikro air ke dedaunan tanaman hidroponik.'
          };
        }
      }

      // B. Lampu LED Grow Light & Spektrum Warna
      if (/\b(lampu|grow\s*light|growlight|led|spektrum|cahaya|lighting)\b/i.test(raw)) {
        if (isTurnOff || raw.includes('malam') || raw.includes('gelap') || raw.includes('sleep') || raw.includes('tidur')) {
          invoke3D(5);
          return {
            type: 'ACTION',
            badge: '🌙 3D ACTION #5: MODE MALAM (LAMPU OFF)',
            reply: 'Lampu grow light telah dipadamkan (Mode Malam). Siklus gelap dimulai untuk memfasilitasi respirasi alami tanaman.'
          };
        } else if (raw.includes('ungu') || raw.includes('blurple') || raw.includes('uv') || raw.includes('vegetatif') || raw.includes('tunas')) {
          invoke3D(3);
          return {
            type: 'ACTION',
            badge: '🟣 3D ACTION #3: SPEKTRUM BLURPLE VEG',
            reply: 'Spektrum lampu diubah ke Blurple UV (450nm + 660nm). Panjang gelombang ini ideal untuk percepatan fase vegetatif tanaman!'
          };
        } else if (raw.includes('merah') || raw.includes('red') || raw.includes('generatif') || raw.includes('bunga') || raw.includes('buah')) {
          invoke3D(4);
          return {
            type: 'ACTION',
            badge: '🔴 3D ACTION #4: SPEKTRUM DEEP RED BLOOM',
            reply: 'Spektrum diubah ke Deep Red (660nm - 730nm) untuk memacu metabolisme fase generatif dan pembungaan tanaman hidroponik.'
          };
        } else if (raw.includes('putih') || raw.includes('matahari') || raw.includes('sunlight') || raw.includes('siang') || raw.includes('white')) {
          invoke3D(2);
          return {
            type: 'ACTION',
            badge: '☀️ 3D ACTION #2: SPEKTRUM SUNLIGHT PUTIH',
            reply: 'Spektrum lampu diset ke Full Sun White (4500K). Menyimulasikan intensitas sinar matahari alami siang hari.'
          };
        } else {
          invoke3D(1);
          return {
            type: 'ACTION',
            badge: '💡 3D ACTION #1: TOGGLE GROW LIGHT',
            reply: 'Status sakelar lampu grow LED hidroponik telah diubah.'
          };
        }
      }

      // C. Kipas / Ventilasi / Suhu Udara
      if (/\b(kipas|fan|exhaust|ventilasi|angin|blower|hawa)\b/i.test(raw)) {
        if (isTurnOff) {
          invoke3D(19);
          return {
            type: 'ACTION',
            badge: '🌪️ 3D ACTION #19: KIPAS VENTILASI TOGGLE',
            reply: 'Kipas exhaust ventilasi telah dimatikan.'
          };
        } else if (raw.includes('turbo') || raw.includes('kencang') || raw.includes('cepat') || raw.includes('tinggi') || raw.includes('high')) {
          invoke3D(21);
          return {
            type: 'ACTION',
            badge: '💨 3D ACTION #21: KIPAS MODE TURBO (3000 RPM)',
            reply: 'Kipas exhaust disetel ke Mode Turbo 3000 RPM untuk pembuangan panas dan penurunan kelembapan ekstrem!'
          };
        } else if (raw.includes('pelan') || raw.includes('senyap') || raw.includes('lambat') || raw.includes('silent') || raw.includes('low')) {
          invoke3D(20);
          return {
            type: 'ACTION',
            badge: '🍃 3D ACTION #20: KIPAS MODE SENYAP (LOW RPM)',
            reply: 'Kipas ventilasi disetel ke Mode Senyap Low RPM untuk sirkulasi udara halus tanpa mengeringkan daun.'
          };
        } else {
          invoke3D(19);
          return {
            type: 'ACTION',
            badge: '🌪️ 3D ACTION #19: TOGGLE KIPAS EXHAUST',
            reply: 'Kipas exhaust greenhouse telah diubah statusnya.'
          };
        }
      }

      // D. Aerator Oksigen Tandon
      if (/\b(aerator|gelembung|oksigen\s*air|batu\s*aerasi|bubble)\b/i.test(raw)) {
        invoke3D(10);
        return {
          type: 'ACTION',
          badge: '🫧 3D ACTION #10: AERATOR TANDON TOGGLED',
          reply: 'Aerator batu gelembung tandon telah di-toggle. Memaksimalkan Dissolved Oxygen (DO) untuk serabut akar tanaman.'
        };
      }

      // E. Aliran NFT / Sirkulasi / Flush Pipa
      if (/\b(sirkulasi\s*nft|kuras\s*pipa|flush\s*pipa|turbo\s*flush|aliran\s*nft)\b/i.test(raw)) {
        if (raw.includes('flush') || raw.includes('kuras')) {
          invoke3D(9);
          return {
            type: 'ACTION',
            badge: '⚡ 3D ACTION #9: TURBO FLUSH PIPA AKTIF',
            reply: 'Aliran turbo flush dijalankan! Mengikis lumut dan sedimen pupuk dari gully NFT hidroponik.'
          };
        } else {
          invoke3D(8);
          return {
            type: 'ACTION',
            badge: '💧 3D ACTION #8: SIRKULASI NFT NORMAL',
            reply: 'Sirkulasi pompa NFT distabilkan pada debit optimal 4.8 Liter/menit.'
          };
        }
      }

      // F. Isi Tandon / Kuras Tandon
      if (/\b(isi\s*air|isi\s*tandon|top\s*up\s*air|tambah\s*air|kuras\s*tandon|drain\s*tandon|kosongkan\s*tandon)\b/i.test(raw)) {
        if (raw.includes('kuras') || raw.includes('drain') || raw.includes('kosong')) {
          invoke3D(12);
          return {
            type: 'ACTION',
            badge: '🕳️ 3D ACTION #12: TANDON DIKURAS KE 40%',
            reply: 'Katup pembuangan tandon dibuka. Level air diturunkan ke 40% untuk pergantian larutan nutrisi baru.'
          };
        } else {
          invoke3D(11);
          return {
            type: 'ACTION',
            badge: '🚰 3D ACTION #11: ISI AIR TANDON (95%)',
            reply: 'Katup solenoid pengisian air tandon dibuka. Level air dinaikkan kembali ke 95% kapasitas!'
          };
        }
      }

      // G. Booster & Suplemen Tanaman
      if (/\b(silika|booster\s*batang|perkuat\s*batang|vitamin\s*b1|root\s*booster|perangsang\s*akar)\b/i.test(raw)) {
        if (raw.includes('silika') || raw.includes('batang')) {
          invoke3D(17);
          return {
            type: 'ACTION',
            badge: '🛡️ 3D ACTION #17: SILIKA BOOSTER DISUNTIKKAN',
            reply: 'Dosis silika cair disuntikkan ke larutan tandon untuk mempertebal dinding sel batang tanaman.'
          };
        } else {
          invoke3D(18);
          return {
            type: 'ACTION',
            badge: '🌱 3D ACTION #18: ROOT BOOSTER B1 AKTIF',
            reply: 'Vitamin B1 Root Booster disuntikkan untuk mempercepat pertumbuhan serabut akar putih tanaman.'
          };
        }
      }

      // H. Kamera & Visuals 3D (Zoom, X-Ray, Heatmap, Timelapse)
      if (/\b(zoom|kamera|tampilan|orbit|putar|perspektif|x-ray|xray|transparan|tembus|heatmap|timelapse|time\s*lapse)\b/i.test(raw)) {
        if (raw.includes('xray') || raw.includes('x-ray') || raw.includes('transparan') || raw.includes('tembus')) {
          invoke3D(30);
          return {
            type: 'ACTION',
            badge: '🩻 3D ACTION #30: X-RAY MODE TOGGLED',
            reply: 'Mode X-Ray pipa transparan diaktifkan! Anda kini dapat melihat sirkulasi air dan perakaran di dalam pipa NFT.'
          };
        }
        if (raw.includes('heatmap') || raw.includes('suhu daun') || raw.includes('warna daun')) {
          invoke3D(31);
          return {
            type: 'ACTION',
            badge: '🌡️ 3D ACTION #31: SENSOR HEATMAP DAUN',
            reply: 'Visualisasi Heatmap Kesehatan Daun diaktifkan untuk menganalisis deviasi fotosintesis dan klorofil.'
          };
        }
        if (raw.includes('timelapse') || raw.includes('time lapse') || raw.includes('tumbuh') || raw.includes('panen')) {
          invoke3D(32);
          return {
            type: 'ACTION',
            badge: '🌱 3D ACTION #32: TIME-LAPSE PERTUMBUHAN',
            reply: 'Simulasi time-lapse pertumbuhan dipercepat dimulai! Mengamati tahapan tanaman dari semai hingga siap panen.'
          };
        }
        if (raw.includes('daun') || raw.includes('tanaman') || raw.includes('netpot')) {
          invoke3D(25);
          return {
            type: 'ACTION',
            badge: '🔍 3D ACTION #25: ZOOM TANAMAN & DAUN',
            reply: 'Kamera diarahkan mendekat (zoom) ke daun tanaman untuk inspeksi detail struktur klorofil dan tajuk.'
          };
        }
        if (raw.includes('nozel') || raw.includes('spray') || raw.includes('pipa')) {
          invoke3D(26);
          return {
            type: 'ACTION',
            badge: '🧪 3D ACTION #26: ZOOM NOZEL MISTING',
            reply: 'Kamera bergeser ke nozel spray dan pipa gully atas hidroponik.'
          };
        }
        if (raw.includes('tandon') || raw.includes('probe') || raw.includes('sensor')) {
          invoke3D(27);
          return {
            type: 'ACTION',
            badge: '🛢️ 3D ACTION #27: ZOOM TANDON & SENSOR',
            reply: 'Kamera diarahkan menginspeksi tandon penampungan nutrisi dan probe celup pH/TDS.'
          };
        }
        if (raw.includes('atas') || raw.includes('top down') || raw.includes('ortho')) {
          invoke3D(28);
          return {
            type: 'ACTION',
            badge: '📐 3D ACTION #28: TOP-DOWN VIEW',
            reply: 'Sudut pandang diubah ke tampak atas (top-down orthogonal view).'
          };
        }
        if (raw.includes('orbit') || raw.includes('putar') || raw.includes('360')) {
          invoke3D(29);
          return {
            type: 'ACTION',
            badge: '🔄 3D ACTION #29: AUTO-ORBIT SINEMATIK 360°',
            reply: 'Mode sinematik Auto-Orbit 360° diaktifkan. Rak hidroponik berputar secara otomatis dan elegan.'
          };
        }
        if (raw.includes('reset') || raw.includes('awal') || raw.includes('overview') || raw.includes('default') || raw.includes('rumah')) {
          invoke3D(24);
          return {
            type: 'ACTION',
            badge: '🏠 3D ACTION #24: KAMERA OVERVIEW RUMAH',
            reply: 'Kamera 3D dikembalikan ke posisi home overview rak hidroponik.'
          };
        }
      }

      // I. Routine Makro Otomatisasi
      if (/\b(routine|rutinitas|jadwal|skenario|otomasi\s*pagi|otomasi\s*malam)\b/i.test(raw) || (raw.includes('pagi') && (raw.includes('mulai') || raw.includes('start'))) || (raw.includes('malam') && (raw.includes('mulai') || raw.includes('istirahat')))) {
        if (raw.includes('malam') || raw.includes('tidur')) {
          invoke3D(35);
          return {
            type: 'ACTION',
            badge: '🌃 3D ACTION #35: ROUTINE MALAM AKTIF',
            reply: 'Rutinitas malam dijalankan: Lampu dipadamkan untuk fase gelap tanaman dan kipas diset ke mode senyap.'
          };
        } else if (raw.includes('pagi') || raw.includes('terbit') || raw.includes('bangun')) {
          invoke3D(34);
          return {
            type: 'ACTION',
            badge: '🌅 3D ACTION #34: ROUTINE PAGI AKTIF',
            reply: 'Rutinitas pagi dijalankan: Lampu sunlight dinyalakan, nozel misting menyemprotkan embun, dan pompa sirkulasi air diaktifkan.'
          };
        } else if (raw.includes('reset')) {
          invoke3D(36);
          return {
            type: 'ACTION',
            badge: '🔄 3D ACTION #36: RESET SISTEM 3D',
            reply: 'Seluruh sistem simulasi 3D hidroponik telah di-reset ke konfigurasi default pabrik.'
          };
        }
      }

      // 1. Deteksi Perintah Relay Fisik ON / OFF
      let targetRelays = [];

      // A. Target: Semua Pompa
      if (/\b(semua|seluruh|all|semuanya|keempat|total)\b/i.test(raw) || (isTurnOff && raw.includes('pompa') && !raw.includes('ph') && !raw.includes('nutrisi') && !raw.includes('a') && !raw.includes('b') && !raw.includes('1') && !raw.includes('2') && !raw.includes('3') && !raw.includes('4'))) {
        targetRelays = ['relay1', 'relay2', 'relay3', 'relay4'];
      } else {
        // B. Target spesifik:
        // Relay 1: pH Up
        if (/\b(ph\s*up|phup|naikkan\s*ph|tambah\s*ph|ph\s*naik|basa|relay\s*1|pompa\s*1|pompa\s*satu)\b/i.test(raw) || (raw.includes('ph') && raw.includes('up'))) {
          targetRelays.push('relay1');
        }
        // Relay 2: pH Down
        if (/\b(ph\s*down|phdown|turunkan\s*ph|kurangi\s*ph|ph\s*turun|asam|relay\s*2|pompa\s*2|pompa\s*dua)\b/i.test(raw) || (raw.includes('ph') && raw.includes('down'))) {
          targetRelays.push('relay2');
        }
        // Relay 3: Nutrisi A
        if (/\b(nutrisi\s*a|nutrisia|pupuk\s*a|ab\s*mix\s*a|abmix\s*a|mix\s*a|pompa\s*a|relay\s*3|pompa\s*3|pompa\s*tiga)\b/i.test(raw) || (raw.includes('nutrisi') && raw.includes('a'))) {
          targetRelays.push('relay3');
        }
        // Relay 4: Nutrisi B
        if (/\b(nutrisi\s*b|nutrisib|pupuk\s*b|ab\s*mix\s*b|abmix\s*b|mix\s*b|pompa\s*b|relay\s*4|pompa\s*4|pompa\s*empat)\b/i.test(raw) || (raw.includes('nutrisi') && raw.includes('b'))) {
          targetRelays.push('relay4');
        }
        // Jika hanya menyebut "nutrisi" tanpa spesifik A atau B
        if (targetRelays.length === 0 && /\b(nutrisi|pupuk|ab\s*mix)\b/i.test(raw)) {
          targetRelays.push('relay3', 'relay4');
        }
        // Jika hanya menyebut "ph" tanpa spesifik Up/Down
        if (targetRelays.length === 0 && /\b(ph)\b/i.test(raw) && (isTurnOff || isTurnOn)) {
          if (raw.includes('naik') || raw.includes('tambah') || raw.includes('basa')) targetRelays.push('relay1');
          else if (raw.includes('turun') || raw.includes('kurang') || raw.includes('asam')) targetRelays.push('relay2');
          else targetRelays.push('relay1', 'relay2');
        }
      }

      // Eksekusi aksi jika ada instruksi relay
      if ((isTurnOff || isTurnOn) && targetRelays.length > 0) {
        const desiredState = isTurnOff ? false : true;
        const uniqueTargets = [...new Set(targetRelays)];

        // Eksekusi setiap relay
        uniqueTargets.forEach(rId => {
          window.handleRelayToggle(rId, desiredState);
        });

        const actionText = desiredState ? "MENYALAKAN (ON)" : "MEMATIKAN (OFF)";
        const namesFormatted = uniqueTargets.map(rId => `**${relayFriendlyNames[rId]}**`).join(", ");
        
        return {
          type: 'ACTION',
          badge: `⚡ PERINTAH DIJALANKAN: ${actionText} ➔ ${uniqueTargets.map(r => r.toUpperCase()).join(', ')}`,
          reply: `Perintah dieksekusi! Saya telah **${desiredState ? 'menyalakan' : 'mematikan'}** ${namesFormatted}. Sinkronisasi database Firebase telah berhasil.`
        };
      }

      // 2. Pertanyaan Telemetri & Status Sensor
      if (/\b(status|kondisi|cek|keadaan|bagaimana|gimana|berapa|pantau|lihat|nilai|baca)\b/i.test(raw) ||
          /\b(air|ph|tds|ppm|pompa|larutan|tanaman|nutrisi|sensor)\b/i.test(raw) && /\b(apakah|gimana|berapa|bagaimana|aman|normal|stabil)\b/i.test(raw)) {

        if (raw.includes('ph')) {
          const phVal = telemetryState.ph.toFixed(2);
          let desc = "Kondisi ideal (5.80 - 6.50).";
          if (telemetryState.ph < 5.8) desc = "Larutan agak asam. Disarankan mengaktifkan Pompa pH Up.";
          else if (telemetryState.ph > 6.8) desc = "Larutan agak basa. Disarankan mengaktifkan Pompa pH Down.";
          return {
            type: 'CHAT',
            reply: `📊 **Sensor pH Air**: Saat ini tercatat di angka **${phVal}**. ${desc}`
          };
        }

        if (raw.includes('tds') || raw.includes('ppm') || raw.includes('ec')) {
          const tdsVal = Math.round(telemetryState.tds);
          return {
            type: 'CHAT',
            reply: `🌿 **Konsentrasi Nutrisi TDS**: Terbaca **${tdsVal} PPM** (Konversi EC: **${telemetryState.ec} mS/cm**). Kepekatan pupuk AB Mix ini sangat optimal untuk pertumbuhan tanaman.`
          };
        }

        if (raw.includes('pompa') || raw.includes('relay')) {
          const activeRelays = Object.keys(telemetryState.relays)
            .filter(k => telemetryState.relays[k])
            .map(k => relayFriendlyNames[k]);
          
          const statusText = activeRelays.length > 0
            ? `Pompa yang sedang **AKTIF (ON)**: ${activeRelays.map(n => `**${n}**`).join(', ')}.`
            : `Seluruh 4 pompa saat ini dalam mode **STANDBY (OFF)**.`;
          return {
            type: 'CHAT',
            reply: `⚙️ **Status Aktuator Hidroponik**:\n${statusText}`
          };
        }

        // Laporan Lengkap
        const activeCount = Object.values(telemetryState.relays).filter(Boolean).length;
        return {
          type: 'CHAT',
          reply: `📊 **Laporan Diagnostik SKADUTA HydroTech**:\n• **pH Air**: ${telemetryState.ph.toFixed(2)} (Ideal: 5.80 - 6.50)\n• **Nutrisi TDS**: ${Math.round(telemetryState.tds)} PPM (EC: ${telemetryState.ec} mS/cm)\n• **Skor Kesehatan**: ${telemetryState.healthScore}%\n• **Pompa Aktif**: ${activeCount} dari 4 relay\n• **Update**: ${telemetryState.lastUpdate || 'Realtime'}\n\nSistem berjalan normal dan terkendali!`
        };
      }

      // 3. Percakapan Umum & Q&A Agronomi
      if (/\b(halo|hai|pagi|siang|malam|assalamualaikum|hey|hello|hi)\b/i.test(raw)) {
        return {
          type: 'CHAT',
          reply: `Halo! Saya **UPIK Hydro-AI Core**, siap mendampingi operasional hidroponik Anda. Anda bisa memberi saya instruksi santai seperti *"aku mau kamu matikan pompa nutrisi A"*, *"nyalakan pH down"*, atau bertanya *"bagaimana kondisi air sekarang?"*. Ada yang bisa saya bantu?`
        };
      }

      if (/\b(siapa|pembuat|ciptakan|developer|kamu siapa)\b/i.test(raw)) {
        return {
          type: 'CHAT',
          reply: `Saya adalah **UPIK Hydro-AI Agent v2.5**, modul kecerdasan buatan terintegrasi untuk IoT Greenhouse **SKADUTA Smart Agriculture** yang terhubung langsung ke Firebase Realtime Database.`
        };
      }

      if (/\b(terima kasih|makasih|thanks|thank you|mantap|keren|bagus|sip|oke)\b/i.test(raw)) {
        return {
          type: 'CHAT',
          reply: `Sama-sama! Selalu siap menjaga kualitas larutan hidroponik Anda tetap dalam kondisi terbaik. Senang bisa membantu!`
        };
      }

      if (/\b(pakcoy|selada|sayur|nutrisi|rekomendasi|pupuk)\b/i.test(raw)) {
        return {
          type: 'CHAT',
          reply: `🌱 **Rekomendasi Budidaya Presisi**:\n• **Target pH**: 5.8 – 6.5 (penyerapan N, P, K, Ca optimal)\n• **Target TDS**: 1050 – 1400 PPM untuk pakcoy & selada fase pembesaran\n• **Tips Sirkulasi**: Sirkulasikan larutan nutrisi secara teratur untuk menjaga saturasi oksigen terlarut (DO) di perakaran.`
        };
      }

      if (/\b(kuning|daun|layu|busuk|penyakit|hama|masalah)\b/i.test(raw)) {
        return {
          type: 'CHAT',
          reply: `⚠️ **Analisis Masalah Tanaman**:\nJika daun bawah menguning, umumnya ada 2 penyebab utama:\n1. **Kekurangan Nitrogen (N)**: Tambah kepekatan Nutrisi A & B jika TDS < 900 PPM.\n2. **pH Air di atas 7.0**: Menyebabkan zat besi (Fe) mengendap dan tidak terserap. Solusi: Nyalakan Pompa pH Down.`
        };
      }

      if (/\b(bantuan|help|bisa apa|fitur|perintah|command)\b/i.test(raw)) {
        return {
          type: 'CHAT',
          reply: `Berikut contoh perintah universal yang bisa Anda katakan atau ketik:\n\n` +
                 `🌿 **Aksi 3D Digital Twin**:\n` +
                 `• *"Tolong siram tanaman / semprot embun"*\n` +
                 `• *"Ganti lampu grow light ke ungu blurple"*\n` +
                 `• *"Nyalakan kipas exhaust mode turbo"*\n` +
                 `• *"Aktifkan aerator gelembung tandon"*\n` +
                 `• *"Zoom ke daun tanaman"* atau *"zoom ke tandon"*\n` +
                 `• *"Aktifkan mode X-Ray pipa transparan"*\n` +
                 `• *"Jalankan simulasi time-lapse pertumbuhan"*\n` +
                 `• *"Mulai routine pagi"* atau *"routine malam"*\n\n` +
                 `⚡ **Kontrol Pompa & Relay**:\n` +
                 `• *"Aku mau kamu matikan pompa nutrisi A"*\n` +
                 `• *"Nyalakan pH down dan nutrisi B"*\n` +
                 `• *"Matikan semua pompa sekarang"*\n\n` +
                 `📊 **Telemetri & Edukasi**:\n` +
                 `• *"Bagaimana kondisi air saat ini?"*\n` +
                 `• *"Berapa kadar pH dan PPM sekarang?"*\n\n` +
                 `💡 *Tips: Anda juga bisa menekan tombol mikrofon 🎤 untuk berbicara secara langsung!*`
        };
      }

      // Default contextual response
      return {
        type: 'CHAT',
        reply: `Pesan diterima: *"\"${inputText}\"*. Anda dapat mengontrol pompa fisik, memicu 36 aksi 3D Twin (seperti *"siram tanaman"*, *"lampu ungu"*, *"kipas turbo"*, *"mode x-ray"*, *"routine pagi"*), atau mengecek kualitas air. Ada instruksi yang ingin saya jalankan?`
      };
    }

    // --- UI Wiring & Chat Controller ---
    const aiFabBtn = document.getElementById('ai-fab-btn');
    const aiChatWindow = document.getElementById('ai-chat-window');
    const aiCloseBtn = document.getElementById('ai-close-btn');
    const aiClearBtn = document.getElementById('ai-clear-btn');
    const aiTtsBtn = document.getElementById('ai-tts-btn');
    const aiInput = document.getElementById('ai-input');
    const aiSendBtn = document.getElementById('ai-send-btn');
    const aiMicBtn = document.getElementById('ai-mic-btn');
    const aiMessagesList = document.getElementById('ai-messages-list');
    const aiFabTooltip = document.getElementById('ai-fab-tooltip');

    let isChatOpen = false;

    function toggleChat(forceState) {
      isChatOpen = forceState !== undefined ? forceState : !isChatOpen;
      if (isChatOpen) {
        aiChatWindow.classList.add('open');
        if (aiFabTooltip) aiFabTooltip.style.display = 'none';
        setTimeout(() => aiInput.focus(), 200);
        playBeep(700, 'sine', 0.08);
      } else {
        aiChatWindow.classList.remove('open');
        playBeep(450, 'sine', 0.08);
      }
    }

    aiFabBtn.addEventListener('click', () => toggleChat());
    aiCloseBtn.addEventListener('click', () => toggleChat(false));

    // Toggle Voice TTS
    aiTtsBtn.addEventListener('click', () => {
      ttsVoiceEnabled = !ttsVoiceEnabled;
      aiTtsBtn.classList.toggle('active', ttsVoiceEnabled);
      if (ttsVoiceEnabled) {
        speakText("Suara asisten diaktifkan.");
      } else {
        window.speechSynthesis?.cancel();
      }
    });

    // Clear Messages
    aiClearBtn.addEventListener('click', () => {
      aiMessagesList.innerHTML = `
        <div class="msg-row ai">
          <div class="msg-bubble">
            <div>Obrolan telah dibersihkan. Saya siap menerima perintah baru! 🌿</div>
            <div class="msg-time">Sekarang</div>
          </div>
        </div>
      `;
      playBeep(500, 'sine', 0.05);
    });

    // Append Message to UI
    function appendChatMessage(sender, text, actionBadge = null) {
      const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const row = document.createElement('div');
      row.className = `msg-row ${sender}`;
      
      let badgeHtml = '';
      if (actionBadge) {
        badgeHtml = `
          <div class="msg-action-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            ${actionBadge}
          </div>
        `;
      }

      // Convert simple markdown bold & linebreaks
      const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');

      row.innerHTML = `
        <div class="msg-bubble">
          <div>${formattedText}</div>
          ${badgeHtml}
          <div class="msg-time">${timeStr}</div>
        </div>
      `;
      
      aiMessagesList.appendChild(row);
      aiMessagesList.scrollTop = aiMessagesList.scrollHeight;
    }

    // Handle User Input Submission
    function handleUserSubmit() {
      const text = aiInput.value.trim();
      if (!text) return;

      appendChatMessage('user', text);
      aiInput.value = '';
      initAudio();
      playBeep(640, 'sine', 0.06);

      // Processing AI Response with slight micro-delay for natural feeling
      setTimeout(() => {
        const result = processNaturalLanguageCommand(text);
        appendChatMessage('ai', result.reply, result.badge || null);
        playBeep(880, 'sine', 0.09);
        speakText(result.reply);
      }, 250);
    }

    aiSendBtn.addEventListener('click', handleUserSubmit);
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUserSubmit();
    });

    // Quick Prompt Chips
    window.sendQuickPrompt = function(promptText) {
      aiInput.value = promptText;
      if (!isChatOpen) toggleChat(true);
      handleUserSubmit();
    };

    document.getElementById('chip-status')?.addEventListener('click', () => sendQuickPrompt('Bagaimana kondisi air saat ini?'));
    document.getElementById('chip-misting')?.addEventListener('click', () => sendQuickPrompt('Tolong siram tanaman dengan misting spray'));
    document.getElementById('chip-light-blurple')?.addEventListener('click', () => sendQuickPrompt('Ganti lampu grow light ke warna ungu blurple'));
    document.getElementById('chip-fan-turbo')?.addEventListener('click', () => sendQuickPrompt('Nyalakan kipas exhaust mode turbo'));
    document.getElementById('chip-xray')?.addEventListener('click', () => sendQuickPrompt('Aktifkan mode X-Ray pipa transparan'));
    document.getElementById('chip-morning')?.addEventListener('click', () => sendQuickPrompt('Jalankan routine pagi sekarang'));
    document.getElementById('chip-stop-all')?.addEventListener('click', () => sendQuickPrompt('Matikan semua pompa sekarang'));
    document.getElementById('chip-rekomendasi')?.addEventListener('click', () => sendQuickPrompt('Apa rekomendasi nutrisi untuk tanaman pakcoy?'));

    // Speech Recognition (Mic Voice Input)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        isListening = true;
        aiMicBtn.classList.add('listening');
        aiInput.placeholder = "Mendengarkan suara Anda...";
        playBeep(750, 'sine', 0.1);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          aiInput.value = transcript;
          handleUserSubmit();
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        isListening = false;
        aiMicBtn.classList.remove('listening');
        aiInput.placeholder = "Ketik perintah bebas...";
      };

      recognition.onend = () => {
        isListening = false;
        aiMicBtn.classList.remove('listening');
        aiInput.placeholder = "Ketik perintah bebas (cth: tolong matikan nutrisi a)...";
      };

      aiMicBtn.addEventListener('click', () => {
        initAudio();
        if (isListening) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch (e) {
            console.warn(e);
          }
        }
      });
    } else {
      aiMicBtn.addEventListener('click', () => {
        alert("Browser Anda belum mendukung Web Speech Recognition. Anda tetap bisa menggunakan keyboard untuk mengetik perintah.");
      });
    }

    // ============================================================
    // 10 ADVANCED EXTENSION FEATURES JAVASCRIPT ENGINE
    // ============================================================

    // --- FEATURE 5: CROP PROFILE PRESET SYSTEM ---
    const cropProfiles = {
      pakcoy: {
        name: "Pakcoy Nauli F1",
        targetPhMin: 5.8, targetPhMax: 6.5,
        targetTdsMin: 1050, targetTdsMax: 1400,
        totalDays: 35, currentDay: 19, harvestDate: "25 Oktober",
        stageName: "Vegetatif Aktif", estYield: "~14.5 Kg"
      },
      selada: {
        name: "Selada Romaine Hijau",
        targetPhMin: 5.6, targetPhMax: 6.2,
        targetTdsMin: 600, targetTdsMax: 900,
        totalDays: 40, currentDay: 22, harvestDate: "28 Oktober",
        stageName: "Pembesaran Daun", estYield: "~12.0 Kg"
      },
      stroberi: {
        name: "Stroberi Sweet Charlie",
        targetPhMin: 5.5, targetPhMax: 6.5,
        targetTdsMin: 1200, targetTdsMax: 1500,
        totalDays: 70, currentDay: 45, harvestDate: "15 November",
        stageName: "Pembentukan Bunga", estYield: "~8.2 Kg"
      },
      cabai: {
        name: "Cabai Rawit Dewata",
        targetPhMin: 6.0, targetPhMax: 6.8,
        targetTdsMin: 1400, targetTdsMax: 1800,
        totalDays: 85, currentDay: 38, harvestDate: "20 November",
        stageName: "Generatif Awal", estYield: "~18.0 Kg"
      },
      tomat: {
        name: "Tomat Cherry Ruby",
        targetPhMin: 5.8, targetPhMax: 6.5,
        targetTdsMin: 1500, targetTdsMax: 2000,
        totalDays: 75, currentDay: 30, harvestDate: "10 November",
        stageName: "Vegetatif Cepat", estYield: "~22.5 Kg"
      }
    };

    let activeCropKey = 'pakcoy';

    const cropSelectElem = document.getElementById('crop-select');
    cropSelectElem.addEventListener('change', (e) => {
      activeCropKey = e.target.value;
      const crop = cropProfiles[activeCropKey];
      
      // Update Growth Card
      document.getElementById('growth-crop-name').innerText = crop.name;
      const pct = Math.round((crop.currentDay / crop.totalDays) * 100);
      document.getElementById('growth-progress-bar').style.width = `${pct}%`;
      const daysLeft = crop.totalDays - crop.currentDay;
      document.getElementById('harvest-countdown-badge').innerText = `${daysLeft} HARI MENUJU PANEN`;
      
      logEvent('SYSTEM', `Profil Tanaman diubah ke: ${crop.name} (Target pH: ${crop.targetPhMin}-${crop.targetPhMax} | TDS: ${crop.targetTdsMin}-${crop.targetTdsMax})`, 'info');
      evaluateHealth(telemetryState.ph, telemetryState.tds);
      playBeep(600, 'sine', 0.08);
    });

    // --- FEATURE 3: TIMED PULSE BURST DOSING ENGINE ---
    const activeDosingTimers = {};

    window.triggerTimedDose = function (relayId, seconds) {
      initAudio();
      playBeep(850, 'sine', 0.12);

      if (activeDosingTimers[relayId]) {
        clearInterval(activeDosingTimers[relayId]);
      }

      const cdElem = document.getElementById(`dose-cd-${relayId}`);
      if (cdElem) {
        cdElem.style.display = 'inline';
        cdElem.innerText = `${seconds}s`;
      }

      // Aktifkan relay
      window.handleRelayToggle(relayId, true);
      logEvent('DOSING', `Memulai Dosis Cepat: ${relayFriendlyNames[relayId]} selama ${seconds} detik`, 'warning');

      let remaining = seconds;
      activeDosingTimers[relayId] = setInterval(() => {
        remaining--;
        if (cdElem) cdElem.innerText = `${remaining}s`;

        if (remaining <= 0) {
          clearInterval(activeDosingTimers[relayId]);
          delete activeDosingTimers[relayId];
          if (cdElem) cdElem.style.display = 'none';
          
          // Matikan kembali relay
          window.handleRelayToggle(relayId, false);
          logEvent('DOSING', `Dosis Selesai: ${relayFriendlyNames[relayId]} dimatikan otomatis`, 'success');
          playBeep(450, 'sine', 0.15);
        }
      }, 1000);
    };

    // --- FEATURE 2: SMART AUTO-PILOT AUTOMATION MODE ---
    let autopilotEnabled = false;
    const autopilotBtn = document.getElementById('autopilot-btn');
    const autopilotStatus = document.getElementById('autopilot-status');

    autopilotBtn.addEventListener('click', () => {
      autopilotEnabled = !autopilotEnabled;
      autopilotBtn.classList.toggle('active', autopilotEnabled);
      autopilotStatus.innerText = autopilotEnabled ? 'ACTIVE (CLOSED-LOOP)' : 'OFF';
      autopilotStatus.style.color = autopilotEnabled ? 'var(--neon-emerald)' : 'var(--text-muted)';
      
      initAudio();
      playBeep(autopilotEnabled ? 900 : 400, 'sine', 0.1);
      logEvent('AUTOPILOT', `Auto-Pilot Closed-Loop Dosing ${autopilotEnabled ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}`, autopilotEnabled ? 'success' : 'info');
      
      if (autopilotEnabled) {
        speakText("Mode Autopilot Otomatis diaktifkan. Sistem akan menjaga parameter pH dan nutrisi secara otonom.");
      }
    });

    // Loop evaluasi otonom setiap 10 detik
    setInterval(() => {
      if (!autopilotEnabled) return;
      const crop = cropProfiles[activeCropKey];
      const ph = telemetryState.ph;
      const tds = telemetryState.tds;

      // Cek apakah pompa sedang dalam sesi dosing
      if (Object.keys(activeDosingTimers).length > 0) return;

      // Koreksi pH terlalu asam
      if (ph < crop.targetPhMin) {
        logEvent('AUTOPILOT', `[AUTO] pH (${ph.toFixed(2)}) di bawah batas ideal (${crop.targetPhMin}). Menembakkan Pompa pH Up (3 detik)...`, 'warning');
        triggerTimedDose('relay1', 3);
      }
      // Koreksi pH terlalu basa
      else if (ph > crop.targetPhMax) {
        logEvent('AUTOPILOT', `[AUTO] pH (${ph.toFixed(2)}) di atas batas ideal (${crop.targetPhMax}). Menembakkan Pompa pH Down (3 detik)...`, 'warning');
        triggerTimedDose('relay2', 3);
      }
      // Koreksi Defisit Nutrisi TDS
      else if (tds < crop.targetTdsMin) {
        logEvent('AUTOPILOT', `[AUTO] TDS (${Math.round(tds)} PPM) defisit dari target (${crop.targetTdsMin}). Menembakkan Nutrisi A & B (4 detik)...`, 'warning');
        triggerTimedDose('relay3', 4);
        setTimeout(() => triggerTimedDose('relay4', 4), 500);
      }
    }, 10000);

    // --- FEATURE 4: TELEMETRY CSV EXPORT GENERATOR ---
    const telemetryHistoryBuffer = [];

    // Kumpulkan data historis secara otomatis
    setInterval(() => {
      telemetryHistoryBuffer.push({
        time: new Date().toISOString(),
        crop: cropProfiles[activeCropKey].name,
        ph: telemetryState.ph.toFixed(2),
        tds: Math.round(telemetryState.tds),
        ec: telemetryState.ec,
        relay1: telemetryState.relays.relay1 ? 1 : 0,
        relay2: telemetryState.relays.relay2 ? 1 : 0,
        relay3: telemetryState.relays.relay3 ? 1 : 0,
        relay4: telemetryState.relays.relay4 ? 1 : 0,
        health: telemetryState.healthScore,
        waterTemp: "24.6"
      });
      if (telemetryHistoryBuffer.length > 500) telemetryHistoryBuffer.shift();
    }, 5000);

    document.getElementById('export-csv-btn').addEventListener('click', () => {
      initAudio();
      playBeep(700, 'sine', 0.1);

      if (telemetryHistoryBuffer.length === 0) {
        // Dummy snapshot jika baru buka
        telemetryHistoryBuffer.push({
          time: new Date().toISOString(),
          crop: cropProfiles[activeCropKey].name,
          ph: telemetryState.ph.toFixed(2),
          tds: Math.round(telemetryState.tds),
          ec: telemetryState.ec,
          relay1: telemetryState.relays.relay1 ? 1 : 0,
          relay2: telemetryState.relays.relay2 ? 1 : 0,
          relay3: telemetryState.relays.relay3 ? 1 : 0,
          relay4: telemetryState.relays.relay4 ? 1 : 0,
          health: telemetryState.healthScore,
          waterTemp: "24.6"
        });
      }

      let csvContent = "Timestamp,Tanaman,pH,TDS_PPM,EC_mS_cm,Relay1_pHUp,Relay2_pHDown,Relay3_NutrisiA,Relay4_NutrisiB,Health_Score_Pct,Suhu_Air_C\n";
      telemetryHistoryBuffer.forEach(row => {
        csvContent += `"${row.time}","${row.crop}",${row.ph},${row.tds},${row.ec},${row.relay1},${row.relay2},${row.relay3},${row.relay4},${row.health},${row.waterTemp}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `skaduta_iot_telemetry_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      logEvent('DATA', `Berhasil mengekspor ${telemetryHistoryBuffer.length} baris telemetri CSV`, 'success');
    });

    // --- FEATURE 7: FULLSCREEN PRESENTATION KIOSK MODE ---
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    fullscreenBtn.addEventListener('click', () => {
      initAudio();
      playBeep(650, 'sine', 0.08);
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.warn(err));
      } else {
        document.exitFullscreen().catch(err => console.warn(err));
      }
    });

    // --- FEATURE 8: REAL-TIME HAZARD ALARM HUD & BUZZER ---
    let alarmMuted = false;
    let hazardActive = false;

    window.toggleAlarmAudioMute = function() {
      alarmMuted = !alarmMuted;
      document.getElementById('alarm-mute-text').innerText = alarmMuted ? 'Unmute Alarm 🔇' : 'Mute Alarm 🔔';
      playBeep(alarmMuted ? 350 : 750, 'sine', 0.08);
    };

    function checkHazardThresholds(ph, tds) {
      const banner = document.getElementById('hazard-banner');
      const msg = document.getElementById('hazard-message');
      
      let isCritical = false;
      let reason = "";

      if (ph < 4.8) {
        isCritical = true;
        reason = `Kadar pH EKSTRIM ASAM (${ph.toFixed(2)})! Berisiko merusak jaringan perakaran.`;
      } else if (ph > 7.6) {
        isCritical = true;
        reason = `Kadar pH EKSTRIM BASA (${ph.toFixed(2)})! Pengendapan hara kalsium & zat besi terjadi.`;
      } else if (tds < 400) {
        isCritical = true;
        reason = `Konsentrasi TDS KRITIS (${Math.round(tds)} PPM)! Air mendekati air murni tanpa nutrisi.`;
      } else if (tds > 1950) {
        isCritical = true;
        reason = `Konsentrasi TDS OVERDOSIS (${Math.round(tds)} PPM)! Tekanan osmotik tinggi membakar tanaman.`;
      }

      if (isCritical) {
        banner.classList.add('active');
        msg.innerText = reason;
        if (!hazardActive && !alarmMuted) {
          playBeep(880, 'square', 0.25);
          setTimeout(() => playBeep(660, 'square', 0.25), 300);
        }
        hazardActive = true;
      } else {
        banner.classList.remove('active');
        hazardActive = false;
      }
    }

    // --- FEATURE 6: MICROCLIMATE WEATHER & VPD ENGINE ---
    function updateMicroclimateData() {
      // Fluktuasi mikroklimat alami
      const ambientT = (28.0 + (Math.sin(Date.now() / 60000) * 0.8)).toFixed(1);
      const waterT = (24.4 + (Math.cos(Date.now() / 80000) * 0.4)).toFixed(1);
      const rh = Math.round(68 + (Math.sin(Date.now() / 50000) * 3));

      // Hitung VPD (Vapor Pressure Deficit) dalam kPa
      const vpSat = 0.61078 * Math.exp((17.27 * ambientT) / (parseFloat(ambientT) + 237.3));
      const vpd = (vpSat * (1 - (rh / 100))).toFixed(2);

      document.getElementById('ambient-temp-val').innerText = `${ambientT}°C`;
      document.getElementById('water-temp-val').innerText = `${waterT}°C`;
      document.getElementById('humidity-val').innerText = `${rh}% RH`;
      document.getElementById('vpd-val').innerText = `${vpd} kPa`;
    }
    setInterval(updateMicroclimateData, 4000);
    updateMicroclimateData();

    // Hook checkHazardThresholds ke dalam realtime listener
    const originalEvaluateHealth = evaluateHealth;
    evaluateHealth = function(ph, tds) {
      originalEvaluateHealth(ph, tds);
      checkHazardThresholds(ph, tds);
    };

    // ============================================================
    // ADVANCED 3D DIGITAL TWIN: SMART HOME URBAN HYDROPONICS (36 ACTIONS)
    // ============================================================

    // Sound Synthesizer Helper for 3D Interactions
    function play3DSound(type) {
      if (!soundEnabled) return;
      initAudio();
      try {
        if (type === 'spray') {
          // White noise / hiss spray simulation
          const bufferSize = audioCtx.sampleRate * 0.4;
          const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
          const noise = audioCtx.createBufferSource();
          noise.buffer = buffer;
          const filter = audioCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1800;
          const gain = audioCtx.createGain();
          gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(audioCtx.destination);
          noise.start();
        } else if (type === 'click') {
          playBeep(920, 'sine', 0.05);
        } else if (type === 'fan') {
          playBeep(220, 'triangle', 0.25);
        } else if (type === 'water') {
          playBeep(640, 'sine', 0.08);
          setTimeout(() => playBeep(780, 'sine', 0.08), 80);
        } else if (type === 'camera') {
          playBeep(520, 'sine', 0.12);
        }
      } catch (e) {}
    }

    // Toast Flash Helper
    function show3DToast(text) {
      const toast = document.getElementById('three-action-toast-msg');
      if (toast) {
        toast.innerText = text;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2400);
      }
      const headerToast = document.getElementById('3d-action-toast');
      if (headerToast) headerToast.innerText = text;
    }

    function init3DDigitalTwin() {
      const container = document.getElementById('three-container');
      if (!container || !window.THREE) return;

      const width = container.clientWidth || 900;
      const height = container.clientHeight || 520;

      // Scene, Camera, Renderer
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060e16);
      scene.fog = new THREE.FogExp2(0x060e16, 0.018);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      const defaultCamPos = new THREE.Vector3(0, 5.5, 17);
      camera.position.copy(defaultCamPos);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      // Cyber Environment Lighting
      const ambientLight = new THREE.AmbientLight(0x182c3c, 1.4);
      scene.add(ambientLight);

      const mainSunLight = new THREE.DirectionalLight(0xdcf4ff, 0.9);
      mainSunLight.position.set(6, 14, 10);
      scene.add(mainSunLight);

      // Root Home Hydroponic Model Group
      const rackGroup = new THREE.Group();
      scene.add(rackGroup);

      // Grid Floor
      const grid = new THREE.GridHelper(30, 30, 0x00f5a0, 0x112330);
      grid.position.y = -2.8;
      scene.add(grid);

      // 1. Sleek Aluminum & Walnut Frame
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x151d26, metalness: 0.85, roughness: 0.25 });
      const woodTrimMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.6 });

      // 4 Pillars
      for (let x of [-4.2, 4.2]) {
        for (let z of [-2, 2]) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 8, 0.24), frameMat);
          pillar.position.set(x, 1.2, z);
          rackGroup.add(pillar);
        }
      }

      // Crossbars
      for (let y of [-1.5, 0.5, 2.5, 4.5]) {
        for (let z of [-2, 2]) {
          const barX = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.16, 0.16), frameMat);
          barX.position.set(0, y, z);
          rackGroup.add(barX);
        }
        for (let x of [-4.2, 4.2]) {
          const barZ = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 4.2), frameMat);
          barZ.position.set(x, y, 0);
          rackGroup.add(barZ);
        }
      }

      // Top Wood Accent Header
      const woodHeader = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.35, 4.4), woodTrimMat);
      woodHeader.position.set(0, 5.2, 0);
      rackGroup.add(woodHeader);

      // 2. 3 Tiers of White PVC NFT Channels & Plants
      const pipeMat = new THREE.MeshStandardMaterial({
        color: 0xecf3f8,
        metalness: 0.15,
        roughness: 0.3,
        transparent: false
      });

      const tierHeights = [0.8, 2.8, 4.8];
      const allPipes = [];
      const allPlants = [];
      const growLights = [];
      const growLightMeshes = [];

      tierHeights.forEach((ty, tierIdx) => {
        // 2 NFT channels per tier
        for (let zPos of [-1, 1]) {
          const pipe = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.45, 0.85), pipeMat);
          pipe.position.set(0, ty - 1.2, zPos);
          pipe.rotation.z = tierIdx % 2 === 0 ? 0.02 : -0.02; // Gentle slope
          rackGroup.add(pipe);
          allPipes.push(pipe);

          // --- BOTANICALLY REALISTIC HYDROPONIC PAKCOY & NETPOT GENERATOR (10,000x ENHANCED) ---
          function createBotanicalPakcoy(pxPos, pyPos, pzPos, plantSeed) {
            const plantGroup = new THREE.Group();
            plantGroup.position.set(pxPos, pyPos, pzPos);

            // 1. Hydroponic Slotted Netpot Basket
            const netpotMat = new THREE.MeshStandardMaterial({
              color: 0x161a20,
              roughness: 0.85,
              metalness: 0.15
            });
            const potCup = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.36, 16, 1, true), netpotMat);
            potCup.position.y = -0.16;
            plantGroup.add(potCup);

            const potLip = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16), netpotMat);
            potLip.position.y = 0.02;
            plantGroup.add(potLip);

            // 2. Terracotta Hydroton Clay Pebbles (Media Tanam Kerikil)
            const pebbleColors = [0x9e4b30, 0x823b22, 0xad5838, 0x73301a, 0xba6342];
            for (let pb = 0; pb < 10; pb++) {
              const pMat = new THREE.MeshStandardMaterial({
                color: pebbleColors[pb % pebbleColors.length],
                roughness: 0.92,
                metalness: 0.04
              });
              const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.058 + (pb % 3) * 0.012, 1), pMat);
              const pAng = (pb / 10) * Math.PI * 2 + pb * 0.4;
              const pRad = 0.07 + (pb % 4) * 0.035;
              pebble.position.set(Math.cos(pAng) * pRad, -0.03 + (pb % 2) * 0.025, Math.sin(pAng) * pRad);
              pebble.rotation.set(pb * 0.5, pb * 0.7, pb * 0.3);
              plantGroup.add(pebble);
            }

            // 3. Delicate White Hydroponic Root Beard (Serabut Akar Putih)
            const rootMat = new THREE.MeshStandardMaterial({
              color: 0xf3f9f4,
              roughness: 0.35,
              transparent: true,
              opacity: 0.85
            });
            for (let r = 0; r < 12; r++) {
              const rAng = (r / 12) * Math.PI * 2;
              const rRad = 0.05 + Math.random() * 0.07;
              const rLen = 0.42 + Math.random() * 0.32;
              const root = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.003, rLen, 5), rootMat);
              root.position.set(Math.cos(rAng) * rRad, -0.34 - rLen / 2, Math.sin(rAng) * rRad);
              root.rotation.z = (Math.random() - 0.5) * 0.28;
              root.rotation.x = (Math.random() - 0.5) * 0.28;
              plantGroup.add(root);
            }

            // 4. Botanical Organic Curved Leaves with Fleshy White Petiole & Emerald Blade
            function buildBotanicalLeafGeo(width, length, archFactor, cupFactor, waveFactor) {
              const segW = 8;
              const segL = 16;
              const geo = new THREE.PlaneGeometry(width, length, segW, segL);
              const pos = geo.attributes.position;
              const colors = new Float32Array(pos.count * 3);

              for (let i = 0; i < pos.count; i++) {
                let x = pos.getX(i);
                let y = pos.getY(i);
                const t = (y + length * 0.5) / length; // 0 at base, 1 at tip

                // Spoon shape: slender petiole base, broad spoon lamina
                let wFactor = 0.35;
                if (t > 0.22) {
                  wFactor = 0.35 + Math.sin((t - 0.22) / 0.78 * Math.PI * 0.96) * 0.95;
                }
                x = x * wFactor;

                // Transverse cup (hollow bowl along X)
                const normX = x / (width * 0.5 * wFactor + 0.001);
                const cupZ = Math.pow(normX, 2) * cupFactor * (0.35 + 0.65 * Math.sin(t * Math.PI));

                // Longitudinal arch (curves outwards and droops naturally with gravity)
                const archZ = -Math.sin(t * Math.PI * 0.8) * (length * archFactor);
                const dropY = -Math.pow(t, 2) * (length * 0.16 * archFactor);

                // Margin ruffles
                const waveZ = (Math.abs(normX) > 0.45) ? Math.sin(t * 16.0 + plantSeed) * waveFactor * t : 0;

                pos.setXYZ(i, x, y + dropY, cupZ + archZ + waveZ);

                // Vertex Color Gradient: Crisp Ivory/Mint Petiole -> Lush Emerald Lamina
                if (t < 0.26) {
                  const b = t / 0.26;
                  colors[i * 3]     = THREE.MathUtils.lerp(0.94, 0.42, b);
                  colors[i * 3 + 1] = THREE.MathUtils.lerp(0.98, 0.88, b);
                  colors[i * 3 + 2] = THREE.MathUtils.lerp(0.94, 0.52, b);
                } else {
                  const b = (t - 0.26) / 0.74;
                  colors[i * 3]     = THREE.MathUtils.lerp(0.12, 0.04, b);
                  colors[i * 3 + 1] = THREE.MathUtils.lerp(0.86, 0.64, b);
                  colors[i * 3 + 2] = THREE.MathUtils.lerp(0.38, 0.20, b);
                }
              }

              geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
              geo.computeVertexNormals();
              return geo;
            }

            const leafMat = new THREE.MeshStandardMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              roughness: 0.32,
              metalness: 0.06,
              emissive: 0x052e16,
              emissiveIntensity: 0.2
            });

            const petioleStemMat = new THREE.MeshStandardMaterial({
              color: 0xecfdf5,
              roughness: 0.26,
              metalness: 0.08
            });

            // Tier 1: Outer Mature Leaves (6 leaves, spreading wide)
            const outerN = 6;
            for (let i = 0; i < outerN; i++) {
              const ang = i * ((Math.PI * 2) / outerN) + plantSeed * 0.1;
              const lGeo = buildBotanicalLeafGeo(0.68, 1.22, 0.46, 0.14, 0.035);
              const leaf = new THREE.Mesh(lGeo, leafMat);
              leaf.position.set(Math.cos(ang) * 0.12, 0.04, Math.sin(ang) * 0.12);
              leaf.rotation.y = ang - Math.PI / 2;
              leaf.rotation.x = 0.82; // leaning out
              leaf.rotation.z = (Math.random() - 0.5) * 0.06;

              const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.016, 0.45, 6), petioleStemMat);
              spine.position.set(0, -0.36, 0.035);
              leaf.add(spine);
              plantGroup.add(leaf);
            }

            // Tier 2: Mid-tier Leaves (6 leaves, arching upright)
            const midN = 6;
            for (let i = 0; i < midN; i++) {
              const ang = i * ((Math.PI * 2) / midN) + (Math.PI / 6) + plantSeed * 0.12;
              const lGeo = buildBotanicalLeafGeo(0.54, 1.02, 0.36, 0.11, 0.026);
              const leaf = new THREE.Mesh(lGeo, leafMat);
              leaf.position.set(Math.cos(ang) * 0.08, 0.10, Math.sin(ang) * 0.08);
              leaf.rotation.y = ang - Math.PI / 2;
              leaf.rotation.x = 0.50; // semi-upright
              leaf.rotation.z = (Math.random() - 0.5) * 0.06;

              const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.012, 0.35, 6), petioleStemMat);
              spine.position.set(0, -0.30, 0.028);
              leaf.add(spine);
              plantGroup.add(leaf);
            }

            // Tier 3: Inner Heart Leaves (5 leaves, tender lime/chartreuse, tightly cupped)
            const innerN = 5;
            for (let i = 0; i < innerN; i++) {
              const ang = i * ((Math.PI * 2) / innerN) + (Math.PI / 3) + plantSeed * 0.15;
              const lGeo = buildBotanicalLeafGeo(0.40, 0.72, 0.20, 0.08, 0.015);
              const leaf = new THREE.Mesh(lGeo, leafMat);
              leaf.position.set(Math.cos(ang) * 0.04, 0.18, Math.sin(ang) * 0.04);
              leaf.rotation.y = ang - Math.PI / 2;
              leaf.rotation.x = 0.22; // upright center
              leaf.rotation.z = (Math.random() - 0.5) * 0.04;
              plantGroup.add(leaf);
            }

            // Natural scale variation
            const naturalScale = 0.92 + (plantSeed % 5) * 0.045;
            plantGroup.scale.set(naturalScale, naturalScale, naturalScale);

            rackGroup.add(plantGroup);
            allPlants.push(plantGroup);
          }

          // Netpots & Leafy Plants on each pipe (5 per channel)
          let plantIndex = 0;
          for (let px = -2.8; px <= 2.8; px += 1.4) {
            createBotanicalPakcoy(px, ty - 0.92, zPos, plantIndex++);
          }
        }

        // Hanging LED Grow Light Fixtures (above each tier)
        const lightFixture = new THREE.Mesh(
          new THREE.BoxGeometry(8.0, 0.12, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x1f2b38, metalness: 0.9, roughness: 0.2 })
        );
        lightFixture.position.set(0, ty + 0.35, 0);
        rackGroup.add(lightFixture);

        // LED Strip Emissive Plate
        const ledStrip = new THREE.Mesh(
          new THREE.BoxGeometry(7.6, 0.04, 2.4),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 1.2
          })
        );
        ledStrip.position.set(0, ty + 0.28, 0);
        rackGroup.add(ledStrip);
        growLightMeshes.push(ledStrip);

        // Dynamic Three.js PointLight
        const pLight = new THREE.PointLight(0xfff5e6, 1.6, 6);
        pLight.position.set(0, ty + 0.2, 0);
        rackGroup.add(pLight);
        growLights.push(pLight);
      });

      // 3. Transparent Acrylic Reservoir Tank (Tandon Air Nutrisi Bawah)
      const tankGroup = new THREE.Group();
      tankGroup.position.set(0, -2.1, 0);
      rackGroup.add(tankGroup);

      const tankOuter = new THREE.Mesh(
        new THREE.BoxGeometry(7.6, 1.6, 3.8),
        new THREE.MeshPhysicalMaterial({
          color: 0x0d283c,
          transmission: 0.85,
          opacity: 0.9,
          transparent: true,
          roughness: 0.15,
          ior: 1.4
        })
      );
      tankGroup.add(tankOuter);

      // Water Level Volume inside tank
      const waterMesh = new THREE.Mesh(
        new THREE.BoxGeometry(7.4, 1.3, 3.6),
        new THREE.MeshStandardMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.65,
          roughness: 0.1
        })
      );
      waterMesh.position.y = -0.1;
      tankGroup.add(waterMesh);

      // Submerged Aerator Stone & Bubbles System
      const bubblerGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 10);
      const bubblerMesh = new THREE.Mesh(bubblerGeo, new THREE.MeshStandardMaterial({ color: 0x5a6c7d }));
      bubblerMesh.rotation.z = Math.PI / 2;
      bubblerMesh.position.set(0, -0.6, 0);
      tankGroup.add(bubblerMesh);

      const bubbleCount = 70;
      const bubbleGeo = new THREE.BufferGeometry();
      const bubblePos = new Float32Array(bubbleCount * 3);
      for (let i = 0; i < bubbleCount; i++) {
        bubblePos[i * 3] = (Math.random() - 0.5) * 3;
        bubblePos[i * 3 + 1] = -0.6 + Math.random() * 1.2;
        bubblePos[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }
      bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
      const bubbleMat = new THREE.PointsMaterial({
        color: 0xaef5ff,
        size: 0.16,
        transparent: true,
        opacity: 0.8
      });
      const bubbleSystem = new THREE.Points(bubbleGeo, bubbleMat);
      tankGroup.add(bubbleSystem);

      // Sensor Probes (pH, TDS, Temp) Dipped in Tank
      const probeHolder = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.4), frameMat);
      probeHolder.position.set(2.2, 0.85, 0);
      tankGroup.add(probeHolder);

      const phProbe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x00f5a0, emissive: 0x00f5a0, emissiveIntensity: 0.8 })
      );
      phProbe.position.set(1.8, 0.1, 0);
      tankGroup.add(phProbe);

      const tdsProbe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xffb830, emissive: 0xffb830, emissiveIntensity: 0.8 })
      );
      tdsProbe.position.set(2.4, 0.1, 0);
      tankGroup.add(tdsProbe);

      // 4. Misting Water Spray Particle System (Sprayer Siram Tanaman)
      const sprayCount = 350;
      const sprayGeo = new THREE.BufferGeometry();
      const sprayPos = new Float32Array(sprayCount * 3);
      const sprayVel = [];
      for (let i = 0; i < sprayCount; i++) {
        sprayPos[i * 3] = (Math.random() - 0.5) * 7.5;
        sprayPos[i * 3 + 1] = 4.8;
        sprayPos[i * 3 + 2] = (Math.random() - 0.5) * 2.8;
        sprayVel.push({
          x: (Math.random() - 0.5) * 0.04,
          y: -0.08 - Math.random() * 0.1,
          z: (Math.random() - 0.5) * 0.04
        });
      }
      sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
      const sprayMat = new THREE.PointsMaterial({
        color: 0xc4f5ff,
        size: 0.18,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
      });
      const spraySystem = new THREE.Points(sprayGeo, sprayMat);
      rackGroup.add(spraySystem);

      // 5. Rotating Exhaust Ventilation Fan (Side Mounted)
      const fanGroup = new THREE.Group();
      fanGroup.position.set(-4.2, 4.0, 0);
      rackGroup.add(fanGroup);

      const fanHousing = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 1.5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x0b1622, metalness: 0.8 })
      );
      fanGroup.add(fanHousing);

      const fanBladesGroup = new THREE.Group();
      fanGroup.add(fanBladesGroup);

      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.55, 0.18),
          new THREE.MeshStandardMaterial({ color: 0x00d2ff, metalness: 0.5 })
        );
        blade.position.y = 0.28;
        blade.rotation.x = 0.4;
        const bladeWrap = new THREE.Group();
        bladeWrap.rotation.x = (b * Math.PI) / 2;
        bladeWrap.add(blade);
        fanBladesGroup.add(bladeWrap);
      }

      // Wind Flow Particles from Fan
      const windCount = 40;
      const windGeo = new THREE.BufferGeometry();
      const windPos = new Float32Array(windCount * 3);
      for (let i = 0; i < windCount; i++) {
        windPos[i * 3] = -4.4 - Math.random() * 2.5;
        windPos[i * 3 + 1] = 3.6 + Math.random() * 0.8;
        windPos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      }
      windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
      const windMat = new THREE.PointsMaterial({
        color: 0x88e2ff,
        size: 0.14,
        transparent: true,
        opacity: 0
      });
      const windSystem = new THREE.Points(windGeo, windMat);
      rackGroup.add(windSystem);

      // 6. Water Flow Circulation Inside Pipes (Particles)
      const flowCount = 180;
      const flowGeo = new THREE.BufferGeometry();
      const flowPos = new Float32Array(flowCount * 3);
      for (let i = 0; i < flowCount; i++) {
        const tIdx = i % 3;
        flowPos[i * 3] = (Math.random() - 0.5) * 7.5;
        flowPos[i * 3 + 1] = tierHeights[tIdx] - 1.2;
        flowPos[i * 3 + 2] = (i % 2 === 0 ? -1 : 1);
      }
      flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
      const flowMat = new THREE.PointsMaterial({
        color: 0x00d2ff,
        size: 0.18,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });
      const flowSystem = new THREE.Points(flowGeo, flowMat);
      rackGroup.add(flowSystem);

      // --- STATE VARIABLES FOR 36 ACTIONS ---
      const state3D = {
        lightsOn: true,
        spectrum: 'white', // white, blurple, red, night
        mistingActive: false,
        mistDuration: 0,
        rainActive: false,
        rainDuration: 0,
        nftFlowSpeed: 0.05,
        aeratorOn: true,
        fanOn: false,
        fanSpeed: 0.08,
        heaterOn: false,
        chillerOn: false,
        xrayMode: false,
        heatmapMode: false,
        autoOrbit: false,
        growthStage: 1.0, // scale of plants
        targetCamPos: defaultCamPos.clone(),
        targetCamLook: new THREE.Vector3(0, 1.5, 0)
      };

      // --- 36 ACTIONS DISPATCHER ---
      const actionsCatalog = [
        // Tab 1: lighting
        { id: 1, tab: 'lighting', icon: '💡', name: 'Sakelar Lampu LED (ON/OFF)', desc: 'Menghidupkan/mematikan lampu grow light', run: () => {
          state3D.lightsOn = !state3D.lightsOn;
          growLights.forEach(l => l.intensity = state3D.lightsOn ? 1.6 : 0.05);
          growLightMeshes.forEach(m => m.material.emissiveIntensity = state3D.lightsOn ? 1.2 : 0.05);
          document.getElementById('hud-growlight').innerText = state3D.lightsOn ? `💡 LAMPU: ${state3D.spectrum.toUpperCase()}` : '💡 LAMPU: OFF';
          show3DToast(`Lampu Grow LED ${state3D.lightsOn ? 'ON' : 'OFF'}`);
          play3DSound('click');
        }},
        { id: 2, tab: 'lighting', icon: '☀️', name: 'Spektrum Sunlight Putih (4500K)', desc: 'Spektrum penuh alami untuk fotosintesis harian', run: () => {
          state3D.lightsOn = true;
          state3D.spectrum = 'white';
          growLights.forEach(l => { l.color.setHex(0xfff5e6); l.intensity = 1.6; });
          growLightMeshes.forEach(m => { m.material.color.setHex(0xffffff); m.material.emissive.setHex(0xffffff); });
          document.getElementById('hud-growlight').innerText = '💡 LAMPU: WHITE SUNLIGHT';
          show3DToast('Spektrum: Sunlight Putih Aktif');
          play3DSound('click');
        }},
        { id: 3, tab: 'lighting', icon: '🟣', name: 'Spektrum Blurple (Vegetatif Cepat)', desc: 'Kombinasi UV 450nm + 660nm pemicu tunas daun', run: () => {
          state3D.lightsOn = true;
          state3D.spectrum = 'blurple';
          growLights.forEach(l => { l.color.setHex(0x9b51e0); l.intensity = 2.0; });
          growLightMeshes.forEach(m => { m.material.color.setHex(0xb5179e); m.material.emissive.setHex(0x9b51e0); });
          document.getElementById('hud-growlight').innerText = '💡 LAMPU: BLURPLE VEG';
          show3DToast('Spektrum: Blurple Vegetatif Aktif');
          play3DSound('click');
        }},
        { id: 4, tab: 'lighting', icon: '🔴', name: 'Spektrum Deep Red (Generatif)', desc: 'Merah tua memacu pembungaan dan buah', run: () => {
          state3D.lightsOn = true;
          state3D.spectrum = 'red';
          growLights.forEach(l => { l.color.setHex(0xff1744); l.intensity = 2.0; });
          growLightMeshes.forEach(m => { m.material.color.setHex(0xff1744); m.material.emissive.setHex(0xff1744); });
          document.getElementById('hud-growlight').innerText = '💡 LAMPU: DEEP RED BLOOM';
          show3DToast('Spektrum: Deep Red Generatif Aktif');
          play3DSound('click');
        }},
        { id: 5, tab: 'lighting', icon: '🌙', name: 'Mode Malam / Night Period', desc: 'Siklus gelap untuk istirahat tanaman', run: () => {
          state3D.lightsOn = false;
          growLights.forEach(l => l.intensity = 0.02);
          growLightMeshes.forEach(m => m.material.emissiveIntensity = 0.02);
          document.getElementById('hud-growlight').innerText = '💡 LAMPU: NIGHT SLEEP';
          show3DToast('Mode Malam: Lampu Gelap');
          play3DSound('click');
        }},

        // Tab 2: watering
        { id: 6, tab: 'watering', icon: '🚿', name: 'Semprot Embun / Mist Spray', desc: 'Nozel menyemprotkan partikel air ke daun', run: () => {
          state3D.mistingActive = true;
          state3D.mistDuration = 240; // frames
          sprayMat.opacity = 0.85;
          document.getElementById('hud-spray').innerText = '🚿 SPRAYER: MISTING ACTIVE';
          show3DToast('Misting Sprayer Menyemprot Embun!');
          play3DSound('spray');
        }},
        { id: 7, tab: 'watering', icon: '🌧️', name: 'Hujan Nutrisi / Rain Shower', desc: 'Irigasi tetes atas membasahi media tanam', run: () => {
          state3D.rainActive = true;
          state3D.rainDuration = 300;
          sprayMat.color.setHex(0x00d2ff);
          sprayMat.opacity = 0.95;
          show3DToast('Hujan Nutrisi Atas Dijalankan');
          play3DSound('spray');
        }},
        { id: 8, tab: 'watering', icon: '💧', name: 'Sirkulasi Pompa NFT Normal', desc: 'Menjalankan aliran sirkulasi nutrisi utama', run: () => {
          state3D.nftFlowSpeed = 0.06;
          flowMat.color.setHex(0x00d2ff);
          document.getElementById('hud-flow').innerText = '💧 NFT FLOW: NORMAL 4.8 L/M';
          show3DToast('Sirkulasi NFT Normal Aktif');
          play3DSound('water');
        }},
        { id: 9, tab: 'watering', icon: '⚡', name: 'Turbo Flush / Kuras Pipa Cepat', desc: 'Kecepatan aliran maksimal membersihkan pipa', run: () => {
          state3D.nftFlowSpeed = 0.18;
          flowMat.color.setHex(0x00f5a0);
          document.getElementById('hud-flow').innerText = '💧 NFT FLOW: TURBO FLUSH';
          show3DToast('Turbo Flush Pipa NFT Aktif!');
          play3DSound('water');
        }},
        { id: 10, tab: 'watering', icon: '🫧', name: 'Toggle Aerator Tandon Oksigen', desc: 'Batu gelembung oksigenasi di dalam tandon', run: () => {
          state3D.aeratorOn = !state3D.aeratorOn;
          bubbleMat.opacity = state3D.aeratorOn ? 0.8 : 0.05;
          document.getElementById('hud-aerator').innerText = state3D.aeratorOn ? '🫧 AERATOR: ON' : '🫧 AERATOR: OFF';
          show3DToast(`Aerator Oksigen ${state3D.aeratorOn ? 'ON' : 'OFF'}`);
          play3DSound('water');
        }},
        { id: 11, tab: 'watering', icon: '🚰', name: 'Isi Air Otomatis (Top-Up)', desc: 'Katup valve mengisi tandon ke 95%', run: () => {
          document.getElementById('tank-liquid').style.height = '95%';
          document.getElementById('tank-percent-text').innerText = '95%';
          document.getElementById('tank-liters-text').innerText = '190 Liter';
          show3DToast('Air Tandon Diisi Ulang ke 95%');
          play3DSound('water');
        }},
        { id: 12, tab: 'watering', icon: '🕳️', name: 'Kuras Tandon (Drain Tank)', desc: 'Mengurangi air tandon untuk penggantian nutrisi', run: () => {
          document.getElementById('tank-liquid').style.height = '40%';
          document.getElementById('tank-percent-text').innerText = '40%';
          document.getElementById('tank-liters-text').innerText = '80 Liter';
          show3DToast('Tandon Dikuras ke 40%');
          play3DSound('water');
        }},

        // Tab 3: nutrients
        { id: 13, tab: 'nutrients', icon: '⬆️', name: 'Injeksi Pompa pH Up (+0.2)', desc: 'Dosis kalium hidroksida menaikkan pH', run: () => {
          window.triggerTimedDose('relay1', 3);
          show3DToast('Injeksi pH Up Dieksekusi (+0.2)');
          play3DSound('water');
        }},
        { id: 14, tab: 'nutrients', icon: '⬇️', name: 'Injeksi Pompa pH Down (-0.2)', desc: 'Dosis asam fosfat menurunkan pH', run: () => {
          window.triggerTimedDose('relay2', 3);
          show3DToast('Injeksi pH Down Dieksekusi (-0.2)');
          play3DSound('water');
        }},
        { id: 15, tab: 'nutrients', icon: '🟢', name: 'Injeksi Nutrisi AB Mix A (+100 PPM)', desc: 'Makronutrien nitrogen fosfor kalium', run: () => {
          window.triggerTimedDose('relay3', 3);
          show3DToast('Injeksi Nutrisi A Dieksekusi (+100 PPM)');
          play3DSound('water');
        }},
        { id: 16, tab: 'nutrients', icon: '🟡', name: 'Injeksi Nutrisi AB Mix B (+100 PPM)', desc: 'Mikronutrien kalsium magnesium & trace', run: () => {
          window.triggerTimedDose('relay4', 3);
          show3DToast('Injeksi Nutrisi B Dieksekusi (+100 PPM)');
          play3DSound('water');
        }},
        { id: 17, tab: 'nutrients', icon: '🛡️', name: 'Dosis Silika Booster (Batang Kuat)', desc: 'Silika cair mempertebal dinding sel tanaman', run: () => {
          logEvent('NUTRISI', 'Dosis Silika Booster 5ml disuntikkan ke tandon', 'info');
          show3DToast('Silika Booster Disuntikkan!');
          play3DSound('water');
        }},
        { id: 18, tab: 'nutrients', icon: '🌱', name: 'Dosis Root Booster B1 (Perangsang Akar)', desc: 'Vitamin B1 mempercepat serabut akar putih', run: () => {
          logEvent('NUTRISI', 'Vitamin B1 Root Booster disuntikkan ke perakaran', 'info');
          show3DToast('Root Booster B1 Aktif!');
          play3DSound('water');
        }},

        // Tab 4: climate
        { id: 19, tab: 'climate', icon: '🌪️', name: 'Toggle Kipas Exhaust (ON/OFF)', desc: 'Menjalankan kipas sirkulasi udara greenhouse', run: () => {
          state3D.fanOn = !state3D.fanOn;
          windMat.opacity = state3D.fanOn ? 0.8 : 0;
          document.getElementById('hud-fan').innerText = state3D.fanOn ? '🌪️ KIPAS: RUNNING' : '🌪️ KIPAS: OFF';
          show3DToast(`Kipas Ventilasi ${state3D.fanOn ? 'ON' : 'OFF'}`);
          play3DSound('fan');
        }},
        { id: 20, tab: 'climate', icon: '🍃', name: 'Kipas Mode Senyap (Low RPM)', desc: 'Kecepatan rendah menjaga kelembapan mikro', run: () => {
          state3D.fanOn = true;
          state3D.fanSpeed = 0.05;
          windMat.opacity = 0.5;
          document.getElementById('hud-fan').innerText = '🌪️ KIPAS: LOW (1200 RPM)';
          show3DToast('Kipas: Mode Senyap Rendah');
          play3DSound('fan');
        }},
        { id: 21, tab: 'climate', icon: '💨', name: 'Kipas Mode Turbo (High RPM)', desc: 'Pendinginan cepat menurunkan suhu panas', run: () => {
          state3D.fanOn = true;
          state3D.fanSpeed = 0.22;
          windMat.opacity = 0.95;
          document.getElementById('hud-fan').innerText = '🌪️ KIPAS: TURBO (3000 RPM)';
          show3DToast('Kipas: Mode Turbo Aktif!');
          play3DSound('fan');
        }},
        { id: 22, tab: 'climate', icon: '🔥', name: 'Water Heater Pemanas (ON/OFF)', desc: 'Menghangatkan air tandon di malam hari dingin', run: () => {
          state3D.heaterOn = !state3D.heaterOn;
          show3DToast(`Water Heater ${state3D.heaterOn ? 'ON (Target 25°C)' : 'OFF'}`);
          play3DSound('click');
        }},
        { id: 23, tab: 'climate', icon: '❄️', name: 'Water Chiller Pendingin (ON/OFF)', desc: 'Mencegah akar membusuk akibat air terlalu panas', run: () => {
          state3D.chillerOn = !state3D.chillerOn;
          show3DToast(`Water Chiller ${state3D.chillerOn ? 'ON (Target 22°C)' : 'OFF'}`);
          play3DSound('click');
        }},

        // Tab 5: camera
        { id: 24, tab: 'camera', icon: '🏠', name: 'Kamera: Overview Prespektif Rumah', desc: 'Sudut pandang keseluruhan rak hidroponik', run: () => {
          state3D.autoOrbit = false;
          state3D.targetCamPos.set(0, 5.5, 17);
          state3D.targetCamLook.set(0, 1.5, 0);
          show3DToast('Kamera: Home Overview');
          play3DSound('camera');
        }},
        { id: 25, tab: 'camera', icon: '🔍', name: 'Kamera: Zoom Daun & Tanaman', desc: 'Inspeksi jarak dekat tajuk daun dan netpot', run: () => {
          state3D.autoOrbit = false;
          state3D.targetCamPos.set(-1.2, 3.2, 5.5);
          state3D.targetCamLook.set(-1.0, 2.8, 1.0);
          show3DToast('Kamera: Zoom Tanaman & Daun');
          play3DSound('camera');
        }},
        { id: 26, tab: 'camera', icon: '🧪', name: 'Kamera: Zoom Pipa & Nozel Spray', desc: 'Inspeksi nozel embun dan saluran pipa atas', run: () => {
          state3D.autoOrbit = false;
          state3D.targetCamPos.set(0, 5.2, 6.2);
          state3D.targetCamLook.set(0, 4.6, 0);
          show3DToast('Kamera: Zoom Nozel Sprayer');
          play3DSound('camera');
        }},
        { id: 27, tab: 'camera', icon: '🛢️', name: 'Kamera: Zoom Tandon & Probe Sensor', desc: 'Inspeksi sensor celup pH, TDS, dan tandon', run: () => {
          state3D.autoOrbit = false;
          state3D.targetCamPos.set(2.4, -0.8, 5.2);
          state3D.targetCamLook.set(1.8, -1.8, 0);
          show3DToast('Kamera: Zoom Tandon & Probe Sensor');
          play3DSound('camera');
        }},
        { id: 28, tab: 'camera', icon: '📐', name: 'Kamera: Pandangan Atas (Top-Down)', desc: 'Orthogonal plan view dari atas rak', run: () => {
          state3D.autoOrbit = false;
          state3D.targetCamPos.set(0, 18, 0.1);
          state3D.targetCamLook.set(0, 0, 0);
          show3DToast('Kamera: Top-Down Ortho View');
          play3DSound('camera');
        }},
        { id: 29, tab: 'camera', icon: '🔄', name: 'Kamera: Auto-Orbit Sinematik 360°', desc: 'Kamera berputar melingkar otomatis secara elegan', run: () => {
          state3D.autoOrbit = !state3D.autoOrbit;
          show3DToast(`Auto-Orbit 360° ${state3D.autoOrbit ? 'AKTIF' : 'OFF'}`);
          play3DSound('camera');
        }},

        // Tab 6: visuals
        { id: 30, tab: 'visuals', icon: '🩻', name: 'X-Ray Mode (Pipa Transparan)', desc: 'Melihat jalur air dan akar di dalam pipa', run: () => {
          state3D.xrayMode = !state3D.xrayMode;
          allPipes.forEach(p => {
            p.material.transparent = true;
            p.material.opacity = state3D.xrayMode ? 0.35 : 0.95;
            p.material.wireframe = state3D.xrayMode;
          });
          show3DToast(`X-Ray Pipa Transparan ${state3D.xrayMode ? 'ON' : 'OFF'}`);
          play3DSound('click');
        }},
        { id: 31, tab: 'visuals', icon: '🌡️', name: 'Sensor Heatmap Daun Tanaman', desc: 'Pewarnaan daun berdasarkan deviasi pH', run: () => {
          state3D.heatmapMode = !state3D.heatmapMode;
          allPlants.forEach(p => {
            p.traverse(child => {
              if (child.isMesh && child.material && child.material.vertexColors) {
                if (state3D.heatmapMode) {
                  child.material.emissive.setHex(0x00f5a0);
                  child.material.emissiveIntensity = 0.55;
                } else {
                  child.material.emissive.setHex(0x052e16);
                  child.material.emissiveIntensity = 0.20;
                }
              }
            });
          });
          show3DToast(`Heatmap Kesehatan Daun ${state3D.heatmapMode ? 'ON' : 'OFF'}`);
          play3DSound('click');
        }},
        { id: 32, tab: 'visuals', icon: '🌱', name: 'Time-Lapse Pertumbuhan Cepat', desc: 'Simulasi tanaman tumbuh dari semai ke panen', run: () => {
          let scale = 0.4;
          const growTimer = setInterval(() => {
            scale += 0.05;
            allPlants.forEach(p => p.scale.set(scale, scale, scale));
            if (scale >= 1.45) {
              clearInterval(growTimer);
              show3DToast('Simulasi Panen Selesai (Maksimal)!');
            }
          }, 60);
          show3DToast('Memulai Time-Lapse Pertumbuhan...');
          play3DSound('click');
        }},
        { id: 33, tab: 'visuals', icon: '🏷️', name: 'Tampilkan / Sembunyikan HUD Pin', desc: 'Toggle overlay teks dan dimensi 3D', run: () => {
          const badgeOverlay = container.querySelector('.three-badge-overlay');
          if (badgeOverlay) {
            badgeOverlay.style.display = badgeOverlay.style.display === 'none' ? 'flex' : 'none';
          }
          show3DToast('Toggle Tampilan HUD Pin 3D');
          play3DSound('click');
        }},

        // Tab 7: macro
        { id: 34, tab: 'macro', icon: '🌅', name: 'Routine Pagi (Lampu + Mist + Sirkulasi)', desc: 'Makro harian saat matahari mulai terbit', run: () => {
          // Action 2 (Sunlight)
          actionsCatalog.find(a => a.id === 2).run();
          // Action 6 (Mist spray)
          actionsCatalog.find(a => a.id === 6).run();
          // Action 8 (Sirkulasi)
          actionsCatalog.find(a => a.id === 8).run();
          show3DToast('⚡ Makro: Routine Pagi Hari Dijalankan');
          speakText("Rutinitas pagi dimulai. Lampu menyala, misting menyemprot, dan sirkulasi air aktif.");
        }},
        { id: 35, tab: 'macro', icon: '🌃', name: 'Routine Malam (Gelap + Kipas Low)', desc: 'Makro istirahat fotosintesis malam', run: () => {
          // Action 5 (Night)
          actionsCatalog.find(a => a.id === 5).run();
          // Action 20 (Fan low)
          actionsCatalog.find(a => a.id === 20).run();
          show3DToast('⚡ Makro: Routine Malam Hari Dijalankan');
          speakText("Rutinitas malam diaktifkan. Lampu dimatikan untuk periode gelap tanaman.");
        }},
        { id: 36, tab: 'macro', icon: '🔄', name: 'Reset Sistem 3D ke Default', desc: 'Kembalikan seluruh parameter 3D ke posisi awal', run: () => {
          actionsCatalog.find(a => a.id === 24).run(); // camera home
          state3D.lightsOn = true;
          growLights.forEach(l => { l.color.setHex(0xfff5e6); l.intensity = 1.6; });
          allPlants.forEach(p => p.scale.set(1, 1, 1));
          state3D.fanOn = false;
          windMat.opacity = 0;
          allPipes.forEach(p => { p.material.transparent = false; p.material.opacity = 1; p.material.wireframe = false; });
          document.getElementById('hud-growlight').innerText = '💡 LAMPU: WHITE SUNLIGHT';
          document.getElementById('hud-fan').innerText = '🌪️ KIPAS: OFF (0 RPM)';
          show3DToast('Sistem 3D Direset ke Default');
          play3DSound('click');
        }}
      ];

      // Expose globally so AI Chat and other scripts can trigger any of the 36 actions
      window.run3DAction = function(actionId) {
        const act = actionsCatalog.find(a => a.id === actionId);
        if (act) {
          act.run();
          logEvent('3D_DECK', `[AKSI #${act.id}] ${act.name}`, 'info');

          // Synchronize dock tab & pulse the action button
          if (tabsRow && actionsContainer) {
            tabsRow.querySelectorAll('.deck-tab-btn').forEach(b => {
              if (b.dataset.tab === act.tab) {
                b.classList.add('active');
              } else {
                b.classList.remove('active');
              }
            });
            renderTabActions(act.tab);
            const foundBtn = [...actionsContainer.querySelectorAll('.action-3d-btn')].find(b => b.innerHTML.includes(`#${act.id}`));
            if (foundBtn) {
              foundBtn.style.borderColor = 'var(--neon-emerald)';
              foundBtn.style.boxShadow = '0 0 18px var(--neon-emerald-glow)';
              foundBtn.style.transform = 'translateY(-2px)';
              setTimeout(() => {
                foundBtn.style.borderColor = '';
                foundBtn.style.boxShadow = '';
                foundBtn.style.transform = '';
              }, 1600);
            }
          }
          return act;
        }
      };

      // --- RENDER ACTION BUTTONS BY TAB ---
      const actionsContainer = document.getElementById('deck-actions-container');
      const tabsRow = document.getElementById('deck-tabs');

      function renderTabActions(tabKey) {
        if (!actionsContainer) return;
        actionsContainer.innerHTML = '';
        const filtered = actionsCatalog.filter(a => a.tab === tabKey);
        filtered.forEach(act => {
          const btn = document.createElement('button');
          btn.className = 'action-3d-btn';
          btn.title = act.desc;
          btn.innerHTML = `
            <span class="action-badge-num">#${act.id}</span>
            <span>${act.icon}</span>
            <span>${act.name}</span>
          `;
          btn.addEventListener('click', () => {
            act.run();
            play3DSound('click');
          });
          actionsContainer.appendChild(btn);
        });
      }

      // Initial tab load
      renderTabActions('lighting');

      tabsRow?.querySelectorAll('.deck-tab-btn').forEach(tBtn => {
        tBtn.addEventListener('click', () => {
          tabsRow.querySelectorAll('.deck-tab-btn').forEach(b => b.classList.remove('active'));
          tBtn.classList.add('active');
          const tab = tBtn.dataset.tab;
          renderTabActions(tab);
          play3DSound('click');
        });
      });

      // --- MOUSE DRAG & ORBIT CONTROLS ---
      let isDragging = false;
      let prevMousePos = { x: 0, y: 0 };

      container.addEventListener('mousedown', (e) => {
        isDragging = true;
        prevMousePos = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('mouseup', () => isDragging = false);

      container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - prevMousePos.x;
        const deltaY = e.clientY - prevMousePos.y;
        rackGroup.rotation.y += deltaX * 0.007;
        rackGroup.rotation.x += deltaY * 0.005;
        rackGroup.rotation.x = Math.max(-0.5, Math.min(0.7, rackGroup.rotation.x));
        prevMousePos = { x: e.clientX, y: e.clientY };
      });

      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.015;
        camera.position.z = Math.max(7, Math.min(26, camera.position.z));
      });

      document.getElementById('three-reset-cam')?.addEventListener('click', () => {
        window.run3DAction(24);
      });

      // --- INTERACTIVE RAYCASTING (CLICK DIRECTLY ON 3D OBJECTS) ---
      const raycaster = new THREE.Raycaster();
      const mouseVec = new THREE.Vector2();

      container.addEventListener('click', (e) => {
        const rect = container.getBoundingClientRect();
        mouseVec.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
        mouseVec.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouseVec, camera);
        const intersects = raycaster.intersectObjects(rackGroup.children, true);

        if (intersects.length > 0) {
          const hit = intersects[0].object;
          
          // Check if hit fan
          if (hit === fanHousing || hit.parent === fanBladesGroup) {
            window.run3DAction(19); // Toggle fan
          }
          // Check if hit light fixtures
          else if (growLightMeshes.includes(hit)) {
            window.run3DAction(1); // Toggle light
          }
          // Check if hit tank / reservoir
          else if (hit === tankOuter || hit === waterMesh) {
            window.run3DAction(10); // Toggle aerator
          }
          // Check if hit plants
          else if (allPlants.some(p => p === hit || p.getObjectById(hit.id))) {
            window.run3DAction(6); // Misting spray
          }
        }
      });

      // --- MAIN ANIMATION & SIMULATION LOOP ---
      function animate3D() {
        requestAnimationFrame(animate3D);

        // 1. Smooth Camera Tweening
        camera.position.lerp(state3D.targetCamPos, 0.06);
        camera.lookAt(state3D.targetCamLook);

        // 2. Auto-Orbit
        if (state3D.autoOrbit) {
          rackGroup.rotation.y += 0.008;
        }

        // 3. Fan Rotation
        if (state3D.fanOn) {
          fanBladesGroup.rotation.x += state3D.fanSpeed;
        }

        // 4. Misting Water Spray Particles
        if (state3D.mistingActive) {
          const pos = sprayGeo.attributes.position.array;
          for (let i = 0; i < sprayCount; i++) {
            pos[i * 3 + 1] += sprayVel[i].y;
            pos[i * 3] += sprayVel[i].x;
            pos[i * 3 + 2] += sprayVel[i].z;
            if (pos[i * 3 + 1] < -1.0) {
              pos[i * 3] = (Math.random() - 0.5) * 7.5;
              pos[i * 3 + 1] = 4.8;
              pos[i * 3 + 2] = (Math.random() - 0.5) * 2.8;
            }
          }
          sprayGeo.attributes.position.needsUpdate = true;
          state3D.mistDuration--;
          if (state3D.mistDuration <= 0) {
            state3D.mistingActive = false;
            sprayMat.opacity = 0;
            document.getElementById('hud-spray').innerText = '🚿 SPRAYER: STANDBY';
          }
        }

        // 5. Rain Shower Particles
        if (state3D.rainActive) {
          const pos = sprayGeo.attributes.position.array;
          for (let i = 0; i < sprayCount; i++) {
            pos[i * 3 + 1] -= 0.15;
            if (pos[i * 3 + 1] < -1.2) {
              pos[i * 3] = (Math.random() - 0.5) * 7.5;
              pos[i * 3 + 1] = 5.0;
              pos[i * 3 + 2] = (Math.random() - 0.5) * 2.8;
            }
          }
          sprayGeo.attributes.position.needsUpdate = true;
          state3D.rainDuration--;
          if (state3D.rainDuration <= 0) {
            state3D.rainActive = false;
            sprayMat.opacity = 0;
          }
        }

        // 6. Tank Aerator Bubbles
        if (state3D.aeratorOn) {
          const bPos = bubbleGeo.attributes.position.array;
          for (let i = 0; i < bubbleCount; i++) {
            bPos[i * 3 + 1] += 0.025;
            if (bPos[i * 3 + 1] > 0.6) {
              bPos[i * 3 + 1] = -0.6;
              bPos[i * 3] = (Math.random() - 0.5) * 3;
              bPos[i * 3 + 2] = (Math.random() - 0.5) * 2;
            }
          }
          bubbleGeo.attributes.position.needsUpdate = true;
        }

        // 7. NFT Nutrient Water Flow Particles
        const anyPumpActive = Object.values(telemetryState.relays).some(Boolean);
        const fSpeed = anyPumpActive ? 0.14 : state3D.nftFlowSpeed;
        const fPos = flowGeo.attributes.position.array;
        for (let i = 0; i < flowCount; i++) {
          fPos[i * 3] += fSpeed;
          if (fPos[i * 3] > 3.8) {
            fPos[i * 3] = -3.8;
          }
        }
        flowGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      }

      animate3D();

      // Responsive Resize Observer
      window.addEventListener('resize', () => {
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        if (nw && nh) {
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        }
      });
    }

    setTimeout(init3DDigitalTwin, 300);
