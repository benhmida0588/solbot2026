export interface Wallet {
  publicKey: string;
  keypair?: any; // Keypair is not serializable, so optional
  solBalance: number;
  tokenBalances: { [mint: string]: number };
  tradeStatus: string;
}

export interface TransactionLog {
  wallet: string;
  type: string;
  signature: string;
  status: string;
  details: string;
  timestamp: string;
}

export interface Config {
  swapAmountLamports: number;
  tokenList: { symbol: string; mint: string }[];
  tradeMode: 'random' | 'buyOnly' | 'sellOnly';
  concurrencyLimit: number;
}