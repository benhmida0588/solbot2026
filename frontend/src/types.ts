export interface Config {
       swapAmount?: number;
       tradeMode?: string;
       concurrencyLimit?: number;
       tokenAddress?: string;
       swapAmountLamports?: number;
       tokenList: { symbol: string; mint: string }[];
       isTrading?: boolean;
     }