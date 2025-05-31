import React from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography } from '@mui/material';

interface TransactionLogEntry {
  wallet: string;
  type: string;
  signature: string;
  status: string;
  details: string;
  timestamp: string;
}

interface TransactionLogProps {
  logs: TransactionLogEntry[];
}

const TransactionLog: React.FC<TransactionLogProps> = ({ logs }) => {
  return (
    <TableContainer component={Paper} elevation={0}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Wallet</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Signature</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Details</TableCell>
            <TableCell>Timestamp</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Typography color="text.secondary">No transactions</Typography>
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log, index) => (
              <TableRow key={index}>
                <TableCell>{log.wallet.slice(0, 8)}...</TableCell>
                <TableCell>{log.type}</TableCell>
                <TableCell>{log.signature.slice(0, 8)}...</TableCell>
                <TableCell>{log.status}</TableCell>
                <TableCell>{log.details}</TableCell>
                <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default TransactionLog;