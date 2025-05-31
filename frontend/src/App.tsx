import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  createTheme,
  ThemeProvider,
  CssBaseline,
} from '@mui/material';
import axios from 'axios';
import WalletTable from './components/WalletTable';
import ConfigForm from './components/ConfigForm';
import TransactionLog from './components/TransactionLog';
import { Config } from './types';

interface MainWallet {
  publicKey: string;
  balance: number;
}

interface Wallet {
  publicKey: string;
  solBalance: number;
  tokenBalances: { [key: string]: number };
  tradeStatus: string;
}

interface TransactionLogEntry {
  wallet: string;
  type: string;
  signature: string;
  status: string;
  details: string;
  timestamp: string;
}

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00e676' },
    secondary: { main: '#ff4081' },
    background: { default: '#121212', paper: '#1e1e1e' },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, textTransform: 'none', padding: '8px 16px' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 12, padding: 16 },
      },
    },
  },
});

const App: React.FC = () => {
  const [mainWallet, setMainWallet] = useState<MainWallet | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactionLogs, setTransactionLogs] = useState<TransactionLogEntry[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [fundAmount, setFundAmount] = useState('0.001');

  const fetchData = async () => {
    try {
      const [mainWalletRes, walletsRes, configRes, logsRes] = await Promise.all([
        axios.get('http://131.153.227.56:3001/api/main-wallet', { timeout: 10000 }),
        axios.get('http://131.153.227.56:3001/api/wallets', { timeout: 10000 }),
        axios.get('http://131.153.227.56:3001/api/config', { timeout: 10000 }),
        axios.get('http://131.153.227.56:3001/api/transaction-logs', { timeout: 10000 }),
      ]);
      console.log('Main wallet response:', mainWalletRes.data);
      setMainWallet(mainWalletRes.data);
      setWallets(walletsRes.data);
      setConfig(configRes.data);
      setTransactionLogs(logsRes.data);
    } catch (err) {
      console.error('Error fetching initial data:', err);
      alert('Failed to fetch data. Check console for details.');
    }
  };

  useEffect(() => {
    fetchData();

    const ws = new WebSocket('ws://131.153.227.56:3002');
    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message:', data);
      if (data.type === 'mainWallet') setMainWallet(data.payload);
      if (data.type === 'wallets') setWallets(data.payload);
      if (data.type === 'transactionLogs') setTransactionLogs(data.payload);
      if (data.type === 'config') setConfig(data.payload);
    };
    ws.onerror = (err) => console.error('WebSocket error:', err);
    ws.onclose = () => console.log('WebSocket closed');
    return () => ws.close();
  }, []);

  const handleCreateWallets = async () => {
    try {
      await axios.post('http://131.153.227.56:3001/api/create-wallets', {}, { timeout: 30000 });
      const walletsRes = await axios.get('http://131.153.227.56:3001/api/wallets', { timeout: 10000 });
      setWallets(walletsRes.data);
      alert('Wallets created successfully');
    } catch (err) {
      console.error('Error creating wallets:', err);
      alert('Error creating wallets: ' + (err as Error).message);
    }
  };

  const handleFundWallets = async () => {
    try {
      const amount = parseFloat(fundAmount);
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid positive amount');
        return;
      }
      const response = await axios.post('http://131.153.227.56:3001/api/fund-wallets', {
        fundAmount: amount * 1_000_000_000,
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      console.log('Fund wallets response:', response.data);
      alert('Wallets funded successfully');
      fetchData();
    } catch (err) {
      console.error('Fund wallets error:', err);
      let errorMessage = 'Failed to fund wallets';
      if (axios.isAxiosError(err)) {
        console.error('Axios details:', {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          data: err.response?.data,
          url: err.config?.url
        });
        if (err.code === 'ECONNABORTED') {
          errorMessage = 'Request timed out. The server may be busy or unresponsive.';
        } else if (err.response) {
          errorMessage = `Server error: ${err.response.data?.error || 'Unknown error'}`;
        }
      }
      alert(errorMessage);
    }
  };

  const handleTradeWallets = async () => {
    try {
      await axios.post('http://131.153.227.56:3001/api/trade-wallets', {}, { timeout: 30000 });
      alert('Trading started successfully');
    } catch (err) {
      console.error('Error trading wallets:', err);
      alert('Error trading wallets: ' + (err as Error).message);
    }
  };

  const handleConfigUpdate = async (newConfig: Partial<Config>) => {
    try {
      await axios.post('http://131.153.227.56:3001/api/config', newConfig, { timeout: 30000 });
      setConfig((prev) => ({ ...prev, ...newConfig } as Config));
      alert('Config updated successfully');
    } catch (err) {
      console.error('Error updating config:', err);
      alert('Error updating config: ' + (err as Error).message);
    }
  };

  const handleRestoreSol = async () => {
    try {
      const response = await axios.post('http://131.153.227.56:3001/api/restore-sol', {}, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      console.log('Restore SOL response:', response.data);
      alert('SOL restored successfully');
      fetchData();
    } catch (err) {
      console.error('Restore SOL error:', err);
      let errorMessage = 'Failed to restore SOL';
      if (axios.isAxiosError(err)) {
        console.error('Axios details:', {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          data: err.response?.data,
          url: err.config?.url
        });
        if (err.code === 'ECONNABORTED') {
          errorMessage = 'Request timed out. The server may be busy or unresponsive.';
        } else if (err.response) {
          errorMessage = `Server error: ${err.response.data?.error || 'Unknown error'}`;
        }
      }
      alert(errorMessage);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" gutterBottom align="center" color="primary">
            Solana Trading Bot
          </Typography>
          {mainWallet ? (
            <Paper elevation={3} sx={{ p: 3, mb: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.primary">
                Main Wallet: {mainWallet.publicKey}
              </Typography>
              <Typography color="text.secondary">
                Balance: {(mainWallet.balance / 1_000_000_000).toFixed(4)} SOL
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                onClick={fetchData}
                sx={{ mt: 2 }}
              >
                Refresh Balance
              </Button>
            </Paper>
          ) : (
            <Paper elevation={3} sx={{ p: 3, mb: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Loading main wallet...
              </Typography>
            </Paper>
          )}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Wallet Management
                </Typography>
                <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Fund Amount (SOL)"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    type="number"
                    inputProps={{ step: '0.001', min: '0' }}
                    sx={{ flex: '1 1 200px' }}
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleFundWallets}
                  >
                    Fund Wallets
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleRestoreSol}
                  >
                    Restore SOL
                  </Button>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleCreateWallets}
                  >
                    Create Wallets
                  </Button>
                </Box>
                <WalletTable
                  wallets={wallets}
                  onTradeWallets={handleTradeWallets}
                />
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Trading Configuration
                </Typography>
                <ConfigForm config={config} onConfigUpdate={handleConfigUpdate} />
              </Paper>
            </Grid>
            <Grid item xs={12}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Transaction Logs
                </Typography>
                <TransactionLog logs={transactionLogs} />
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

export default App;