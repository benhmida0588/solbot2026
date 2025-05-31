import * as web3 from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bs58 from 'bs58';
import fetch from 'node-fetch';

dotenv.config({ path: '/root/solana-trading-bot/.env' });

// Devnet connection
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const connection = new web3.Connection(RPC_URL, 'processed');
console.log(`Using Solana connection: ${connection.rpcEndpoint}`);

// Devnet program IDs
const TOKEN_PROGRAM_ID = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new web3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const WALLETS_FILE = path.resolve('/root/solana-trading-bot/wallets.json');
const CONFIG_FILE = path.resolve('/root/solana-trading-bot/config.json');
const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const TX_FEE = 5000;
const ATA_CREATION_COST = 10000000;

interface Config {
  swapAmount: number;
  tradeMode: 'buy' | 'sell' | 'random';
  concurrencyLimit: number;
  tokenAddress: string;
  swapAmountLamports: number;
  tokenList: string[];
  isTrading: boolean;
}

interface Wallet {
  publicKey: string;
  keypair: web3.Keypair;
  solBalance: number;
  tokenBalances: { [key: string]: number };
  tradeStatus: string;
  tokenAccounts: { [mint: string]: string };
}

interface TransactionLogEntry {
  wallet: string;
  type: string;
  signature: string;
  status: string;
  details: string;
  timestamp: string;
}

let mainWallet: { publicKey: web3.PublicKey; keypair: web3.Keypair; balance?: number } | null = null;
let wallets: Wallet[] = [];
let transactionLogs: TransactionLogEntry[] = [];
let config: Config;
let tradingInterval: NodeJS.Timeout | null = null;

function loadMainWallet(): void {
  const secretKey = process.env.MAIN_WALLET_PRIVATE_KEY;
  if (!secretKey) throw new Error('MAIN_WALLET_PRIVATE_KEY missing in .env');
  try {
    const keypair = web3.Keypair.fromSecretKey(bs58.decode(secretKey));
    mainWallet = { publicKey: keypair.publicKey, keypair };
    console.log(`Loaded main wallet: ${mainWallet.publicKey.toBase58()}`);
  } catch (err: any) {
    console.error(`Failed to load main wallet: ${err.message}`);
    throw new Error(`Failed to load main wallet: ${err.message}`);
  }
}

function loadWallets(): void {
  try {
    if (!fs.existsSync(WALLETS_FILE)) {
      console.log('wallets.json not found, initializing empty wallets');
      return;
    }
    const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
    wallets = data.map((w: any) => ({
      publicKey: w.publicKey,
      keypair: web3.Keypair.fromSecretKey(new Uint8Array(w.secretKey)),
      solBalance: w.solBalance || 0,
      tokenBalances: w.tokenBalances || {},
      tradeStatus: w.tradeStatus || 'idle',
      tokenAccounts: w.tokenAccounts || {},
    }));
    console.log(`Loaded ${wallets.length} wallets`);
  } catch (err: any) {
    console.error(`Error loading wallets: ${err.message}`);
    transactionLogs.push({
      wallet: '',
      type: 'load_wallets',
      signature: '',
      status: 'failed',
      details: `Failed to load wallets: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
    wallets = [];
  }
}

function loadConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      const errorMsg = `config.json not found at ${CONFIG_FILE}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (
      !data.swapAmount ||
      !['buy', 'sell', 'random'].includes(data.tradeMode) ||
      !data.concurrencyLimit ||
      !data.tokenAddress ||
      !data.swapAmountLamports ||
      !data.tokenList ||
      !Array.isArray(data.tokenList)
    ) {
      const errorMsg = 'Invalid config: missing or invalid fields (swapAmount, tradeMode, concurrencyLimit, tokenAddress, swapAmountLamports, tokenList)';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    try {
      new web3.PublicKey(data.tokenAddress);
    } catch (err) {
      const errorMsg = `Invalid tokenAddress: ${data.tokenAddress}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    const loadedConfig: Config = {
      swapAmount: data.swapAmount,
      tradeMode: data.tradeMode,
      concurrencyLimit: data.concurrencyLimit,
      tokenAddress: data.tokenAddress,
      swapAmountLamports: data.swapAmountLamports,
      tokenList: data.tokenList,
      isTrading: data.isTrading || false,
    };
    console.log(`Loaded config from ${CONFIG_FILE}: ${JSON.stringify(loadedConfig, null, 2)}`);
    return loadedConfig;
  } catch (err: any) {
    console.error(`Error loading config from ${CONFIG_FILE}: ${err.message}`);
    transactionLogs.push({
      wallet: '',
      type: 'load_config',
      signature: '',
      status: 'failed',
      details: `Failed to load config: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
    throw err;
  }
}

function saveConfig(): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`Saved config to ${CONFIG_FILE}`);
  } catch (err: any) {
    console.error(`Error saving config to ${CONFIG_FILE}: ${err.message}`);
  }
}

function saveWallets(): void {
  try {
    fs.writeFileSync(
      WALLETS_FILE,
      JSON.stringify(
        wallets.map(w => ({
          publicKey: w.publicKey,
          secretKey: Array.from(w.keypair.secretKey),
          solBalance: w.solBalance,
          tokenBalances: w.tokenBalances,
          tradeStatus: w.tradeStatus,
          tokenAccounts: w.tokenAccounts,
        }))
      )
    );
    console.log(`Saved wallets to ${WALLETS_FILE}`);
  } catch (err: any) {
    console.error(`Error saving wallets: ${err.message}`);
  }
}

async function retry<T>(fn: () => Promise<T>, retries: number = 3, delay: number = 1000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Retry limit reached');
}

export async function getMainWallet() {
  if (!mainWallet) {
    loadMainWallet();
  }
  if (!mainWallet) {
    throw new Error('Main wallet failed to load');
  }
  const balance = await connection.getBalance(mainWallet.publicKey, 'processed');
  mainWallet.balance = balance;
  return { publicKey: mainWallet.publicKey.toBase58(), balance };
}

export function getWallets() {
  return wallets;
}

export function getConfig() {
  config = loadConfig();
  return config;
}

export function updateConfig(newConfig: Partial<Config>) {
  config = { ...config, ...newConfig };
  saveConfig();
}

export function getTransactionLogs() {
  return transactionLogs;
}

export async function createWallets() {
  wallets = Array.from({ length: 2 }, () => {
    const keypair = web3.Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      keypair,
      solBalance: 0,
      tokenBalances: {},
      tradeStatus: 'idle',
      tokenAccounts: {},
    };
  });
  saveWallets();
  console.log('Created 2 wallets');
}

export async function fundWallets(fundAmount: number) {
  if (!mainWallet) loadMainWallet();
  if (!mainWallet) throw new Error('Main wallet not loaded');
  if (!wallets.length) throw new Error('No wallets created');
  if (fundAmount <= 0) throw new Error('Invalid fund amount');

  console.log(`Funding ${wallets.length} wallets with ${fundAmount / web3.LAMPORTS_PER_SOL} SOL`);
  const signatures: string[] = [];

  for (const wallet of wallets) {
    try {
      const walletPubkey = new web3.PublicKey(wallet.publicKey);
      const transaction = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: mainWallet.publicKey,
          toPubkey: walletPubkey,
          lamports: fundAmount,
        })
      );

      console.log(`Sending SOL funding transaction for ${walletPubkey.toBase58()}`);
      const signature = await web3.sendAndConfirmTransaction(connection, transaction, [mainWallet.keypair], {
        commitment: 'processed',
        maxRetries: 3,
      });
      signatures.push(signature);
      wallet.solBalance += fundAmount;
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'funding',
        signature,
        status: 'success',
        details: `Funded ${fundAmount / web3.LAMPORTS_PER_SOL} SOL`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    } catch (err: any) {
      let errorMessage = err.message || 'Unknown error';
      if (err instanceof web3.SendTransactionError) {
        errorMessage = `Simulation failed. Message: ${err.message}`;
        const logs = await err.getLogs(connection);
        errorMessage += `. Logs: ${JSON.stringify(logs)}`;
      }
      console.error(`Funding error for ${wallet.publicKey}: ${errorMessage}`);
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'funding',
        signature: '',
        status: 'failed',
        details: `Funding failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export async function createTokenAccounts() {
  if (!mainWallet) loadMainWallet();
  if (!mainWallet) throw new Error('Main wallet not loaded');
  if (!wallets.length) throw new Error('No wallets created');
  const tokenMint = config.tokenAddress ? new web3.PublicKey(config.tokenAddress) : null;
  if (!tokenMint) throw new Error('No token mint configured');

  console.log(`Creating token accounts for mint: ${tokenMint.toBase58()}`);
  const signatures: string[] = [];

  for (const wallet of wallets) {
    try {
      const walletPubkey = new web3.PublicKey(wallet.publicKey);
      const tokenAccount = await splToken.getAssociatedTokenAddress(
        tokenMint,
        walletPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      console.log(`Checking ATA for ${walletPubkey.toBase58()}: ${tokenAccount.toBase58()}`);
      if (await connection.getAccountInfo(tokenAccount)) {
        console.log(`ATA already exists for ${walletPubkey.toBase58()}`);
        wallet.tokenAccounts[tokenMint.toString()] = tokenAccount.toBase58();
        saveWallets();
        continue;
      }

      const transaction = new web3.Transaction().add(
        splToken.createAssociatedTokenAccountInstruction(
          mainWallet.publicKey,
          tokenAccount,
          walletPubkey,
          tokenMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      console.log(`Creating ATA for ${walletPubkey.toBase58()}`);
      const signature = await web3.sendAndConfirmTransaction(connection, transaction, [mainWallet.keypair], {
        commitment: 'processed',
        maxRetries: 3,
      });
      signatures.push(signature);
      wallet.tokenAccounts[tokenMint.toString()] = tokenAccount.toBase58();
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'ata_creation',
        signature,
        status: 'success',
        details: `Created ATA for ${tokenMint.toBase58()}`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    } catch (err: any) {
      let errorMessage = err.message || 'Unknown error';
      if (err instanceof web3.SendTransactionError) {
        errorMessage = `Simulation failed. Message: ${err.message}`;
        const logs = await err.getLogs(connection);
        errorMessage += `. Logs: ${JSON.stringify(logs)}`;
      }
      console.error(`ATA creation error for ${wallet.publicKey}: ${errorMessage}`);
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'ata_creation',
        signature: '',
        status: 'failed',
        details: `ATA creation failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export async function restoreSolToMainWallet() {
  if (!mainWallet) loadMainWallet();
  if (!mainWallet) throw new Error('Main wallet not loaded');
  if (!wallets.length) throw new Error('No wallets created');

  for (const wallet of wallets) {
    try {
      const walletPubkey = new web3.PublicKey(wallet.publicKey);
      const balance = await connection.getBalance(walletPubkey, 'processed');
      const transferAmount = balance - TX_FEE;

      if (transferAmount <= 0) {
        console.log(`Skipping ${wallet.publicKey}: Insufficient balance: ${balance / web3.LAMPORTS_PER_SOL} SOL`);
        transactionLogs.push({
          wallet: wallet.publicKey,
          type: 'restore',
          signature: '',
          status: 'skipped',
          details: `Insufficient balance: ${balance / web3.LAMPORTS_PER_SOL} SOL`,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const transaction = new web3.Transaction().add(
        web3.SystemProgram.transfer({
          fromPubkey: walletPubkey,
          toPubkey: mainWallet.publicKey,
          lamports: transferAmount,
        })
      );

      const signature = await web3.sendAndConfirmTransaction(connection, transaction, [wallet.keypair], {
        commitment: 'processed',
        maxRetries: 3,
      });

      wallet.solBalance = TX_FEE;
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'restore',
        signature,
        status: 'success',
        details: `Restored ${transferAmount / web3.LAMPORTS_PER_SOL} SOL`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    } catch (err: any) {
      console.error(`Restore error for ${wallet.publicKey}: ${err.message}`);
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'restore',
        signature: '',
        status: 'failed',
        details: `Restore failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

async function ensureTokenAccount(wallet: Wallet, mint: web3.PublicKey): Promise<web3.PublicKey> {
  const walletPubkey = new web3.PublicKey(wallet.publicKey);
  const mintStr = mint.toString();

  if (wallet.tokenAccounts[mintStr]) {
    return new web3.PublicKey(wallet.tokenAccounts[mintStr]);
  }

  const tokenAccount = await splToken.getAssociatedTokenAddress(
    mint,
    walletPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  if (await connection.getAccountInfo(tokenAccount)) {
    wallet.tokenAccounts[mintStr] = tokenAccount.toBase58();
    saveWallets();
    return tokenAccount;
  }

  if (!mainWallet) loadMainWallet();
  if (!mainWallet) throw new Error('Main wallet not loaded');
  const transaction = new web3.Transaction().add(
    splToken.createAssociatedTokenAccountInstruction(
      mainWallet.publicKey,
      tokenAccount,
      walletPubkey,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const signature = await web3.sendAndConfirmTransaction(connection, transaction, [mainWallet.keypair], {
    commitment: 'processed',
    maxRetries: 3,
  });

  wallet.tokenAccounts[mintStr] = tokenAccount.toBase58();
  saveWallets();
  transactionLogs.push({
    wallet: wallet.publicKey,
    type: 'ata_creation',
    signature,
    status: 'success',
    details: `Created ATA for ${mintStr}`,
    timestamp: new Date().toISOString(),
  });

  return tokenAccount;
}

export function startTrade() {
  try {
    console.log('Attempting to start trade...');
    console.log(`Config: ${JSON.stringify(config, null, 2)}`);
    console.log(`Wallets loaded: ${wallets.length}`);
    if (config.isTrading) {
      console.log('Trading already active');
      return;
    }
    if (!wallets.length) {
      throw new Error('No wallets configured');
    }
    if (!config.tokenList.length || !config.tokenAddress) {
      throw new Error('No tokens configured in tokenList or tokenAddress');
    }
    try {
      new web3.PublicKey(config.tokenAddress);
    } catch (err) {
      throw new Error(`Invalid tokenAddress: ${config.tokenAddress}`);
    }
    config.isTrading = true;
    saveConfig();
    tradingInterval = setInterval(() => {
      if (!config.isTrading) {
        console.log('Stopping trade interval');
        clearInterval(tradingInterval!);
        tradingInterval = null;
      } else {
        console.log('Running trade cycle');
        tradeWallets().catch(err => console.error(`Trade cycle failed: ${err.message}`));
      }
    }, 30000);
    console.log('Starting initial trade cycle');
    tradeWallets().catch(err => console.error(`Initial trade failed: ${err.message}`));
    console.log('Trade started successfully');
  } catch (err: any) {
    console.error(`Failed to start trade: ${err.message}`);
    transactionLogs.push({
      wallet: '',
      type: 'start_trade',
      signature: '',
      status: 'failed',
      details: `Failed to start trade: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
    config.isTrading = false;
    saveConfig();
  }
}

export function stopTrade() {
  console.log('Stopping trade');
  config.isTrading = false;
  if (tradingInterval) clearInterval(tradingInterval);
  saveConfig();
  console.log('Trade stopped');
}

export async function tradeWallets() {
  if (!config.isTrading || !config.tokenList.length) {
    console.log('Trading not active or no tokens configured');
    return;
  }

  const swapAmountLamports = config.swapAmount * web3.LAMPORTS_PER_SOL;
  let tokenMint: web3.PublicKey;
  try {
    tokenMint = new web3.PublicKey(config.tokenAddress);
  } catch (err: any) {
    console.error(`Invalid token mint: ${err.message}`);
    return;
  }
  const solMint = new web3.PublicKey('So11111111111111111111111111111111111111112');

  for (const wallet of wallets) {
    try {
      wallet.tradeStatus = 'trading';
      saveWallets();

      const walletPubkey = new web3.PublicKey(wallet.publicKey);
      const isBuy = config.tradeMode === 'buy' || (config.tradeMode === 'random' && Math.random() > 0.5);

      await ensureTokenAccount(wallet, tokenMint);

      const solBalance = await connection.getBalance(walletPubkey, 'processed');
      if (isBuy && solBalance < swapAmountLamports + TX_FEE) {
        throw new Error(`Insufficient SOL: ${solBalance / web3.LAMPORTS_PER_SOL} SOL`);
      }

      const inputMint = isBuy ? solMint : tokenMint;
      const outputMint = isBuy ? tokenMint : solMint;
      const amount = isBuy ? swapAmountLamports : 10000; // 0.01 EXAMPLE

      console.log(`Attempting swap: ${isBuy ? 'Buy' : 'Sell'} ${amount / (isBuy ? web3.LAMPORTS_PER_SOL : 1000000)} ${isBuy ? 'SOL' : 'EXAMPLE'}`);

      const quoteResponse = await retry(async () => {
        const response = await fetch(
          `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`
        );
        const data = await response.json();
        if (data.error) throw new Error(`Jupiter quote failed: ${data.error}`);
        return data;
      });

      const swapResponse = await retry(async () => {
        const response = await fetch(JUPITER_SWAP_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: walletPubkey.toBase58(),
            wrapAndUnwrapSol: true,
          }),
        });
        const data = await response.json();
        if (!data.swapTransaction) throw new Error('No swap transaction');
        return data;
      });

      const transaction = web3.VersionedTransaction.deserialize(Buffer.from(swapResponse.swapTransaction, 'base64'));
      transaction.sign([wallet.keypair]);

      const signature = await retry(async () => {
        return await connection.sendTransaction(transaction, { maxRetries: 3 });
      });

      await connection.confirmTransaction({ signature, blockhash: transaction.message.recentBlockhash, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight }, 'processed');

      if (isBuy) {
        wallet.solBalance -= swapAmountLamports;
        wallet.tokenBalances[tokenMint.toString()] =
          (wallet.tokenBalances[tokenMint.toString()] || 0) + parseInt(quoteResponse.outAmount);
      } else {
        wallet.solBalance += parseInt(quoteResponse.outAmount);
        wallet.tokenBalances[tokenMint.toString()] = Math.max(
          0,
          (wallet.tokenBalances[tokenMint.toString()] || 0) - 10000
        );
      }

      wallet.tradeStatus = 'idle';
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'trade',
        signature,
        status: 'success',
        details: `${isBuy ? 'Bought' : 'Sold'} ${isBuy ? config.swapAmount : 0.01} ${isBuy ? 'SOL' : 'EXAMPLE'} for ${
          quoteResponse.outAmount / (isBuy ? 1000000 : web3.LAMPORTS_PER_SOL)
        } ${isBuy ? 'EXAMPLE' : 'SOL'}`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    } catch (err: any) {
      wallet.tradeStatus = 'failed';
      console.error(`Trade error for ${wallet.publicKey}: ${err.message}`);
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'trade',
        signature: '',
        status: 'failed',
        details: `Trade failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    }
  }
}

export async function sellAllTokens() {
  if (!wallets.length) {
    console.log('No wallets to sell tokens from');
    return;
  }

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const EXAMPLE_MINT = config.tokenAddress;

  for (const wallet of wallets) {
    try {
      wallet.tradeStatus = 'selling';
      saveWallets();

      const walletPubkey = new web3.PublicKey(wallet.publicKey);
      const tokenMint = new web3.PublicKey(EXAMPLE_MINT);
      const tokenAccount = await ensureTokenAccount(wallet, tokenMint);

      const tokenBalance = parseInt(
        (await connection.getTokenAccountBalance(tokenAccount, 'processed').catch(() => ({ value: { amount: '0' } }))).value.amount
      );

      if (tokenBalance <= 0) {
        wallet.tradeStatus = 'idle';
        saveWallets();
        console.log(`No tokens to sell for ${wallet.publicKey}`);
        continue;
      }

      const quoteResponse = await retry(async () => {
        const response = await fetch(
          `${JUPITER_QUOTE_API}?inputMint=${EXAMPLE_MINT}&outputMint=${SOL_MINT}&amount=${tokenBalance}&slippageBps=100`
        );
        const data = await response.json();
        if (data.error) throw new Error(`Jupiter quote failed: ${data.error}`);
        return data;
      });

      const swapResponse = await retry(async () => {
        const response = await fetch(JUPITER_SWAP_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: walletPubkey.toBase58(),
            wrapAndUnwrapSol: true,
          }),
        });
        const data = await response.json();
        if (!data.swapTransaction) throw new Error('No swap transaction');
        return data;
      });

      const transaction = web3.VersionedTransaction.deserialize(Buffer.from(swapResponse.swapTransaction, 'base64'));
      transaction.sign([wallet.keypair]);

      const swapSignature = await retry(async () => {
        return await connection.sendTransaction(transaction, { maxRetries: 3 });
      });

      await connection.confirmTransaction({ signature: swapSignature, blockhash: transaction.message.recentBlockhash, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight }, 'processed');

      wallet.solBalance += parseInt(quoteResponse.outAmount) || 0;
      wallet.tokenBalances[EXAMPLE_MINT] = 0;

      const closeTransaction = new web3.Transaction().add(
        splToken.createCloseAccountInstruction(tokenAccount, walletPubkey, walletPubkey, [], TOKEN_PROGRAM_ID)
      );
      closeTransaction.recentBlockhash = (await connection.getLatestBlockhash('processed')).blockhash;
      closeTransaction.feePayer = walletPubkey;

      const closeSignature = await web3.sendAndConfirmTransaction(connection, closeTransaction, [wallet.keypair], {
        commitment: 'processed',
        maxRetries: 3,
      });

      delete wallet.tokenAccounts[EXAMPLE_MINT];
      wallet.solBalance += ATA_CREATION_COST;

      wallet.tradeStatus = 'idle';
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'sell_all',
        signature: swapSignature,
        status: 'success',
        details: `Sold ${tokenBalance / 1000000} EXAMPLE for ${quoteResponse.outAmount / web3.LAMPORTS_PER_SOL} SOL, closed ATA`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    } catch (err: any) {
      wallet.tradeStatus = 'failed';
      console.error(`Sell error for ${wallet.publicKey}: ${err.message}`);
      transactionLogs.push({
        wallet: wallet.publicKey,
        type: 'sell_all',
        signature: '',
        status: 'failed',
        details: `Sell failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
      saveWallets();
    }
  }
}

// Initialize config
try {
  config = loadConfig();
} catch (err) {
  console.error('Failed to initialize config, exiting...');
  process.exit(1);
}

loadWallets();
loadMainWallet();