import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { MARKET_STATE_LAYOUT_V3 } from '@project-serum/serum';
import { Liquidity, makeCreatePoolV4InstructionV2Simple } from '@raydium-io/raydium-sdk-v2';
import { struct, nu64 } from '@solana/buffer-layout';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { BN } from 'bn.js';

dotenv.config();

const connection = new Connection('https://devnet.helius-rpc.com/?api-key=30b1b441-7840-42d0-a598-86df2c8251e2', 'confirmed');
const mainWallet = Keypair.fromSecretKey(bs58.decode(process.env.MAIN_WALLET_PRIVATE_KEY!));
const tokenMint = new PublicKey('GDcFHrWotmoJSx2YaqQ1PzJcZUYvfrXKCyzZA5MKpsvi');
const solMint = new PublicKey('So11111111111111111111111111111111111111112');
const serumProgramId = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY'); // Devnet Serum
const raydiumProgramId = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'); // Devnet Raydium

async function createSerumMarket(): Promise<PublicKey> {
  const market = Keypair.generate();
  const requestQueue = Keypair.generate();
  const eventQueue = Keypair.generate();
  const bids = Keypair.generate();
  const asks = Keypair.generate();
  const baseVault = Keypair.generate();
  const quoteVault = Keypair.generate();

  // Compute vault owner and nonce
  let vaultSignerNonce = 0;
  let vaultOwner: PublicKey | null = null;
  while (!vaultOwner) {
    try {
      vaultOwner = await PublicKey.createProgramAddress(
        [market.publicKey.toBuffer(), new BN(vaultSignerNonce).toArrayLike(Buffer, 'le', 8)],
        serumProgramId
      );
    } catch (e) {
      vaultSignerNonce++;
      if (vaultSignerNonce > 255) throw new Error('Failed to find vault signer nonce');
    }
  }

  // Calculate space for market accounts
  const marketSpace = MARKET_STATE_LAYOUT_V3.span;
  const queueSpace = 5120 + 12; // Standard Serum queue size
  const orderBookSpace = 4096 + 12; // Standard Serum order book size
  const vaultSpace = 165; // Standard token vault size

  const tx = new Transaction().add(
    // Allocate market account
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: market.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(marketSpace),
      space: marketSpace,
      programId: serumProgramId,
    }),
    // Allocate queues and order books
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: requestQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(queueSpace),
      space: queueSpace,
      programId: serumProgramId,
    }),
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: eventQueue.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(queueSpace),
      space: queueSpace,
      programId: serumProgramId,
    }),
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: bids.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(orderBookSpace),
      space: orderBookSpace,
      programId: serumProgramId,
    }),
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: asks.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(orderBookSpace),
      space: orderBookSpace,
      programId: serumProgramId,
    }),
    // Allocate vaults
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: baseVault.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(vaultSpace),
      space: vaultSpace,
      programId: TOKEN_PROGRAM_ID,
    }),
    SystemProgram.createAccount({
      fromPubkey: mainWallet.publicKey,
      newAccountPubkey: quoteVault.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(vaultSpace),
      space: vaultSpace,
      programId: TOKEN_PROGRAM_ID,
    }),
    // Initialize market
    new TransactionInstruction({
      keys: [
        { pubkey: market.publicKey, isSigner: false, isWritable: true },
        { pubkey: requestQueue.publicKey, isSigner: false, isWritable: true },
        { pubkey: eventQueue.publicKey, isSigner: false, isWritable: true },
        { pubkey: bids.publicKey, isSigner: false, isWritable: true },
        { pubkey: asks.publicKey, isSigner: false, isWritable: true },
        { pubkey: baseVault.publicKey, isSigner: false, isWritable: true },
        { pubkey: quoteVault.publicKey, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: solMint, isSigner: false, isWritable: false },
        { pubkey: vaultOwner, isSigner: false, isWritable: false },
      ],
      programId: serumProgramId,
      data: Buffer.concat([
        Buffer.from([0]), // Initialize market instruction
        Buffer.from(new Uint8Array(new BN(vaultSignerNonce).toArray('le', 8))), // Encode nonce as little-endian u64
        Buffer.from(new Uint8Array(new BN(1000).toArray('le', 8))), // baseLotSize
        Buffer.from(new Uint8Array(new BN(100000).toArray('le', 8))), // quoteLotSize
        Buffer.from(new Uint8Array(new BN(25).toArray('le', 8))), // feeRateBps
        Buffer.from(new Uint8Array(new BN(0).toArray('le', 8))), // quoteDustThreshold
      ])
    })
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [mainWallet, market, requestQueue, eventQueue, bids, asks, baseVault, quoteVault],
    { commitment: 'confirmed' }
  );
  console.log(`Serum market created: ${market.publicKey.toBase58()} (tx: ${signature})`);
  return market.publicKey;
}

async function createRaydiumPool(marketId: PublicKey) {
  const baseToken = { mint: tokenMint, decimals: 9 };
  const quoteToken = { mint: solMint, decimals: 9 };

  // Fetch market info
  const marketInfo = await connection.getAccountInfo(marketId);
  if (!marketInfo) throw new Error('Market not found');
  const marketState = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);

  // Get pool keys
  const poolKeys = await Liquidity.getAssociatedPoolKeys({
    version: 4,
    marketVersion: 3,
    marketId,
    baseMint: baseToken.mint,
    quoteMint: quoteToken.mint,
    baseDecimals: baseToken.decimals,
    quoteDecimals: quoteToken.decimals,
    programId: raydiumProgramId,
    marketProgramId: serumProgramId,
  });

  // Create token accounts
  const baseTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mainWallet,
    baseToken.mint,
    mainWallet.publicKey
  );
  const quoteTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    mainWallet,
    quoteToken.mint,
    mainWallet.publicKey
  );

  // Create pool
  const { innerTransactions } = await makeCreatePoolV4InstructionV2Simple({
    connection,
    programId: raydiumProgramId,
    marketInfo: {
      marketId,
      programId: serumProgramId,
    },
    baseMintInfo: baseToken,
    quoteMintInfo: quoteToken,
    baseAmount: new BN(100000000000000), // 100,000 TEST (9 decimals)
    quoteAmount: new BN(1000000000), // 1 SOL (9 decimals)
    startTime: new BN(Math.floor(Date.now() / 1000)),
    owner: mainWallet.publicKey,
    associatedOnly: true,
    checkCreateATAOwner: false,
    feeDestinationId: new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'), // Devnet fee destination
  });

  for (const tx of innerTransactions) {
    const signature = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(...tx.instructions),
      [mainWallet, ...(tx.signers || [])],
      { commitment: 'confirmed' }
    );
    console.log(`Raydium pool transaction: ${signature}`);
  }

  console.log(`Raydium pool created: ${poolKeys.id.toBase58()}`);
}

async function main() {
  try {
    const marketId = await createSerumMarket();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Respect Helius rate limit
    await createRaydiumPool(marketId);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();