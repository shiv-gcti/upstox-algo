const socket = io();

let tradeData = [];
let positionData = [];

// DOM shortcuts
const signals = document.getElementById("signals");
const orders = document.getElementById("orders");
const profile = document.getElementById("profile");
const controlStatus = document.getElementById("controlStatus");
const positionsTable = document.getElementById("positionsTable");
const tradesTable = document.getElementById("tradesTable");
const pnl = document.getElementById("pnl");
const daily = document.getElementById("daily");

// ================= SOCKET =================
socket.on("signal", d => {
  const li = document.createElement("li");
  li.innerText = JSON.stringify(d);
  signals.prepend(li);
});

socket.on("order", d => {
  const li = document.createElement("li");
  li.innerText = JSON.stringify(d);
  orders.prepend(li);
});

// ================= CONTROL =================
async function startTrading() { await fetch("/start"); }
async function stopTrading() { await fetch("/stop"); }
function loginUpstox() { window.location.href = "/login-upstox"; }

// ================= PROFILE =================
async function loadProfile() {
  const res = await fetch("/profile");
  const d = await res.json();

  profile.innerText = d.loggedIn
    ? `${d.name} (${d.clientId})`
    : "Not Logged In";
}

// ================= CONTROL STATUS =================
async function loadControl() {
  const res = await fetch("/control");
  const d = await res.json();

  controlStatus.innerHTML = d.trading
    ? '<span class="dot on"></span> Trading ON'
    : '<span class="dot off"></span> Trading OFF';
}

// ================= POSITIONS =================
async function loadPositions() {
  const res = await fetch("/positions");
  const data = await res.json();

  positionData = data;

  let total = 0;
  positionsTable.innerHTML = "";

  data.forEach(p => {
    const type = p.quantity >= 0 ? "BUY" : "SELL";
    const pnlVal = p.pnl || 0;
    const cls = pnlVal >= 0 ? "profit" : "loss";

    positionsTable.innerHTML += `
      <tr>
        <td>${p.trading_symbol}</td>
        <td>${Math.abs(p.quantity)}</td>
        <td>${type}</td>
        <td>${p.average_price}</td>
        <td>${p.last_price}</td>
        <td class="${cls}">${pnlVal}</td>
      </tr>
    `;

    total += pnlVal;
  });

  pnl.innerText = total.toFixed(2);
}

// ================= TRADES (INTRADAY ONLY) =================
async function loadTrades() {
  const res = await fetch("/trades?type=intraday");
  const data = await res.json();

  tradeData = data;
  tradesTable.innerHTML = "";

  data.forEach(t => {
  const dt = new Date(t.time);

  const date = dt.toLocaleDateString();
  const time = dt.toLocaleTimeString();

  const cls = t.pnl >= 0 ? "profit" : "loss";

  const tradedPrice =
    t.price || t.avg_price || t.entry_price || 0;

  tradesTable.innerHTML += `
    <tr>
      <td>${date}</td>
      <td>${time}</td>
      <td>${t.instrument}</td>
      <td>${t.quantity}</td>
      <td>${t.side}</td>
      <td>${tradedPrice}</td>
      <td class="${cls}">${t.status}</td>
    </tr>
  `;
});}

// ================= DAILY =================
async function loadPnL() {
  const res = await fetch("/pnl");
  const d = await res.json();

  daily.innerText = `Trades: ${d.totalTrades} | PnL: ${d.totalPnL}`;
}

// ================= AUTO REFRESH =================
setInterval(() => {
  loadControl();
  loadProfile();
  loadPositions();
  loadTrades();
  loadPnL();
}, 3000);

// ================= INIT =================
loadControl();
loadProfile();
loadPositions();
loadTrades();
loadPnL();

//============ Sign in =====================

let isLoggedIn = false;

async function checkUserLogin() {
  const res = await fetch("/profile");
  const data = await res.json();

  const btn = document.getElementById("authBtn");

  if (data.loggedIn) {
    isLoggedIn = true;
    btn.innerText = "Sign Out";
  } else {
    isLoggedIn = false;
    btn.innerText = "Sign In";
  }
}

function handleAuth() {
  if (isLoggedIn) {
    window.location.href = "/logout";
  } else {
    window.location.href = "/login.html";
  }
}

// run on page load
checkUserLogin();
