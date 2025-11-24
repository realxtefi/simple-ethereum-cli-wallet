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
PHRASES=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
```

You can add multiple seed phrases by separating them with semicolons or newlines:
```
PHRASES=phrase1 word1 word2...; phrase2 word1 word2...
```

## Usage

### List wallets with balance
Scans the first 20 addresses from each seed phrase and shows those with balance:
```bash
pnpm start list
```

### Check balance
Check the balance of a specific address:
```bash
pnpm start balance 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

### Transfer ETH
Transfer ETH from a wallet (uses first seed phrase):
```bash
pnpm start transfer <walletIndex> <toAddress> <amountEth>
```

Example:
```bash
pnpm start transfer 0 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0.1
```

### Get wallet address
Get the address for a specific wallet index:
```bash
pnpm start address [index]
```

## Security Warning

⚠️ **Never commit your `.env` file to version control!** It contains sensitive seed phrases that give full access to your wallets.

## Requirements

- Node.js 18+
- An Ethereum RPC endpoint (public or private)

