import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { Config } from '../types';

interface ConfigFormProps {
  config: Config | null;
  onConfigUpdate: (newConfig: Partial<Config>) => void;
}

const ConfigForm: React.FC<ConfigFormProps> = ({ config, onConfigUpdate }) => {
  const [swapAmount, setSwapAmount] = useState(config?.swapAmount?.toString() || '0.01');
  const [tradeMode, setTradeMode] = useState(config?.tradeMode || 'random');
  const [concurrencyLimit, setConcurrencyLimit] = useState(config?.concurrencyLimit?.toString() || '1');
  const [tokenAddress, setTokenAddress] = useState(config?.tokenAddress || '');
  const [tokenListJson, setTokenListJson] = useState(JSON.stringify(config?.tokenList || [], null, 2));
  const [jsonError, setJsonError] = useState('');
  const [isTrading, setIsTrading] = useState(config?.isTrading || false);

  const handleConfigSubmit = async () => {
    try {
      const parsedTokenList = JSON.parse(tokenListJson);
      if (!Array.isArray(parsedTokenList)) throw new Error('Token list must be an array');
      for (const token of parsedTokenList) {
        if (!token.symbol || !token.mint) throw new Error('Each token must have symbol and mint');
      }
      const newConfig: Partial<Config> = {
        swapAmount: parseFloat(swapAmount),
        tradeMode,
        concurrencyLimit: parseInt(concurrencyLimit),
        tokenAddress,
        tokenList: parsedTokenList,
      };
      await axios.post('http://131.153.227.56:3001/api/config', newConfig, { timeout: 30000 });
      onConfigUpdate(newConfig);
      setJsonError('');
      alert('Configuration updated successfully');
    } catch (err: any) {
      setJsonError(`Invalid JSON or server error: ${err.message}`);
      alert('Failed to update configuration');
    }
  };

  const handleStartTrade = async () => {
    try {
      await axios.post('http://131.153.227.56:3001/api/start-trade', {}, { timeout: 30000 });
      setIsTrading(true);
      onConfigUpdate({ isTrading: true });
      alert('Trading started successfully');
    } catch (err: any) {
      console.error('Error starting trade:', err);
      alert(`Failed to start trading: ${err.message}`);
    }
  };

  const handleStopTrade = async () => {
    try {
      await axios.post('http://131.153.227.56:3001/api/stop-trade', {}, { timeout: 30000 });
      setIsTrading(false);
      onConfigUpdate({ isTrading: false });
      alert('Trading stopped successfully');
    } catch (err: any) {
      console.error('Error stopping trade:', err);
      alert(`Failed to stop trading: ${err.message}`);
    }
  };

  const handleSellAllTokens = async () => {
    try {
      await axios.post('http://131.153.227.56:3001/api/sell-all-tokens', {}, { timeout: 30000 });
      alert('All tokens sold successfully');
    } catch (err: any) {
      console.error('Error selling all tokens:', err);
      alert(`Failed to sell all tokens: ${err.message}`);
    }
  };

  return (
    <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        label="Swap Amount (SOL)"
        value={swapAmount}
        onChange={(e) => setSwapAmount(e.target.value)}
        type="number"
        inputProps={{ step: '0.01' }}
      />
      <FormControl>
        <InputLabel>Trade Mode</InputLabel>
        <Select value={tradeMode} onChange={(e) => setTradeMode(e.target.value)}>
          <MenuItem value="buy">Buy</MenuItem>
          <MenuItem value="sell">Sell</MenuItem>
          <MenuItem value="random">Random</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label="Concurrency Limit"
        value={concurrencyLimit}
        onChange={(e) => setConcurrencyLimit(e.target.value)}
        type="number"
        inputProps={{ min: '1' }}
      />
      <TextField
        label="Token Address"
        value={tokenAddress}
        onChange={(e) => setTokenAddress(e.target.value)}
      />
      <TextField
        label="Token List (JSON)"
        value={tokenListJson}
        onChange={(e) => setTokenListJson(e.target.value)}
        multiline
        rows={4}
        error={!!jsonError}
        helperText={jsonError}
      />
      {config?.tokenList && config.tokenList.length > 0 && (
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            Current Token List
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Mint</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {config.tokenList.map((token, index) => (
                <TableRow key={index}>
                  <TableCell>{token.symbol}</TableCell>
                  <TableCell>{token.mint}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" color="primary" onClick={handleConfigSubmit}>
          Update Config
        </Button>
        <Button
          variant="contained"
          color={isTrading ? 'secondary' : 'primary'}
          onClick={isTrading ? handleStopTrade : handleStartTrade}
        >
          {isTrading ? 'Stop Trade' : 'Start Trade'}
        </Button>
        <Button variant="contained" color="warning" onClick={handleSellAllTokens}>
          Sell All Tokens
        </Button>
      </Box>
    </Box>
  );
};

export default ConfigForm;