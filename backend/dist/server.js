"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = __importDefault(require("ws"));
const bot_1 = require("./bot");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({ origin: 'http://131.153.227.56:3000' }));
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
const PORT = parseInt(process.env.PORT || '3001', 10);
// WebSocket server
const wss = new ws_1.default.Server({ port: 3002 });
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
    const logs = (0, bot_1.getTransactionLogs)();
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.default.OPEN) {
            client.send(JSON.stringify({ type: 'transaction_logs', data: logs }));
        }
    });
}, 5000);
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/main-wallet', async (req, res) => {
    try {
        const wallet = await (0, bot_1.getMainWallet)();
        res.json(wallet);
    }
    catch (error) {
        console.error(`Error in /api/main-wallet: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/wallets', (req, res) => {
    res.json((0, bot_1.getWallets)());
});
app.get('/api/config', (req, res) => {
    try {
        const config = (0, bot_1.getConfig)();
        res.json(config);
    }
    catch (error) {
        console.error(`Error in /api/config: ${error.message}`);
        res.status(500).json({ error: `Failed to load configuration: ${error.message}`, details: error.message });
    }
});
app.post('/api/config', (req, res) => {
    try {
        (0, bot_1.updateConfig)(req.body);
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in POST /api/config: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});
app.get('/api/transaction-logs', (req, res) => {
    res.json((0, bot_1.getTransactionLogs)());
});
app.post('/api/create-wallets', async (req, res) => {
    try {
        await (0, bot_1.createWallets)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/create-wallets: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/fund-wallets', async (req, res) => {
    try {
        const { fundAmount } = req.body;
        await (0, bot_1.fundWallets)(fundAmount);
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/fund-wallets: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/create-token-accounts', async (req, res) => {
    try {
        await (0, bot_1.createTokenAccounts)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/create-token-accounts: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/restore-sol', async (req, res) => {
    try {
        await (0, bot_1.restoreSolToMainWallet)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/restore-sol: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/start-trade', async (req, res) => {
    try {
        (0, bot_1.startTrade)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/start-trade: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/stop-trade', async (req, res) => {
    try {
        (0, bot_1.stopTrade)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/stop-trade: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/trade-wallets', async (req, res) => {
    try {
        await (0, bot_1.tradeWallets)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/trade-wallets: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/sell-all', async (req, res) => {
    try {
        await (0, bot_1.sellAllTokens)();
        res.json({ success: true });
    }
    catch (error) {
        console.error(`Error in /api/sell-all: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server running on port 3002`);
});
