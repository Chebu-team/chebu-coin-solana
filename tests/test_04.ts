import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import {
	Connection,
	Keypair,
	SystemProgram,
	SYSVAR_RENT_PUBKEY,
	TransactionInstruction,
	Transaction,
	sendAndConfirmTransaction,
	LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
	ASSOCIATED_TOKEN_PROGRAM_ID,
	getAssociatedTokenAddress,
	TOKEN_PROGRAM_ID,
	createAssociatedTokenAccount,
} from '@solana/spl-token';

import { CreateTokenArgs, SplMinterInstruction } from './instructions';
import { init_keypairs_trade_token, initTradeToken } from './init_test';

import {
	approve_trade_token,
	mint_trade_token,
	MintTokensForExactStable,
} from './transactions_functions';

import {
	_calcMintTokensForExactStable,
	_distributedAmount,
	_currenRound,
	_calcMintStableForExactTokens,
	_calcBurnExactTokensForStable,
	_calcBurnTokensForExactStable,
} from './get_functions';

import { assert } from 'chai';

const START_PRICE = BigInt(1);
const PRICE_INCREASE_STEP = BigInt(1); // 1 decimal unit of stable coin
const INCREASE_FROM_ROUND = BigInt(1);
const memcoin_decimals = 7;
const ROUND_VOLUME = BigInt(1_000_000 * 10 ** memcoin_decimals); // in wei
/////////////////////////////////////////////////

const FEE_PERCENT_POINT = BigInt(50000);
const PERCENT_DENOMINATOR = BigInt(10000);

describe('ChebuTokenTest_a_04', async () => {
	//	let inUSDTAmount = 1_000_000_000_000;
	const connection = new Connection(`http://localhost:8899`, 'confirmed');
	//   const connection = new Connection(`https://api.devnet.solana.com/`, 'confirmed');

	let args = await init_keypairs_trade_token(connection);

	const payer_ATA_tradeToken = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		args.payer.publicKey,
	);
	const address_1: Keypair = Keypair.generate();
	const address_1_ATA_tradeToken = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		address_1.publicKey,
	);
	const address_1_ATA_Chebu = await getAssociatedTokenAddress(
		args.mintKeypair.publicKey,
		address_1.publicKey,
	);

	it('Init', async () => {
		await initTradeToken(connection, args);

		//create tradetoken ATA addres_1
		let tx_transfer = new Transaction().add(
			SystemProgram.transfer({
				fromPubkey: args.payer.publicKey,
				toPubkey: address_1.publicKey,
				lamports: LAMPORTS_PER_SOL / 100, //Investing 1 SOL. Remember 1 Lamport = 10^-9 SOL.
			}),
		);
		const tx_transfer_res = await sendAndConfirmTransaction(
			connection,
			new Transaction().add(tx_transfer),
			[args.payer],
		);

		let txhash = await connection.requestAirdrop(args.payer.publicKey, 1e9);
		//	console.log(`txhash: ${txhash}`);

		let ata = await createAssociatedTokenAccount(
			connection, // connection
			address_1, // fee payer
			args.tradeTokenKeypair.publicKey, // mint
			address_1.publicKey, // owner,
		);
	});

	it('Create Chebu Token', async () => {
		const instructionData = new CreateTokenArgs({
			instruction: SplMinterInstruction.Create,
			token_title: 'Chebu Mem Coin',
			token_symbol: 'CHEBU',
			token_uri: '',
			//trade_token: args.tradeTokenKeypair.publicKey.toBytes(),
			claim_authority: args.payer.publicKey.toBytes(),
		});

		let ix = new TransactionInstruction({
			keys: [
				{
					pubkey: args.mintKeypair.publicKey,
					isSigner: true,
					isWritable: true,
				}, // Mint account
				{
					pubkey: args.mintAuthorityAddress,
					isSigner: false,
					isWritable: true,
				}, // Mint authority account
				{ pubkey: args.metadataAddress, isSigner: false, isWritable: true }, // Metadata account
				{ pubkey: args.payer.publicKey, isSigner: true, isWritable: true }, // Payer
				{ pubkey: args.stateAddress, isSigner: false, isWritable: true }, // State
				{
					pubkey: args.pda_trade_token_ata_account,
					isSigner: false,
					isWritable: true,
				}, //PDA trade Token address
				{
					pubkey: args.PDATradeTokenAuthorityAddress,
					isSigner: false,
					isWritable: true,
				}, //PDA trade Token authority
				{
					pubkey: args.tradeTokenKeypair.publicKey,
					isSigner: false,
					isWritable: true,
				}, //PDA trade Token authority
				{ pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // Rent account
				{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
				{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token program
				{
					pubkey: TOKEN_METADATA_PROGRAM_ID,
					isSigner: false,
					isWritable: false,
				}, // Token metadata program
				{
					pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
					isSigner: false,
					isWritable: false,
				}, // Associated Token  program
			],
			programId: args.program.publicKey,
			data: instructionData.toBuffer(),
		});

		const sx = await sendAndConfirmTransaction(
			connection,
			new Transaction().add(ix),
			[args.payer, args.mintKeypair],
		);
	});

	it('test_Fuzz', async () => {
		async function testFuzz(inUSDTAmount: number) {
			if (inUSDTAmount < 1e2) {
				return;
			}
			console.log(inUSDTAmount);

			let userBeforMemcoinBalance = BigInt(0);
			try {
				let temp = (
					await connection.getTokenAccountBalance(address_1_ATA_Chebu)
				).value.amount;
				userBeforMemcoinBalance = BigInt(temp);
			} catch (err) {}

			let beforUSDTContractBalance = BigInt(0);
			try {
				let temp = (
					await connection.getTokenAccountBalance(
						args.pda_trade_token_ata_account,
					)
				).value.amount;
				beforUSDTContractBalance = BigInt(temp);
			} catch (err) {}
			//        let inUSDTAmount = 100e6;
			let [outMEMCoinAmount] = await _calcMintTokensForExactStable(
				BigInt(inUSDTAmount),
				{ connection, mintAccount: args.mintKeypair.publicKey },
			);

			await mint_trade_token(
				connection,
				address_1_ATA_tradeToken,
				args.payer,
				args.tradeTokenKeypair.publicKey,
				Number(inUSDTAmount),
			);
			await approve_trade_token(
				connection,
				address_1,
				args,
				Number(inUSDTAmount),
			);

			await MintTokensForExactStable(
				connection,
				address_1,
				args,
				Number(inUSDTAmount),
			);

			let userMemcoinBalance = (
				await connection.getTokenAccountBalance(address_1_ATA_Chebu)
			).value.amount;
			let userMemcoinBalancePlus =
				BigInt(userMemcoinBalance) - userBeforMemcoinBalance;

			assert.approximately(
				Number(userMemcoinBalancePlus),
				Number(outMEMCoinAmount),
				4e6,
				'High range out balance',
			);

			let afterUSDTContractBalance = (
				await connection.getTokenAccountBalance(
					args.pda_trade_token_ata_account,
				)
			).value.amount;
			let afterUSDTContractBalancePlus =
				BigInt(afterUSDTContractBalance) - beforUSDTContractBalance;

			assert(
				BigInt(afterUSDTContractBalancePlus) == BigInt(inUSDTAmount),
				'Not USD equal',
			);
		}

		function randomInteger(min, max) {
			return Math.floor(Math.random() * (max - min + 1)) + min;
		}

		for (let i = 0; i < 5; i++) {
			await testFuzz(randomInteger(1e2, 1_000_000e6));
		}
	});
});
