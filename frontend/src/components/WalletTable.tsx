import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Typography,
  Box,
} from '@mui/material';

interface Wallet {
  publicKey: string;
  solBalance: number;
  tokenBalances: { [key: string]: number };
  tradeStatus: string;
}

interface WalletTableProps {
  wallets: Wallet[];
  onTradeWallets: () => void;
}

const WalletTable: React.FC<WalletTableProps> = ({ wallets, onTradeWallets }) => {
  return (
    <TableContainer component={Paper} elevation={0} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Public Key</TableCell>
            <TableCell align="right">SOL Balance</TableCell>
            <TableCell align="right">Token Balances</TableCell>
            <TableCell align="right">Trade Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {wallets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} align="center">
                <Typography color="text.secondary">No wallets created</Typography>
              </TableCell>
            </TableRow>
          ) : (
            wallets.map((wallet) => (
              <TableRow key={wallet.publicKey}>
                <TableCell>
                  {wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-8)}
                </TableCell>
                <TableCell align="right">
                  {(wallet.solBalance / 1_000_000_000).toFixed(4)} SOL
                </TableCell>
                <TableCell align="right">
                  {Object.entries(wallet.tokenBalances)
                    .map(([token, amount]) => `${token}: ${amount}`)
                    .join(', ') || 'None'}
                </TableCell>
                <TableCell align="right">{wallet.tradeStatus}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Box sx={{ mt: 2, textAlign: 'right' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={onTradeWallets}
          disabled={wallets.length === 0}
        >
          Trade Wallets
        </Button>
      </Box>
    </TableContainer>
  );
};

export default WalletTable;