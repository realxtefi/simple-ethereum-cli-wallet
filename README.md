# Simple Ethereum Wallet

A simple Node.js/TypeScript application for managing Ethereum wallets using 12-word seed phrases.

## Features

- Check ETH balance of any address
- Transfer ETH between wallets
- List all sub-wallets with balance from seed phrases
- Manage multiple seed phrases via environment variables

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

3. Edit `.env` and add your configuration:

```
RPC_URL=https://eth.llamarpc.com
PHRASES_0=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
PHRASES_1=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
PHRASES_2=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
```

You can add as many seed phrases as needed by incrementing the number (PHRASES_0, PHRASES_1, PHRASES_2, etc.).

**Note:** The old `PHRASES` format (with semicolons or newlines) is still supported for backward compatibility, but the numbered format is recommended.

## Usage

### Interactive Mode (Recommended)

Start the interactive CLI menu:

```bash
pnpm start
```

This will show a menu with numbered commands:

- `1` - List wallets with balance
- `2` - Check balance
- `3` - Transfer ETH
- `4` - Get wallet address
- `5` - Show menu
- `0` - Exit

The interactive mode prompts for all required inputs and returns to the menu after each command, making it easy to use like a Telegram bot interface.

### Command-Line Mode

You can also use commands directly:

#### List wallets with balance

Scans the first 20 addresses from each seed phrase and shows those with balance:

```bash
pnpm start list
```

#### Check balance

Check the balance of a specific address:

```bash
pnpm start balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

#### Transfer ETH

Transfer ETH from a wallet:

```bash
# Old format (uses first seed phrase, PHRASES_0)
pnpm start transfer <walletIndex> <toAddress> <amountEth>

# New format (specify which seed phrase to use)
pnpm start transfer <phraseIndex> <walletIndex> <toAddress> <amountEth>
```

Examples:

```bash
# Use first seed phrase (PHRASES_0), wallet index 0
pnpm start transfer 0 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.1

# Use second seed phrase (PHRASES_1), wallet index 0
pnpm start transfer 1 0 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.1
```

#### Get wallet address

Get the address for a specific wallet:

```bash
# Old format (uses first seed phrase)
pnpm start address [walletIndex]

# New format (specify seed phrase and wallet index)
pnpm start address [phraseIndex] [walletIndex]
```

#### Get private key

Get the private key for a specific wallet:

```bash
# Old format (uses first seed phrase)
pnpm start privatekey [walletIndex]

# New format (specify seed phrase and wallet index)
pnpm start privatekey [phraseIndex] [walletIndex]
```

## Security Warning

⚠️ **Never commit your `.env` file to version control!** It contains sensitive seed phrases that give full access to your wallets.

## Requirements

- Node.js 18+
- An Ethereum RPC endpoint (public or private)
