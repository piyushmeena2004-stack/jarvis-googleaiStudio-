import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Mobile Systems API ---
  const mobileSystems = {
    battery: {
      level: 78,
      status: "DISCHARGING",
      health: "GOOD",
    },
    display: {
      brightness: 65,
      mode: "DARK",
      refreshRate: "120Hz",
    },
    audio: {
      volume: 70,
      mode: "NORMAL",
    },
    connectivity: {
      signal: "5G",
      wifi: "CONNECTED",
      bluetooth: "ON",
    },
    storage: {
      used: 128,
      total: 256,
    }
  };

  app.get("/api/mobile/status", (req, res) => {
    res.json(mobileSystems);
  });

  app.post("/api/mobile/control", (req, res) => {
    const { system, action, value } = req.body;
    console.log(`[JARVIS] Mobile Control - ${system}: ${action} to ${value}`);
    res.json({ status: "SUCCESS", message: `Mobile ${system} adjusted to ${value}.` });
  });

  // System Logs for Mobile
  let logs: string[] = [
    "Mobile OS kernel initialized.",
    "Scanning background processes...",
    "Optimizing RAM allocation...",
    "Secure enclave active.",
  ];

  app.get("/api/mobile/logs", (req, res) => {
    // Add a random log occasionally
    const randomLogs = [
      "Optimizing battery usage...",
      "Scanning for malware...",
      "Syncing cloud data...",
      "Updating system apps...",
      "Checking network stability...",
    ];
    if (Math.random() > 0.7) {
      logs.push(randomLogs[Math.floor(Math.random() * randomLogs.length)]);
      if (logs.length > 10) logs.shift();
    }
    res.json(logs);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[JARVIS] Server running on http://localhost:${PORT}`);
  });
}

startServer();
