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

    this.rpcUrl = rpcUrl;
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl),
    });

    // Parse seed phrases from numbered environment variables (PHRASES_0, PHRASES_1, etc.)
    this.seedPhrases = [];
    let index = 0;
    while (true) {
      const phraseKey = `PHRASES_${index}`;
      const phrase = process.env[phraseKey];

      if (!phrase || phrase.trim().length === 0) {
        break;
      }

      this.seedPhrases.push(phrase.trim());
      index++;
    }

    // Fallback to legacy PHRASES format for backward compatibility
    if (this.seedPhrases.length === 0) {
      const phrases = process.env.PHRASES;
      if (phrases) {
        this.seedPhrases = phrases
          .split(/[;\n]/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      }
    }

    if (this.seedPhrases.length === 0) {
      throw new Error(
        "No valid seed phrases found. Please set PHRASES_0, PHRASES_1, etc. in .env file"
      );
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

    // Create wallet client for sending transactions
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http(this.rpcUrl),
    });

    // Send transaction
    const hash = await walletClient.sendTransaction({
      account,
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

  /**
   * Get private key from seed phrase and index
   */
  getPrivateKey(seedPhrase: string, index: number = 0): string {
    const account = this.getAccountFromSeed(seedPhrase, index);
    const hdKey = account.getHdKey();
    if (!hdKey.privateKey) {
      throw new Error("Failed to derive private key");
    }
    // Convert private key to hex string
    const privateKeyBuffer = Buffer.isBuffer(hdKey.privateKey)
      ? hdKey.privateKey
      : Buffer.from(hdKey.privateKey);
    return `0x${privateKeyBuffer.toString("hex")}`;
  }

  /**
   * Get all seed phrases
   */
  getSeedPhrases(): string[] {
    return [...this.seedPhrases];
  }
}

import * as readline from "readline";

// Interactive CLI Interface
class InteractiveCLI {
  private rl: readline.Interface;
  private wallet: SimpleWallet;

  constructor(wallet: SimpleWallet) {
    this.wallet = wallet;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  private showMenu() {
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║    Simple Ethereum Wallet CLI          ║");
    console.log("╚════════════════════════════════════════╝\n");
    console.log("Commands:");
    console.log("  1. List wallets with balance");
    console.log("  2. Check balance");
    console.log("  3. Transfer ETH");
    console.log("  4. Get wallet address");
    console.log("  5. Get private key");
    console.log("  6. Show menu");
    console.log("  0. Exit\n");
  }

  async handleList() {
    try {
      console.log("\n📊 Scanning wallets for balances...\n");
      const wallets = await this.wallet.listWalletsWithBalance();

      if (wallets.length === 0) {
        console.log("❌ No wallets with balance found.");
      } else {
        console.log(`✅ Found ${wallets.length} wallet(s) with balance:\n`);
        wallets.forEach((w, idx) => {
          console.log(`${idx + 1}. Address: ${w.address}`);
          console.log(`   Balance: ${w.balanceEth} ETH`);
          console.log(`   Index: ${w.index}`);
          console.log(`   Seed: ${w.seedPhrase}\n`);
        });
      }
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async handleBalance() {
    try {
      const address = await this.question("Enter address: ");
      if (!address.trim()) {
        console.log("❌ Address cannot be empty");
        return;
      }
      console.log("\n⏳ Checking balance...");
      const balance = await this.wallet.checkBalance(address.trim());
      console.log(`\n💰 Balance: ${balance} ETH`);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async handleTransfer() {
    try {
      const seedPhrases = this.wallet.getSeedPhrases();

      if (seedPhrases.length === 0) {
        console.error("❌ No seed phrase found");
        return;
      }

      let seedPhrase = seedPhrases[0];
      if (seedPhrases.length > 1) {
        console.log("\nAvailable seed phrases:");
        seedPhrases.forEach((s, i) => {
          const preview = s.split(" ").slice(0, 3).join(" ") + "...";
          console.log(`  ${i + 1}. ${preview}`);
        });
        const seedIndex = await this.question(
          "\nSelect seed phrase (1-" + seedPhrases.length + ", default 1): "
        );
        const idx = parseInt(seedIndex) - 1;
        if (idx >= 0 && idx < seedPhrases.length) {
          seedPhrase = seedPhrases[idx];
        }
      }

      const walletIndexStr = await this.question(
        "Enter wallet index (default 0): "
      );
      const walletIndex = parseInt(walletIndexStr) || 0;

      const toAddress = await this.question("Enter recipient address: ");
      if (!toAddress.trim()) {
        console.log("❌ Recipient address cannot be empty");
        return;
      }

      const amount = await this.question("Enter amount (ETH): ");
      if (!amount.trim()) {
        console.log("❌ Amount cannot be empty");
        return;
      }

      console.log(
        `\n⏳ Transferring ${amount} ETH from wallet index ${walletIndex} to ${toAddress}...`
      );
      const txHash = await this.wallet.transfer(
        seedPhrase,
        walletIndex,
        toAddress.trim(),
        amount.trim()
      );
      console.log(`\n✅ Transfer successful! Transaction hash: ${txHash}`);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async handleAddress() {
    try {
      const seedPhrases = this.wallet.getSeedPhrases();

      if (seedPhrases.length === 0) {
        console.error("❌ No seed phrase found");
        return;
      }

      let seedPhrase = seedPhrases[0];
      if (seedPhrases.length > 1) {
        console.log("\nAvailable seed phrases:");
        seedPhrases.forEach((s, i) => {
          const preview = s.split(" ").slice(0, 3).join(" ") + "...";
          console.log(`  ${i + 1}. ${preview}`);
        });
        const seedIndex = await this.question(
          "\nSelect seed phrase (1-" + seedPhrases.length + ", default 1): "
        );
        const idx = parseInt(seedIndex) - 1;
        if (idx >= 0 && idx < seedPhrases.length) {
          seedPhrase = seedPhrases[idx];
        }
      }

      const indexStr = await this.question("Enter wallet index (default 0): ");
      const idx = parseInt(indexStr) || 0;
      const addr = this.wallet.getWalletAddress(seedPhrase, idx);
      console.log(`\n📍 Wallet address (index ${idx}): ${addr}`);
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async handlePrivateKey() {
    try {
      const seedPhrases = this.wallet.getSeedPhrases();

      if (seedPhrases.length === 0) {
        console.error("❌ No seed phrase found");
        return;
      }

      let seedPhrase = seedPhrases[0];
      if (seedPhrases.length > 1) {
        console.log("\nAvailable seed phrases:");
        seedPhrases.forEach((s, i) => {
          const preview = s.split(" ").slice(0, 3).join(" ") + "...";
          console.log(`  ${i + 1}. ${preview}`);
        });
        const seedIndex = await this.question(
          "\nSelect seed phrase (1-" + seedPhrases.length + ", default 1): "
        );
        const idx = parseInt(seedIndex) - 1;
        if (idx >= 0 && idx < seedPhrases.length) {
          seedPhrase = seedPhrases[idx];
        }
      }

      const indexStr = await this.question("Enter wallet index (default 0): ");
      const idx = parseInt(indexStr) || 0;
      const address = this.wallet.getWalletAddress(seedPhrase, idx);
      const privateKey = this.wallet.getPrivateKey(seedPhrase, idx);
      console.log(`\n📍 Wallet address (index ${idx}): ${address}`);
      console.log(`🔑 Private key (index ${idx}): ${privateKey}`);
      console.log(
        "⚠️  WARNING: Keep this private key secure! Never share it with anyone."
      );
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async run() {
    this.showMenu();

    while (true) {
      const answer = await this.question("Select command (0-6): ");

      switch (answer.trim()) {
        case "1":
          await this.handleList();
          break;
        case "2":
          await this.handleBalance();
          break;
        case "3":
          await this.handleTransfer();
          break;
        case "4":
          await this.handleAddress();
          break;
        case "5":
          await this.handlePrivateKey();
          break;
        case "6":
          this.showMenu();
          break;
        case "0":
        case "exit":
        case "quit":
          console.log("\n👋 Goodbye!\n");
          this.rl.close();
          return;
        default:
          console.log("❌ Invalid command. Type 6 to see menu or 0 to exit.");
      }
    }
  }

  close() {
    this.rl.close();
  }
}

// CLI Interface - supports both interactive and command-line modes
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    const wallet = new SimpleWallet();

    // If no command provided, start interactive mode
    if (!command) {
      const cli = new InteractiveCLI(wallet);
      await cli.run();
      return;
    }

    // Command-line mode (backward compatible)
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
        const seedPhrases = wallet.getSeedPhrases();
        if (seedPhrases.length === 0) {
          console.error("No seed phrase found");
          process.exit(1);
        }

        // Support both formats:
        // Old: transfer <walletIndex> <toAddress> <amount> (uses first phrase)
        // New: transfer <phraseIndex> <walletIndex> <toAddress> <amount>
        let phraseIndex = 0;
        let walletIndex: number;
        let toAddress: string;
        let amount: string;

        if (args.length >= 4) {
          // New format with phrase index
          phraseIndex = parseInt(args[1] || "0");
          walletIndex = parseInt(args[2] || "0");
          toAddress = args[3];
          amount = args[4];
        } else {
          // Old format (backward compatible)
          walletIndex = parseInt(args[1] || "0");
          toAddress = args[2];
          amount = args[3];
        }

        if (!toAddress || !amount) {
          console.error(
            "Usage: pnpm start transfer [phraseIndex] <walletIndex> <toAddress> <amountEth>"
          );
          process.exit(1);
        }

        const seedPhrase = seedPhrases[phraseIndex] || seedPhrases[0];
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
        const seedPhrasesForAddr = wallet.getSeedPhrases();
        if (seedPhrasesForAddr.length === 0) {
          console.error("No seed phrase found");
          process.exit(1);
        }
        const phraseIdx = parseInt(args[1] || "0");
        const walletIdx = parseInt(args[2] || "0");
        const seedForAddr =
          seedPhrasesForAddr[phraseIdx] || seedPhrasesForAddr[0];
        const addr = wallet.getWalletAddress(seedForAddr, walletIdx);
        console.log(
          `Wallet address (phrase ${phraseIdx}, wallet ${walletIdx}): ${addr}`
        );
        break;

      case "privatekey":
      case "key":
        const seedPhrasesForKey = wallet.getSeedPhrases();
        if (seedPhrasesForKey.length === 0) {
          console.error("No seed phrase found");
          process.exit(1);
        }
        const phraseKeyIdx = parseInt(args[1] || "0");
        const walletKeyIdx = parseInt(args[2] || "0");
        const seedForKey =
          seedPhrasesForKey[phraseKeyIdx] || seedPhrasesForKey[0];
        const addressForKey = wallet.getWalletAddress(seedForKey, walletKeyIdx);
        const privateKey = wallet.getPrivateKey(seedForKey, walletKeyIdx);
        console.log(
          `Wallet address (phrase ${phraseKeyIdx}, wallet ${walletKeyIdx}): ${addressForKey}`
        );
        console.log(
          `Private key (phrase ${phraseKeyIdx}, wallet ${walletKeyIdx}): ${privateKey}`
        );
        console.log(
          "⚠️  WARNING: Keep this private key secure! Never share it with anyone."
        );
        break;

      default:
        console.log(`
Simple Ethereum Wallet CLI

Usage:
  pnpm start                      - Start interactive mode
  pnpm start list                 - List all wallets with balance
  pnpm start balance <address>    - Check balance of an address
  pnpm start transfer [phraseIndex] <walletIndex> <to> <amount> - Transfer ETH
  pnpm start address [phraseIndex] [walletIndex] - Get wallet address (defaults: 0, 0)
  pnpm start privatekey [phraseIndex] [walletIndex] - Get private key (defaults: 0, 0)

Examples:
  pnpm start
  pnpm start list
  pnpm start balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
  pnpm start transfer 0 0 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.1
  pnpm start address 0 0
  pnpm start privatekey 0 0
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
