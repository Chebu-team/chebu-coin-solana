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
	getMint,
} from '@solana/spl-token';
import { Buffer } from 'buffer';
import { CreateTokenArgs, SplMinterInstruction } from './instructions';
import {
	getCastomError,
	init_keypairs_trade_token,
	initTradeToken,
} from './init_test';

import {
	approve_trade_token,
	burnExactTokensForStable,
	claim_token,
	mint_trade_token,
	MintTokensForExactStable,
	mintTokensForExactStableWithSlippage,
} from './transactions_functions';

import {
	_calcMintTokensForExactStable,
	_distributedAmount,
	_currenRound,
	getState,
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

describe('SPL Token Minter', async () => {
	let inUSDTAmount = 1_000_000_000_000_0;
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

	const address_2: Keypair = Keypair.generate();
	const address_2_ATA_tradeToken = await getAssociatedTokenAddress(
		args.tradeTokenKeypair.publicKey,
		address_1.publicKey,
	);
	const address_2_ATA_Chebu = await getAssociatedTokenAddress(
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

		let ata = await createAssociatedTokenAccount(
			connection, // connection
			address_1, // fee payer
			args.tradeTokenKeypair.publicKey, // mint
			address_1.publicKey, // owner,
		);

		//create tradetoken ATA addres_2
		let tx_transfer2 = new Transaction().add(
			SystemProgram.transfer({
				fromPubkey: args.payer.publicKey,
				toPubkey: address_2.publicKey,
				lamports: LAMPORTS_PER_SOL / 100, //Investing 1 SOL. Remember 1 Lamport = 10^-9 SOL.
			}),
		);
		const tx_transfer_res2 = await sendAndConfirmTransaction(
			connection,
			new Transaction().add(tx_transfer2),
			[args.payer],
		);

		let txhash2 = await connection.requestAirdrop(args.payer.publicKey, 1e9);

		let ata2 = await createAssociatedTokenAccount(
			connection, // connection
			address_2, // fee payer
			args.tradeTokenKeypair.publicKey, // mint
			address_2.publicKey, // owner,
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

	it('ChebuTokenTest_a_01 test_Mint', async () => {
		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);

		//TODO check max supply

		inUSDTAmount = 100e6; //100 usdt
		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);

		let inCleanedUSDTAmount: bigint =
			(BigInt(inUSDTAmount * 100) * PERCENT_DENOMINATOR) /
			(BigInt(100) * PERCENT_DENOMINATOR + FEE_PERCENT_POINT);
		let calculatedFee: bigint = BigInt(inUSDTAmount) - inCleanedUSDTAmount;

		let mintAccount = await getMint(connection, args.mintKeypair.publicKey);

		let round: bigint = BigInt(mintAccount.supply) / ROUND_VOLUME + BigInt(1);
		let price: bigint = BigInt(0);
		let roundUSDTAmount: bigint = BigInt(0);
		let memcoinAmount: bigint = BigInt(0);
		let beforeUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;

		while (inCleanedUSDTAmount > 0) {
			price = START_PRICE + (round - BigInt(1)) * PRICE_INCREASE_STEP; //per 1e12 memcoins
			roundUSDTAmount = (ROUND_VOLUME * price) / BigInt(10 ** memcoin_decimals);
			if (inCleanedUSDTAmount > roundUSDTAmount) {
				memcoinAmount += ROUND_VOLUME;
				inCleanedUSDTAmount -= roundUSDTAmount;
				round += BigInt(1);
			} else {
				memcoinAmount +=
					(inCleanedUSDTAmount * BigInt(10 ** memcoin_decimals)) / price;
				inCleanedUSDTAmount = BigInt(0);
			}
		}

		let [outAmount_2, inFee_2] = await _calcMintTokensForExactStable(
			BigInt(inUSDTAmount),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		console.log('outAmount_2: {}, inFee_2: {}', outAmount_2, inFee_2);

		assert(outAmount_2 == memcoinAmount, 'Amount not equal');
		assert(inFee_2 == calculatedFee, 'Fee not equal');

		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);
		await MintTokensForExactStable(connection, address_1, args, inUSDTAmount);
		let memcoin_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		assert(memcoin_supply == outAmount_2, 'Supply not equal');

		let memcoin_round = await _currenRound({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		assert(memcoin_round == round, 'Round not equal');

		let afterUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;
		assert(
			BigInt(afterUSDTContractBalance) ==
				BigInt(beforeUSDTContractBalance) + BigInt(inUSDTAmount),
			'Balanc USDT not equal',
		);

		let claim_un_err = [];
		try {
			await claim_token(connection, address_1, args, Number(inFee_2));
		} catch (err) {
			claim_un_err = err;
		}
		assert(getCastomError(claim_un_err) == '0x3', 'Expected (0x3) error');

		let claim_err = '';
		try {
			await claim_token(connection, args.payer, args, Number(inFee_2) + 1);
		} catch (err) {
			claim_err = '1';
		}
		assert(claim_err != '', 'Expected error');

		beforeUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;
		let beforeUSDTPayerBalance = '0';
		await claim_token(
			connection,
			args.payer,
			args,
			Number(inFee_2 / BigInt(10)),
		);
		let state = await getState(connection, args);
		assert(state.claimed == inFee_2 / BigInt(10), 'Expected equall claim');
		assert(state.total == calculatedFee, 'Expected equall fee');

		afterUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;
		let afterUSDTPayerBalance = (
			await connection.getTokenAccountBalance(payer_ATA_tradeToken)
		).value.amount;

		assert(
			BigInt(afterUSDTContractBalance) ==
				BigInt(beforeUSDTContractBalance) - inFee_2 / BigInt(10),
			'Expected equall contract usdt balance',
		);
		assert(
			BigInt(afterUSDTPayerBalance) ==
				BigInt(beforeUSDTPayerBalance) + inFee_2 / BigInt(10),
			'Expected equall payer usdt balance',
		);

		inCleanedUSDTAmount =
			(BigInt(inUSDTAmount * 100) * PERCENT_DENOMINATOR) /
			(BigInt(100) * PERCENT_DENOMINATOR + FEE_PERCENT_POINT);
		calculatedFee = BigInt(inUSDTAmount) - inCleanedUSDTAmount;
		let lastUSDTForCurrentRound: bigint =
			((round * ROUND_VOLUME - memcoinAmount) * price) /
			BigInt(10 ** memcoin_decimals);

		// close current round and prepare data for next purchases
		inCleanedUSDTAmount = inCleanedUSDTAmount - lastUSDTForCurrentRound;
		console.log('round', round);
		console.log('round2', memcoinAmount / ROUND_VOLUME + BigInt(1));

		let memcoinAmountBefore = memcoinAmount;
		memcoinAmount = round * ROUND_VOLUME;
		round += BigInt(1);

		while (inCleanedUSDTAmount > 0) {
			price = START_PRICE + (round - BigInt(1)) * PRICE_INCREASE_STEP; //per 1e12 memcoins
			roundUSDTAmount = (ROUND_VOLUME * price) / BigInt(10 ** memcoin_decimals);
			if (inCleanedUSDTAmount > roundUSDTAmount) {
				memcoinAmount += ROUND_VOLUME;
				inCleanedUSDTAmount -= roundUSDTAmount;
			} else {
				memcoinAmount +=
					(inCleanedUSDTAmount * BigInt(10 ** memcoin_decimals)) / price;
				inCleanedUSDTAmount = BigInt(0);
			}
			round += BigInt(1);
		}
		[outAmount_2, inFee_2] = await _calcMintTokensForExactStable(
			BigInt(inUSDTAmount),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		console.log('outAmount_2', outAmount_2);

		assert(inFee_2 == calculatedFee, 'Fee not equal');
		assert(
			outAmount_2 == memcoinAmount - memcoinAmountBefore,
			'Amount not equal',
		);

		let [inAmount, inFee] = await _calcMintStableForExactTokens(
			memcoinAmount - memcoinAmountBefore,
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		assert.approximately(inUSDTAmount, Number(inAmount), 1, 'High range');

		await MintTokensForExactStable(connection, address_1, args, inUSDTAmount);
		memcoin_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		console.log('memcoin_supply', memcoin_supply);
		console.log('memcoinAmount', memcoinAmount);
		assert(memcoin_supply == memcoinAmount, 'Supply not equal');

		let Addres_1_MemcoinBalance = (
			await connection.getTokenAccountBalance(address_1_ATA_Chebu)
		).value.amount;
		assert(
			BigInt(Addres_1_MemcoinBalance) == memcoinAmount,
			'addres_1 balance not equal',
		);
	});

	it('ChebuTokenTest_a_01 test_Burn', async () => {
		// calculate burn
		inUSDTAmount = 200e6;
		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);
		await MintTokensForExactStable(connection, address_1, args, inUSDTAmount);

		let round = await _currenRound({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		let memcoinAmount = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		let burntAmount = BigInt(2_000_000e7); // burnt amount
		//				 let burntAmount = BigInt(2_000_000e7); // burnt amount

		let restMemcoinsInLastRound =
			memcoinAmount - (round - BigInt(1)) * ROUND_VOLUME;

		let price = round;
		let bAm = burntAmount - restMemcoinsInLastRound;
		let calculatedUSDT =
			(restMemcoinsInLastRound * price) / BigInt(10 ** memcoin_decimals);
		memcoinAmount -= restMemcoinsInLastRound;

		round -= BigInt(1);
		//				 beforeUSDTAccBalance = usdt.balanceOf(address(1));
		//				 beforeUSDTContractBalance = usdt.balanceOf(address(memcoin));
		let beforeUSDTAccBalance = (
			await connection.getTokenAccountBalance(address_1_ATA_tradeToken)
		).value.amount;
		let beforeUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;

		while (bAm > 0) {
			price = round; //per 1e12 memcoins

			if (bAm > ROUND_VOLUME) {
				calculatedUSDT +=
					(ROUND_VOLUME * price) / BigInt(10 ** memcoin_decimals);
				memcoinAmount -= ROUND_VOLUME;

				bAm -= ROUND_VOLUME;
				round -= BigInt(1);
			} else {
				calculatedUSDT += (bAm * price) / BigInt(10 ** memcoin_decimals);
				memcoinAmount -= bAm;
				bAm = BigInt(0);
			}
		}

		let outUsdtAmount =
			(calculatedUSDT *
				(BigInt(100) * PERCENT_DENOMINATOR - FEE_PERCENT_POINT)) /
			(BigInt(100) * PERCENT_DENOMINATOR);
		let fee = calculatedUSDT - outUsdtAmount;
		let [outAmount, outAmountFee] = await _calcBurnExactTokensForStable(
			burntAmount,
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//				 assertApproxEqAbs(outUsdtAmount, outAmount, 1);
		//				 assertApproxEqAbs(outAmountFee, fee, 1);

		assert.approximately(
			Number(outUsdtAmount),
			Number(outAmount),
			1,
			'High range burn outAmount',
		);
		assert.approximately(
			Number(outAmountFee),
			Number(fee),
			1,
			'High range  burn fee',
		);

		let [inAmount, includeFee] = await _calcBurnTokensForExactStable(
			outUsdtAmount,
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//				 assertApproxEqAbs(includeFee, fee, 1);
		//				 assertApproxEqAbs(inAmount, burntAmount, 10 ** (memcoin_decimals - 1));
		assert.approximately(
			Number(inAmount),
			Number(burntAmount),
			10 ** (memcoin_decimals - 1),
			'High range calc outAmount',
		);
		assert.approximately(
			Number(includeFee),
			Number(fee),
			1,
			'High range calc fee',
		);

		await burnExactTokensForStable(
			connection,
			address_1,
			args,
			Number(burntAmount),
		);

		//				assertEq(memcoin.balanceOf(address(1)), memcoin.totalSupply());
		//				assertEq(memcoin.balanceOf(address(1)), memcoinAmount);
		let memcoin_totalSupply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		let MemcoinAccBalance = (
			await connection.getTokenAccountBalance(address_1_ATA_Chebu)
		).value.amount;
		assert(
			BigInt(MemcoinAccBalance) == memcoinAmount,
			'addres_1 balance not equal memcoinAmount',
		);
		assert(
			BigInt(MemcoinAccBalance) == memcoin_totalSupply,
			'addres_1 balance not equal',
		);

		let afterUSDTAccBalance = (
			await connection.getTokenAccountBalance(address_1_ATA_tradeToken)
		).value.amount;
		let afterUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;

		//				 assertApproxEqAbs(usdt.balanceOf(address(1)), beforeUSDTAccBalance + outUsdtAmount, 1);
		//				 assertApproxEqAbs(usdt.balanceOf(address(memcoin)), beforeUSDTContractBalance - outUsdtAmount, 1);
		console.log('beforeUSDTAccBalance', beforeUSDTAccBalance);
		console.log(
			'beforeUSDTAccBalance + outUsdtAmount',
			BigInt(beforeUSDTAccBalance) + outUsdtAmount,
		);
		console.log('afterUSDTAccBalance', afterUSDTAccBalance);

		assert.approximately(
			Number(afterUSDTAccBalance),
			Number(BigInt(beforeUSDTAccBalance) + outUsdtAmount),
			1,
			'High range user balance',
		);
		assert.approximately(
			Number(afterUSDTContractBalance),
			Number(beforeUSDTContractBalance) - Number(outUsdtAmount),
			1,
			'High range contact balabnce',
		);

		//				 assertEq(round, memcoin.getCurrentRound());
		assert(
			round ==
				(await _currenRound({
					connection,
					mintAccount: args.mintKeypair.publicKey,
				})),
			'round  not equal',
		);

		// very small amount to burn - expect revert
		//				 burntAmount = 1e16;
		let burntAmount_small = 1e5;
		let claim_un_err = '';
		try {
			await burnExactTokensForStable(
				connection,
				address_1,
				args,
				burntAmount_small,
			);
		} catch (err) {
			claim_un_err = err;
		}
		assert(getCastomError(claim_un_err) == '0x0', 'Expected (0x0) error');
	});

	it('ChebuTokenTest_a_01 test_checkSlippage', async () => {
		// check slippage
		let inUSDTAmount = 200e6;
		//				usdt.transfer(address(1), inUSDTAmount);
		//				vm.startPrank(address(1));
		//				usdt.approve(address(memcoin), inUSDTAmount);

		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);

		let [wishOutAmount] = await _calcMintTokensForExactStable(
			BigInt(inUSDTAmount),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//vm.expectRevert('Slippage occur');
		let claim_un_err = '';
		try {
			await mintTokensForExactStableWithSlippage(
				connection,
				address_1,
				args,
				inUSDTAmount,
				Number(wishOutAmount) + 1,
			);
		} catch (err) {
			claim_un_err = err;
		}
		assert(getCastomError(claim_un_err) == '0x4', 'Expected (0x4) error');

		await mintTokensForExactStableWithSlippage(
			connection,
			address_1,
			args,
			inUSDTAmount,
			Number(wishOutAmount),
		);
	});
});
