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
	burnExactTokensForStable,
	mint_trade_token,
	MintTokensForExactStable,
} from './transactions_functions';

import {
	_calcMintTokensForExactStable,
	_distributedAmount,
	_currenRound,
	getState,
	_calcMintStableForExactTokens,
	_calcBurnExactTokensForStable,
	_calcBurnTokensForExactStable,
	_priceInUnitsAndRemainByRound,
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

describe('ChebuTokenTest_m_01', async () => {
	//	let inUSDTAmount = 1_000_000_000_000;
	let inAmountStable_1 = 2_100_000;
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
	console.log('address_1.publicKey', address_1.publicKey);
	console.log('address_1_ATA_tradeToken', address_1_ATA_tradeToken);
	console.log('address_1_ATA_Chebu', address_1_ATA_Chebu);
	console.log('args.mintKeypair.publicKey', args.mintKeypair.publicKey);

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

	it('test_MintPrice', async () => {
		//		let [price, ] = await _priceAndRemainByRound(1);
		let [price] = await _priceInUnitsAndRemainByRound(BigInt(1), {
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});

		//        assertEq(price, 1);
		assert(price == BigInt(1), 'Not equal price');

		let [outAmount, inAmountFee] = await _calcMintTokensForExactStable(
			BigInt(inAmountStable_1),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//        assertEq(outAmount,15e23);
		//        assertEq(inAmountFee, 1e5);
		console.log('outAmount', outAmount);
		console.log('15e23', 15e12);

		assert(outAmount == BigInt(15e12), 'Not outAmount price');
		assert(inAmountFee == BigInt(1e5), 'Not inAmountFee price');

		let [inAmount, includeFee] = await _calcMintStableForExactTokens(
			BigInt(15e12),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//        assertEq(inAmount, inAmountStable_1);
		//        assertEq(includeFee, 1e5);
		assert(inAmount == BigInt(inAmountStable_1), 'Not inAmount price 2');
		assert(includeFee == BigInt(1e5), 'Not includeFee price ');
	});

	it('test_Mint', async () => {
		///        usdt.approve(address(memcoin), inAmountStable_1);
		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			Number(inAmountStable_1),
		);
		await approve_trade_token(
			connection,
			address_1,
			args,
			Number(inAmountStable_1),
		);
		try {
			await MintTokensForExactStable(
				connection,
				address_1,
				args,
				inAmountStable_1,
			);
		} catch (err) {
			console.log('err:', err);
		}
		//		assertEq(memcoin.totalSupply(), 1_500_000e7);
		let cur_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});

		assert(cur_supply == BigInt(1_500_000e7), 'Supply not equal 2');

		//		assertEq(memcoin.balanceOf(address(this)), 1_500_000e7);
		let memcoinUserBalance = BigInt(
			(await connection.getTokenAccountBalance(address_1_ATA_Chebu)).value
				.amount,
		);

		assert(memcoinUserBalance == BigInt(1_500_000e7), 'User balance not equal');

		//		assertEq(usdt.balanceOf(address(memcoin)), inAmountStable_1);
		let USDTContractBalance = BigInt(
			(
				await connection.getTokenAccountBalance(
					args.pda_trade_token_ata_account,
				)
			).value.amount,
		);
		assert(
			USDTContractBalance == BigInt(inAmountStable_1),
			'Contact balance not equal ',
		);
	});

	it('test_BurnPrice', async () => {
		//don above
		//		usdt.approve(address(memcoin), inAmountStable_1);
		//        memcoin.mintTokensForExactStable(inAmountStable_1);

		let [price, minted] = await _priceInUnitsAndRemainByRound(BigInt(2), {
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});

		//        assertEq(price, 2);
		assert(price == BigInt(2), 'Not equal price');

		//        assertEq(minted, 500_000e18);
		assert(minted == BigInt(500_000e7), 'Not equal mint');

		let [outAmount, outAmountFee] = await _calcBurnExactTokensForStable(
			BigInt(1_500_000e7),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//        assertEq(outAmount, 1_900000);
		//        assertEq(outAmountFee, 100000);
		assert(outAmount == BigInt(1_900000), 'Not equal outAmount');
		assert(outAmountFee == BigInt(100000), 'Not equal outAmountFee');

		let [inAmount, includeFee] = await _calcBurnTokensForExactStable(
			BigInt(1_900000),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//        assertEq(inAmount, 1_500_000e7);
		//        assertEq(includeFee, 100000);
		assert(inAmount == BigInt(1_500_000e7), 'Not equal inAmount');
		assert(includeFee == BigInt(100000), 'Not equal includeFee');
	});

	it('test_Burn', async () => {
		//don above
		//				usdt.approve(address(memcoin), inAmountStable_1);
		//				memcoin.mintTokensForExactStable(inAmountStable_1);
		//				memcoin.approve(address(memcoin), memcoin.balanceOf(address(this)));
		let cur_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});

		await burnExactTokensForStable(
			connection,
			address_1,
			args,
			Number(cur_supply),
		);
		//				(uint256 t, ) = memcoin.fee();
		let state = await getState(connection, args);

		cur_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		//				assertEq(memcoin.totalSupply(), 0);
		assert(cur_supply == BigInt(0), 'Not equal supply');

		//				assertEq(usdt.balanceOf(address(memcoin)), t);
		let USDTContractBalance = BigInt(
			(
				await connection.getTokenAccountBalance(
					args.pda_trade_token_ata_account,
				)
			).value.amount,
		);
		assert(
			USDTContractBalance == BigInt(state.total),
			'Contact balance not equal ',
		);
	});
});
