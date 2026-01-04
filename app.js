/* ================= CONFIG ================= */
const deviceId = "hydroponic-01";

const broker = "wss://4cd4b6d7dbff45c69625740f9da55db7.s1.eu.hivemq.cloud:8884/mqtt";

const options = {
  clientId: "web_" + Math.random().toString(16).substr(2, 8),
  username: "hydroponic",
  password: "12345678tT",
  clean: true,
  keepalive: 60,
  reconnectPeriod: 2000
};

/* ================= TOPIC ================= */
const TOPIC_TELE  = `hydroponic/${deviceId}/telemetry`;
const TOPIC_MODE  = `hydroponic/${deviceId}/cmd/mode`;
const TOPIC_RELAY = `hydroponic/${deviceId}/cmd/relay`;
const TOPIC_SCHED = `hydroponic/${deviceId}/cmd/schedule`;

/* ================= DOM ================= */
const $ = id => document.getElementById(id);

const connDot   = $("connDot");
const connText  = $("connText");
const tempEl    = $("temp");
const humEl     = $("hum");
const modePill  = $("modePill");
const relayPill = $("relayPill");
const logBox    = $("log");
const logCount  = $("logCount");
const lastLog   = $("lastLogTime");

/* ================= MQTT ================= */
const client = mqtt.connect(broker, options);

client.on("connect", () => {
  setConnected();
  client.subscribe(TOPIC_TELE);
  log("MQTT connected");
});

client.on("reconnect", () => log("Reconnecting..."));
client.on("offline", () => setDisconnected());
client.on("error", err => log("Error: " + err.message));

function setConnected(){
  connDot.className = "dot on";
  connText.textContent = "Terhubung";
}

function setDisconnected(){
  connDot.className = "dot off";
  connText.textContent = "Terputus";
}

/* ================= MODE UI ================= */
function updateModeUI(mode) {
  const isManual = mode === "MANUAL";

  modePill.textContent = mode;
  modePill.className = "pill " + mode.toLowerCase();

  $("btnOn").disabled  = !isManual;
  $("btnOff").disabled = !isManual;

  $("btnAuto").classList.toggle("active", !isManual);
  $("btnManual").classList.toggle("active", isManual);
}

/* ================= GRAFIK ================= */
const ctx = document.getElementById("chart").getContext("2d");

const maxPoints = 60;
let labels = [];
let tempData = [];
let humData  = [];

const chart = new Chart(ctx, {
  type: "line",
  data: {
    labels,
    datasets: [
      {
        label: "Suhu (°C)",
        data: tempData,
        borderWidth: 2,
        tension: 0.3
      },
      {
        label: "Kelembapan (%)",
        data: humData,
        borderWidth: 2,
        tension: 0.3
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true }
    }
  }
});

/* ================= RECEIVE ================= */
client.on("message", (topic, payload) => {
  log(topic + " → " + payload);

  if (topic !== TOPIC_TELE) return;

  const d = JSON.parse(payload);

  // === SENSOR ===
  tempEl.textContent = d.temp?.toFixed(1) ?? "--";
  humEl.textContent  = d.hum?.toFixed(1) ?? "--";

  // === MODE & RELAY ===
  updateModeUI(d.mode);

  relayPill.textContent = d.relay ? "ON" : "OFF";
  relayPill.className = "pill " + (d.relay ? "on" : "off");

  // === INFO ===
  $("deviceId").textContent = deviceId;
  $("ts").textContent = d.ts ?? "--";

  // === JADWAL (sinkron dari ESP32) ===
  if (d.schedule) {
    $("scheduleSummary").innerHTML = `
      <i class="fas fa-calendar-check"></i>
      <div>
        <strong>Jadwal Aktif:</strong>
        ON jam ${d.schedule.on1} dan ${d.schedule.on2}
        selama ${d.schedule.duration_min} menit.
      </div>
    `;
  }

  // === UPDATE GRAFIK ===
  const now = new Date().toLocaleTimeString();

  labels.push(now);
  tempData.push(d.temp);
  humData.push(d.hum);

  if (labels.length > maxPoints) {
    labels.shift();
    tempData.shift();
    humData.shift();
  }

  chart.update();
});

/* ================= SEND ================= */
$("btnAuto").onclick   = () => sendMode("AUTO");
$("btnManual").onclick = () => sendMode("MANUAL");

$("btnOn").onclick  = () => sendRelay(1);
$("btnOff").onclick = () => sendRelay(0);

$("btnSetSchedule").onclick = () => {
  const [h1,m1] = $("on1Input").value.split(":");
  const [h2,m2] = $("on2Input").value.split(":");
  const dur = +$("durationInput").value;

  client.publish(TOPIC_SCHED, JSON.stringify({
    on1_hh: +h1, on1_mm: +m1,
    on2_hh: +h2, on2_mm: +m2,
    duration_min: dur
  }));

  $("scheduleSummary").innerHTML = `
    <i class="fas fa-calendar-check"></i>
    <div>
      <strong>Jadwal Aktif:</strong>
      ON jam ${h1}:${m1} dan ${h2}:${m2}
      selama ${dur} menit.
    </div>
  `;
};

function sendMode(mode){
  client.publish(TOPIC_MODE, JSON.stringify({ mode }));
}

function sendRelay(state){
  client.publish(TOPIC_RELAY, JSON.stringify({ state }));
}

/* ================= LOG ================= */
let logs = 0;
function log(msg){
  const t = new Date().toLocaleTimeString();
  logBox.innerHTML += `[${t}] ${msg}<br>`;
  logBox.scrollTop = logBox.scrollHeight;
  logCount.textContent = ++logs;
  lastLog.textContent = t;
}

/* ================= CLOCK ================= */
setInterval(() => {
  $("currentTime").textContent = new Date().toLocaleTimeString();
}, 1000);
