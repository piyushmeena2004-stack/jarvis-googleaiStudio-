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
  let mobileSystems = {
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
    },
    system: {
      cpu: 12,
      ram: { used: 4.2, total: 8.0 },
      temp: 38,
      uptime: "12:45:22",
    }
  };

  app.get("/api/mobile/status", (req, res) => {
    // Simulate some system fluctuations
    mobileSystems.system.cpu = Math.floor(Math.random() * 40) + 5;
    mobileSystems.system.ram.used = parseFloat((Math.random() * 2 + 3).toFixed(1));
    mobileSystems.system.temp = Math.floor(Math.random() * 5) + 35;
    res.json(mobileSystems);
  });

  app.post("/api/mobile/control", (req, res) => {
    const { system, action, value } = req.body;
    console.log(`[JARVIS] Mobile Control - ${system}: ${action} to ${value}`);
    
    // Update the local state
    if (system === "connectivity") {
      if (action === "toggle-wifi") {
        mobileSystems.connectivity.wifi = value === "ON" ? "CONNECTED" : "OFF";
      } else if (action === "toggle-bluetooth") {
        mobileSystems.connectivity.bluetooth = value;
      } else if (action === "set-signal") {
        mobileSystems.connectivity.signal = value;
      }
    } else if (system === "display" && action === "set-brightness") {
      mobileSystems.display.brightness = parseInt(value);
    } else if (system === "audio" && action === "set-volume") {
      mobileSystems.audio.volume = parseInt(value);
    }

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
