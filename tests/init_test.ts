import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
} from '@solana/web3.js';
import {
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
	MINT_SIZE,
	getMinimumBalanceForRentExemptMint,
	createInitializeMintInstruction,
} from '@solana/spl-token';
import { Buffer } from 'buffer';

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
	program_id: Keypair,
): Promise<PublicKey> {
	const pda = getPDATradeTokenAuthorityAddress(program_id);

	return await getAssociatedTokenAddress(mint_acc.publicKey, pda, true);
}

export function getPDATradeTokenAuthorityAddress(key: Keypair): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from('ata_trade_token_authority')],
		key.publicKey,
	)[0];
}

export type InitArgs = {
	payer: Keypair;
	program: Keypair;
	mintKeypair: Keypair;
	tradeTokenKeypair: Keypair;
	metadataAddress: PublicKey;
	mintAuthorityAddress: PublicKey;
	stateAddress: PublicKey;
	pda_trade_token_ata_account: PublicKey;
	PDATradeTokenAuthorityAddress: PublicKey;
};

export async function init_keypairs_trade_token(
	connection1: Connection,
): Promise<InitArgs> {
	const payer = createKeypairFromFile(
		require('os').homedir() + '/.config/solana/id.json',
	);

	const program = createKeypairFromFile(
		'./program/target/deploy/spl_token_minter_native_program-keypair.json',
	);
	const mintKeypair: Keypair = Keypair.generate();
	const tradeTokenKeypair: Keypair = Keypair.generate();

	const metadataAddress = getPDAmetadataAddress(mintKeypair);
	const mintAuthorityAddress = getMintAuthorityAddress(program);
	const stateAddress = getStateAddress(program);
	const pda_trade_token_ata_account = await getpda_trade_token_ata_account(
		tradeTokenKeypair,
		program,
	);
	const PDATradeTokenAuthorityAddress =
		getPDATradeTokenAuthorityAddress(program);

	return {
		payer,
		program,
		mintKeypair,
		tradeTokenKeypair,
		metadataAddress,
		mintAuthorityAddress,
		stateAddress,
		pda_trade_token_ata_account,
		PDATradeTokenAuthorityAddress,
	};
}

export async function initTradeToken(connection: Connection, args: InitArgs) {
	let tx = new Transaction().add(
		// create mint account
		SystemProgram.createAccount({
			fromPubkey: args.payer.publicKey,
			newAccountPubkey: args.tradeTokenKeypair.publicKey,
			space: MINT_SIZE,
			lamports: await getMinimumBalanceForRentExemptMint(connection),
			programId: TOKEN_PROGRAM_ID,
		}),
		// init mint account
		createInitializeMintInstruction(
			args.tradeTokenKeypair.publicKey, // mint pubkey
			6, // decimals
			args.payer.publicKey, // mint authority
			args.payer.publicKey, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
		),
	);

	await connection.sendTransaction(tx, [
		args.payer,
		args.tradeTokenKeypair /* fee payer + mint authority */,
	]);
}

export function getCastomError(err: any): string {
	if (err.logs) {
		let arr = [];
		arr = err.logs[err.logs.length - 1].split(' ');
		if (arr.length == 7) {
			if ((arr[3] = 'custom')) {
				return arr[6];
			}
		}
	}
	return '';
}
