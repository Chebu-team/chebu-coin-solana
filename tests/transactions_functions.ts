import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	TransactionInstruction,
	Transaction,
	sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
	approveChecked,
	createMintToCheckedInstruction,
	mintToCheckedInstructionData,
	TokenInstruction,
} from '@solana/spl-token';
import { Buffer } from 'buffer';
import {
	BurnExactTokensForStableToArgs,
	CliamToArgs,
	MintTokensForExactStableToArgs,
	MintTokensForExactStableWithSlippageToArgs,
	SplMinterInstruction,
} from './instructions';
import { BN } from 'bn.js';
import { InitArgs } from './init_test';

export function createKeypairFromFile(path: string): Keypair {
	return Keypair.fromSecretKey(
		Buffer.from(JSON.parse(require('fs').readFileSync(path, 'utf-8'))),
	);
}
export function getPDAmetadataAddress(key: Keypair): PublicKey {
	return PublicKey.findProgramAddressSync(
		[
			Buffer.from('metadata'),
			TOKEN_METADATA_PROGRAM_ID.toBuffer(),
			key.publicKey.toBuffer(),
		],
		TOKEN_METADATA_PROGRAM_ID,
	)[0];
}

export function getMintAuthorityAddress(key: Keypair): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('mint_authority')],
		key.publicKey,
	)[0];
}

export function getStateAddress(key: Keypair): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('state')],
		key.publicKey,
	)[0];
}

export async function getpda_trade_token_ata_account(
	mint_acc: Keypair,
	program_id: PublicKey,
): Promise<PublicKey> {
	const pda = getPDATradeTokenAuthorityAddress(program_id);
	return await getAssociatedTokenAddress(mint_acc.publicKey, pda, true);
}

export function getPDATradeTokenAuthorityAddress(key: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('ata_trade_token_authority')],
		key,
	)[0];
}

export async function mint_trade_token(
	connection: Connection,
	userAccountPubkey: PublicKey,
	payer: Keypair,
	mintPubkey: PublicKey,
	amount: number,
) {
	let mint_tx = createMintToCheckedInstruction(
		mintPubkey, // mint
		userAccountPubkey, // receiver (should be a token account)
		payer.publicKey, // mint authority
		amount, // amount. if your decimals is 8, you mint 10^8 for 1 token.
		6, // decimals
	);

	let tx = new Transaction().add(mint_tx);

	const data = Buffer.alloc(mintToCheckedInstructionData.span);
	mintToCheckedInstructionData.encode(
		{
			instruction: TokenInstruction.MintToChecked,
			amount: BigInt(amount),
			decimals: 6,
		},
		data,
	);
	let ix = new TransactionInstruction({
		keys: [
			{ pubkey: mintPubkey, isSigner: false, isWritable: true }, // Mint account
			{ pubkey: userAccountPubkey, isSigner: false, isWritable: true }, // Mint authority account
			{ pubkey: payer.publicKey, isSigner: true, isWritable: true }, // Payer
		],
		programId: TOKEN_PROGRAM_ID,
		data: data,
	});
	const sx = await sendAndConfirmTransaction(
		connection,
		new Transaction().add(mint_tx),
		[payer],
	);
}

export async function approve_trade_token(
	connection: Connection,
	user: Keypair,
	args: InitArgs,
	amount: number,
) {
	const user_ATA_address = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		user.publicKey,
	);
	let txhash = await approveChecked(
		connection, // connection
		user, // fee payer
		args.tradeTokenKeypair.publicKey, // mint
		user_ATA_address, // token account
		args.pda_trade_token_ata_account, // delegate
		user, // owner of token account
		amount, // amount, if your deciamls is 8, 10^8 for 1 token
		6, // decimals
	);
}

export async function MintTokensForExactStable(
	connection: Connection,
	user: Keypair,
	args: InitArgs,
	amount: number,
) {
	let instructionData_1 = new MintTokensForExactStableToArgs({
		instruction: SplMinterInstruction.MintTokensForExactStable,
		_inAmount: BigInt(amount),
	});

	const associatedTokenAccountAddress = await getAssociatedTokenAddress(
		args.mintKeypair.publicKey,
		user.publicKey,
	);
	const payer_trade_token_ata_account = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		user.publicKey,
	);

	let ix_1 = new TransactionInstruction({
		keys: [
			{ pubkey: args.mintKeypair.publicKey, isSigner: false, isWritable: true }, // Mint account
			{ pubkey: args.mintAuthorityAddress, isSigner: false, isWritable: true }, // Mint authority account
			{
				pubkey: associatedTokenAccountAddress,
				isSigner: false,
				isWritable: true,
			}, // ATA
			{ pubkey: user.publicKey, isSigner: true, isWritable: true }, // Payer
			{ pubkey: args.stateAddress, isSigner: false, isWritable: true }, // System program
			{
				pubkey: payer_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // System program
			{
				pubkey: args.pda_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // System program
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token program
			{
				pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
				isSigner: false,
				isWritable: false,
			}, // Token metadata program
		],
		programId: args.program.publicKey,
		data: instructionData_1.toBuffer(),
	});
	const sx = await sendAndConfirmTransaction(
		connection,
		new Transaction().add(ix_1),
		[user],
	);
	console.log(`MintTokensForExactStable txhash: ${sx}`);
}

export async function claim_token(
	connection: Connection,
	user: Keypair,
	args: InitArgs,
	amount: number,
) {
	let instructionData_1 = new CliamToArgs({
		instruction: SplMinterInstruction.Claim,
		amount: BigInt(amount),
	});
	console.log('claim_token amount: ', amount);

	const claim_account_trade_token_ata_account = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		user.publicKey,
	);

	let ix_1 = new TransactionInstruction({
		keys: [
			{ pubkey: user.publicKey, isSigner: true, isWritable: true }, // Mint account
			{ pubkey: args.stateAddress, isSigner: false, isWritable: true }, // Mint authority account
			{
				pubkey: args.pda_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // ATA
			{
				pubkey: claim_account_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // Payer
			{
				pubkey: args.PDATradeTokenAuthorityAddress,
				isSigner: false,
				isWritable: true,
			}, // System program
			{
				pubkey: args.tradeTokenKeypair.publicKey,
				isSigner: false,
				isWritable: true,
			}, // System program

			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token program
			{
				pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
				isSigner: false,
				isWritable: false,
			}, // Token metadata program
		],
		programId: args.program.publicKey,
		data: instructionData_1.toBuffer(),
	});
	const sx = await sendAndConfirmTransaction(
		connection,
		new Transaction().add(ix_1),
		[user],
	);
	console.log(`Claim txhash: ${sx}`);
}

export async function mintTokensForExactStableWithSlippage(
	connection: Connection,
	user: Keypair,
	args: InitArgs,
	amount: number,
	notLess: number,
) {
	let instructionData_1 = new MintTokensForExactStableWithSlippageToArgs({
		instruction: SplMinterInstruction.MintTokensForExactStableWithSlippage,
		_inAmount: BigInt(amount),
		_outNotLess: BigInt(notLess),
	});

	const associatedTokenAccountAddress = await getAssociatedTokenAddress(
		args.mintKeypair.publicKey,
		user.publicKey,
	);
	const payer_trade_token_ata_account = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		user.publicKey,
	);

	let ix_1 = new TransactionInstruction({
		keys: [
			{ pubkey: args.mintKeypair.publicKey, isSigner: false, isWritable: true }, // Mint account
			{ pubkey: args.mintAuthorityAddress, isSigner: false, isWritable: true }, // Mint authority account
			{
				pubkey: associatedTokenAccountAddress,
				isSigner: false,
				isWritable: true,
			}, // ATA
			{ pubkey: user.publicKey, isSigner: true, isWritable: true }, // Payer
			{ pubkey: args.stateAddress, isSigner: false, isWritable: true }, // System program
			{
				pubkey: payer_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // System program
			{
				pubkey: args.pda_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // System program
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token program
			{
				pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
				isSigner: false,
				isWritable: false,
			}, // Token metadata program
		],
		programId: args.program.publicKey,
		data: instructionData_1.toBuffer(),
	});
	const sx = await sendAndConfirmTransaction(
		connection,
		new Transaction().add(ix_1),
		[user],
	);
	console.log(`mintTokensForExactStableWithSlippage txhash: ${sx}`);
}

export async function burnExactTokensForStable(
	connection: Connection,
	user: Keypair,
	args: InitArgs,
	amount: number,
) {
	let instructionData_1 = new BurnExactTokensForStableToArgs({
		instruction: SplMinterInstruction.BurnExactTokensForStable,
		_inAmount: BigInt(amount),
	});

	const associatedTokenAccountAddress = await getAssociatedTokenAddress(
		args.mintKeypair.publicKey,
		user.publicKey,
	);
	const payer_trade_token_ata_account = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		user.publicKey,
	);

	const pda_trade_token_authority = getPDATradeTokenAuthorityAddress(
		args.program.publicKey,
	);

	let ix_1 = new TransactionInstruction({
		keys: [
			{ pubkey: args.mintKeypair.publicKey, isSigner: false, isWritable: true }, // Mint account
			{
				pubkey: associatedTokenAccountAddress,
				isSigner: false,
				isWritable: true,
			}, // ATA
			{ pubkey: user.publicKey, isSigner: true, isWritable: true }, // Payer
			{ pubkey: args.stateAddress, isSigner: false, isWritable: true }, // System program
			{
				pubkey: payer_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // System program
			{ pubkey: pda_trade_token_authority, isSigner: false, isWritable: true }, // System program
			{
				pubkey: args.pda_trade_token_ata_account,
				isSigner: false,
				isWritable: true,
			}, // System program
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token program
		],
		programId: args.program.publicKey,
		data: instructionData_1.toBuffer(),
	});
	const sx = await sendAndConfirmTransaction(
		connection,
		new Transaction().add(ix_1),
		[user],
	);
	console.log(`burnExactTokensForStable txhash: ${sx}`);
}
