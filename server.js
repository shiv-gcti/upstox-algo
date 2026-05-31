require("dotenv").config();

const express = require("express");
const http = require("http");
const session = require("express-session");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const { getProfile } = require("./profileService");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

global.io = io;

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

app.use(session({
  secret: "supersecret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",

  }
}));

// ================= STATIC =================
app.use(express.static("public"));

// ================= SERVICES =================
const { syncOrders } = require("./syncService");
const { loadToken, isTokenExpired, getAccessToken } = require("./tokenManager");
const { handleWebhook } = require("./webhookController");
const { login, callback } = require("./authController");
const { getPositions } = require("./positionService");
const connectDB = require("./db");
const Trade = require("./models/Trade");
const { startTrading, stopTrading } = require("./control");
const { ensureLocalFile } = require("./instrumentStore");

// ================= OTP =================
const USER_SECRET = process.env.OTP_SECRET;
let tempSecretStore = {};

// ================= LOGIN =================
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.DASHBOARD_USER &&
    password === process.env.DASHBOARD_PASS
  ) {
    req.session.tmpUser = username;

    return res.json({
      step: "otp",
      setup: "/setup-2fa"
    });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

// ================= SETUP GOOGLE AUTH =================
app.get("/setup-2fa", (req, res) => {
  if (!req.session.tmpUser) {
    return res.send("Please login first");
  }

  const secret = speakeasy.generateSecret({
    name: `Algo Trading (${req.session.tmpUser})`
  });

  tempSecretStore[req.session.tmpUser] = secret.base32;

  QRCode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
    if (err) return res.send("QR generation failed");

    res.send(`
      <h2>Scan Google Authenticator</h2>
      <img src="${dataUrl}" />
      <p><b>Key:</b> ${secret.base32}</p>
      <br><a href="/login.html">Go Back</a>
    `);
  });
});

// ================= OTP VERIFY =================
app.post("/verify-otp", (req, res) => {
  const { token } = req.body;

  const secret = tempSecretStore[req.session.tmpUser] || USER_SECRET;

  const verified = speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1
  });

  if (verified && req.session.tmpUser) {
    req.session.user = req.session.tmpUser;

    delete tempSecretStore[req.session.tmpUser];
    delete req.session.tmpUser;

    return res.json({
      success: true,
      redirect: "/"
    });
  }

  return res.status(401).json({ success: false });
});

// ================= AUTH MIDDLEWARE =================
function isAuthenticated(req, res, next) {
  const publicRoutes = [
    "/login",
    "/login.html",
    "/verify-otp",
    "/setup-2fa",
    "/webhook"
  ];

  if (publicRoutes.includes(req.path)) return next();

  if (req.session.user) return next();

  return res.redirect("/login.html");
}

app.use(isAuthenticated);


// ================= ROUTES =================

// ✅ Allow dashboard page to load always
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// (optional but fine)
app.get("/index.html", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


// UPSTOX LOGIN
app.get("/login-upstox", login);
app.get("/callback", callback);


//=================== Logout=======================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");   // ✅ now this will work
  });
});


// ================= WEBHOOK =================
const recentTrades = new Map();

function isRecent(symbol) {
  const now = Date.now();
  if (recentTrades.has(symbol) && now - recentTrades.get(symbol) < 5000) {
    return true;
  }
  recentTrades.set(symbol, now);
  return false;
}

async function isDuplicateTrade(symbol) {
  try {
    const accessToken = getAccessToken();

    const res = await fetch("https://api.upstox.com/v2/portfolio/short-term-positions", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const positions = (await res.json()).data || [];

    return positions.some(p =>
      p.trading_symbol === symbol && p.quantity !== 0
    );

  } catch (err) {
    console.error(err);
    return false;
  }
}

app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    const symbol = data.symbol || data.TS;

    if (isRecent(symbol)) return res.send("Blocked");

    const duplicate = await isDuplicateTrade(symbol);
    if (duplicate) return res.send("Duplicate");

    await handleWebhook(req, res);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

// ================= API ROUTES =================
app.get("/status", (req, res) => {
  res.json({
    server: "running",
    tokenExpired: isTokenExpired(),
    time: new Date()
  });
});

app.get("/positions", async (req, res) => {
  const positions = await getPositions();
  res.json(positions);
});

app.get("/trades", async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const trades = await Trade.find({
    time: { $gte: startOfDay }
  }).sort({ time: -1 });

  res.json(trades);
});

// ================= CONTROL =================
app.get("/start", (req, res) => {
  startTrading();
  res.send("Trading Started");
});

app.get("/stop", (req, res) => {
  stopTrading();
  res.send("Trading Stopped");
});

// ================= PROFILE =================
app.get("/profile", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ loggedIn: false });
    }

    const profile = await getProfile();

    if (!profile) {
      return res.json({ loggedIn: false });
    }

    res.json({
      loggedIn: true,
      name: profile.user_name,
      clientId: profile.user_id
    });

  } catch (err) {
    console.error("Profile error:", err);
    res.json({ loggedIn: false });
  }
});

// ================= SOCKET =================
io.on("connection", (socket) => {
  console.log("Dashboard connected:", socket.id);
});

// ================= START SERVER =================
async function startServer() {
  await connectDB();
  loadToken();
  await ensureLocalFile();

  server.listen(3000, () => {
    console.log("Server running on port 3000");
  });

  setInterval(syncOrders, 2000);
}

startServer();
