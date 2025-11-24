import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  isAddress,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

interface WalletInfo {
  address: string;
  balance: string;
  balanceEth: string;
  index: number;
  seedPhrase: string;
}

class SimpleWallet {
  private publicClient: ReturnType<typeof createPublicClient>;
  private seedPhrases: string[];
  private rpcUrl: string;

  constructor() {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      throw new Error("RPC_URL is not set in .env file");
    }

    const phrases = process.env.PHRASES;
    if (!phrases) {
      throw new Error("PHRASES is not set in .env file");
    }

    this.rpcUrl = rpcUrl;
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    });

    // Parse seed phrases - support multiple phrases separated by newlines or semicolons
    this.seedPhrases = phrases
      .split(/[;\n]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (this.seedPhrases.length === 0) {
      throw new Error("No valid seed phrases found in PHRASES");
    }
  }

  /**
   * Derive wallet from seed phrase and index
   */
  private getAccountFromSeed(
    seedPhrase: string,
    index: number = 0
  ): ReturnType<typeof mnemonicToAccount> {
    return mnemonicToAccount(seedPhrase, {
      accountIndex: index,
    });
  }

  /**
   * Check balance of a specific wallet
   */
  async checkBalance(address: string): Promise<string> {
    if (!isAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }
    const balance = await this.publicClient.getBalance({
      address: address as `0x${string}`,
    });
    return formatEther(balance);
  }

  /**
   * List all sub-wallets with balance from seed phrases
   * Checks first 20 addresses per seed phrase
   */
  async listWalletsWithBalance(maxIndex: number = 20): Promise<WalletInfo[]> {
    const walletsWithBalance: WalletInfo[] = [];

    for (const seedPhrase of this.seedPhrases) {
      for (let i = 0; i < maxIndex; i++) {
        try {
          const account = this.getAccountFromSeed(seedPhrase, i);
          const balance = await this.publicClient.getBalance({
            address: account.address,
          });
          const balanceEth = formatEther(balance);

          if (balance > 0n) {
            walletsWithBalance.push({
              address: account.address,
              balance: balance.toString(),
              balanceEth,
              index: i,
              seedPhrase: seedPhrase.split(" ").slice(0, 3).join(" ") + "...", // Show first 3 words only
            });
          }
        } catch (error) {
          console.error(`Error checking wallet index ${i}:`, error);
        }
      }
    }

    return walletsWithBalance;
  }

  /**
   * Transfer ETH from a wallet to another address
   */
  async transfer(
    seedPhrase: string,
    walletIndex: number,
    toAddress: string,
    amountEth: string
  ): Promise<string> {
    // Validate recipient address
    if (!isAddress(toAddress)) {
      throw new Error(`Invalid recipient address: ${toAddress}`);
    }

    const account = this.getAccountFromSeed(seedPhrase, walletIndex);

    // Get current balance
    const balance = await this.publicClient.getBalance({
      address: account.address,
    });
    const balanceEth = parseFloat(formatEther(balance));
    const amount = parseFloat(amountEth);

    if (amount > balanceEth) {
      throw new Error(
        `Insufficient balance. Available: ${balanceEth} ETH, Requested: ${amountEth} ETH`
      );
    }

    // Create wallet client for sending transactions
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http(this.rpcUrl),
    });

    // Estimate gas
    const gasPrice = await this.publicClient.getGasPrice();
    const estimatedGas = 21000n; // Standard ETH transfer
    const gasCost = estimatedGas * gasPrice;
    const totalNeeded = parseEther(amountEth) + gasCost;

    if (totalNeeded > balance) {
      throw new Error(
        `Insufficient balance for transfer + gas. Available: ${balanceEth} ETH`
      );
    }

    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: toAddress as `0x${string}`,
      value: parseEther(amountEth),
    });

    console.log(`Transaction sent: ${hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

    return hash;
  }

  /**
   * Get wallet address from seed phrase and index
   */
  getWalletAddress(seedPhrase: string, index: number = 0): string {
    const account = this.getAccountFromSeed(seedPhrase, index);
    return account.address;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    const wallet = new SimpleWallet();

    switch (command) {
      case "list":
        console.log("Scanning wallets for balances...\n");
        const wallets = await wallet.listWalletsWithBalance();

        if (wallets.length === 0) {
          console.log("No wallets with balance found.");
        } else {
          console.log(`Found ${wallets.length} wallet(s) with balance:\n`);
          wallets.forEach((w, idx) => {
            console.log(`${idx + 1}. Address: ${w.address}`);
            console.log(`   Balance: ${w.balanceEth} ETH`);
            console.log(`   Index: ${w.index}`);
            console.log(`   Seed: ${w.seedPhrase}\n`);
          });
        }
        break;

      case "balance":
        const address = args[1];
        if (!address) {
          console.error("Usage: pnpm start balance <address>");
          process.exit(1);
        }
        const balance = await wallet.checkBalance(address);
        console.log(`Balance: ${balance} ETH`);
        break;

      case "transfer":
        const seedPhrase = process.env.PHRASES?.split(/[;\n]/)[0]?.trim();
        if (!seedPhrase) {
          console.error("No seed phrase found in PHRASES");
          process.exit(1);
        }
        const walletIndex = parseInt(args[1] || "0");
        const toAddress = args[2];
        const amount = args[3];

        if (!toAddress || !amount) {
          console.error(
            "Usage: pnpm start transfer <walletIndex> <toAddress> <amountEth>"
          );
          process.exit(1);
        }

        console.log(
          `Transferring ${amount} ETH from wallet index ${walletIndex} to ${toAddress}...`
        );
        const txHash = await wallet.transfer(
          seedPhrase,
          walletIndex,
          toAddress,
          amount
        );
        console.log(`Transfer successful! Transaction hash: ${txHash}`);
        break;

      case "address":
        const seed = process.env.PHRASES?.split(/[;\n]/)[0]?.trim();
        if (!seed) {
          console.error("No seed phrase found in PHRASES");
          process.exit(1);
        }
        const idx = parseInt(args[1] || "0");
        const addr = wallet.getWalletAddress(seed, idx);
        console.log(`Wallet address (index ${idx}): ${addr}`);
        break;

      default:
        console.log(`
Simple Ethereum Wallet CLI

Usage:
  pnpm start list                    - List all wallets with balance
  pnpm start balance <address>       - Check balance of an address
  pnpm start transfer <index> <to> <amount> - Transfer ETH (uses first seed phrase)
  pnpm start address [index]         - Get wallet address (default index: 0)

Examples:
  pnpm start list
  pnpm start balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  pnpm start transfer 0 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.1
  pnpm start address 0
        `);
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { SimpleWallet };
