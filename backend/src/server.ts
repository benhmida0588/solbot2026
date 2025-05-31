import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import {
  getMainWallet,
  getWallets,
  getConfig,
  updateConfig,
  getTransactionLogs,
  createWallets,
  fundWallets,
  createTokenAccounts,
  restoreSolToMainWallet,
  startTrade,
  stopTrade,
  tradeWallets,
  sellAllTokens,
} from './bot';

const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://131.153.227.56:3000' }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const PORT: number = parseInt(process.env.PORT || '3001', 10);

// WebSocket server
const wss = new WebSocket.Server({ port: 3002 });
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('message', (message) => {
    console.log(`Received WebSocket message: ${message}`);
  });
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Broadcast transaction logs
setInterval(() => {
  const logs = getTransactionLogs();
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'transaction_logs', data: logs }));
    }
  });
}, 5000);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/main-wallet', async (req, res) => {
  try {
    const wallet = await getMainWallet();
    res.json(wallet);
  } catch (error: any) {
    console.error(`Error in /api/main-wallet: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallets', (req, res) => {
  res.json(getWallets());
});

app.get('/api/config', (req, res) => {
  try {
    const config = getConfig();
    res.json(config);
  } catch (error: any) {
    console.error(`Error in /api/config: ${error.message}`);
    res.status(500).json({ error: `Failed to load configuration: ${error.message}`, details: error.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    updateConfig(req.body);
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in POST /api/config: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/transaction-logs', (req, res) => {
  res.json(getTransactionLogs());
});

app.post('/api/create-wallets', async (req, res) => {
  try {
    await createWallets();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/create-wallets: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fund-wallets', async (req, res) => {
  try {
    const { fundAmount } = req.body;
    await fundWallets(fundAmount);
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/fund-wallets: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/create-token-accounts', async (req, res) => {
  try {
    await createTokenAccounts();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/create-token-accounts: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/restore-sol', async (req, res) => {
  try {
    await restoreSolToMainWallet();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/restore-sol: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/start-trade', async (req, res) => {
  try {
    startTrade();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/start-trade: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stop-trade', async (req, res) => {
  try {
    stopTrade();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/stop-trade: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trade-wallets', async (req, res) => {
  try {
    await tradeWallets();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/trade-wallets: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sell-all', async (req, res) => {
  try {
    await sellAllTokens();
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error in /api/sell-all: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on port 3002`);
});