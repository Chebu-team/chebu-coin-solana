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

describe('ChebuTokenTest_a_02', async () => {
	let inUSDTAmount = 1_000_000_000_000;
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

	it('test_Mint', async () => {
		/*		usdt.transfer(address(1), inUSDTAmount);      
        usdt.approve(address(memcoin), inUSDTAmount);
*/
		inUSDTAmount = 1_000_000e6;
		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);

		let inCleanedUSDTAmount =
			(BigInt(inUSDTAmount) * BigInt(100) * PERCENT_DENOMINATOR) /
			(BigInt(100) * PERCENT_DENOMINATOR + FEE_PERCENT_POINT);
		let calculatedFee = BigInt(inUSDTAmount) - inCleanedUSDTAmount;

		let round = BigInt(1);
		let price = BigInt(0);
		let roundUSDTAmount = BigInt(0);
		let memcoinAmount = BigInt(0);
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
		let [outAmount, inAmountFee] = await _calcMintTokensForExactStable(
			BigInt(inUSDTAmount),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//assertEq(outAmount,memcoinAmount);
		//assertEq(inAmountFee, calculatedFee);
		assert(outAmount == memcoinAmount, 'Amount not equal');
		assert(inAmountFee == calculatedFee, 'Fee not equal');

		await MintTokensForExactStable(connection, address_1, args, inUSDTAmount);

		//assertEq(round, memcoin.getCurrentRound());
		//assertEq(memcoin.totalSupply(),memcoinAmount);
		let cur_round = await _currenRound({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		let cur_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});
		assert(round == cur_round, 'Round not equal');
		assert(cur_supply == memcoinAmount, 'Suuply not equal');

		//        let [total, claimed] = memcoin.fee();
		let state = await getState(connection, args);
		//assertEq(total, calculatedFee);
		//assertEq(claimed, 0);
		assert(state.total == calculatedFee, 'Expected equall fee');
		assert(state.claimed == BigInt(0), 'Expected equall claim');

		let afterUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;
		//assertEq(usdt.balanceOf(address(memcoin)), beforeUSDTContractBalance + inUSDTAmount);
		assert(
			BigInt(afterUSDTContractBalance) ==
				BigInt(beforeUSDTContractBalance) + BigInt(inUSDTAmount),
			'Expected equall fee',
		);

		// try to calculate memcoin amount for exact usdt amount
		// next 1 000 000 usdt

		inCleanedUSDTAmount =
			(BigInt(inUSDTAmount) * BigInt(100) * PERCENT_DENOMINATOR) /
			(BigInt(100) * PERCENT_DENOMINATOR + FEE_PERCENT_POINT);
		calculatedFee = BigInt(inUSDTAmount) - inCleanedUSDTAmount;
		let lastUSDTForCurrentRound =
			((round * ROUND_VOLUME - memcoinAmount) * price) /
			BigInt(10 ** memcoin_decimals);

		// close current round and prepare data for next purchases
		inCleanedUSDTAmount = inCleanedUSDTAmount - lastUSDTForCurrentRound;
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

		[outAmount, inAmountFee] = await _calcMintTokensForExactStable(
			BigInt(inUSDTAmount),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//assertEq(inAmountFee, calculatedFee);
		//assertEq(outAmount, memcoinAmount - memcoinAmountBefore);
		assert(
			outAmount == memcoinAmount - memcoinAmountBefore,
			'Amount not equal 2',
		);
		assert(inAmountFee == calculatedFee, 'Fee not equal 2');

		let [inAmount] = await _calcMintStableForExactTokens(
			memcoinAmount - memcoinAmountBefore,
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//assertApproxEqAbs(inUSDTAmount, inAmount, 3);
		assert.approximately(inUSDTAmount, Number(inAmount), 3, 'High range');

		// buy the next part of memcoins (by 1000 000 usdt)
		//        usdt.transfer(address(1), inUSDTAmount);

		//        usdt.approve(address(memcoin), inUSDTAmount);
		//        await MintTokensForExactStable(connection,address_1,args,inUSDTAmount);

		await mint_trade_token(
			connection,
			address_1_ATA_tradeToken,
			args.payer,
			args.tradeTokenKeypair.publicKey,
			inUSDTAmount,
		);
		await approve_trade_token(connection, address_1, args, inUSDTAmount);

		await MintTokensForExactStable(connection, address_1, args, inUSDTAmount);
		//assertEq(memcoinAmount, memcoin.totalSupply());
		cur_supply = await _distributedAmount({
			connection,
			mintAccount: args.mintKeypair.publicKey,
		});

		assert(memcoinAmount == cur_supply, 'Supply not equal 2');
		//assertEq(memcoin.balanceOf(address(1)),memcoinAmount);
		let userMemcoinBalance = (
			await connection.getTokenAccountBalance(address_1_ATA_Chebu)
		).value.amount;
		assert(
			BigInt(userMemcoinBalance) == memcoinAmount,
			'User balance not equal',
		);
	});

	it('test_Burn', async () => {
		// calculate burn
		inUSDTAmount = 2_000_000e6; // 2 000 000 usdt
		//				 usdt.transfer(address(1), inUSDTAmount);

		//				 usdt.approve(address(memcoin), inUSDTAmount);

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
		let burntAmount = 200_000_000e7; // burnt amount
		let restMemcoinsInLastRound =
			memcoinAmount - (round - BigInt(1)) * ROUND_VOLUME;
		let price = START_PRICE + (round - BigInt(1)) * PRICE_INCREASE_STEP;
		let bAm = BigInt(burntAmount) - restMemcoinsInLastRound;
		let calculatedUSDT =
			(restMemcoinsInLastRound * price) / BigInt(10 ** memcoin_decimals);
		memcoinAmount -= restMemcoinsInLastRound;

		round -= BigInt(1);
		//				 let beforeUSDTAccBalance = usdt.balanceOf(address(1));
		//				 let beforeUSDTContractBalance = usdt.balanceOf(address(memcoin));
		let beforeUSDTAccBalance = (
			await connection.getTokenAccountBalance(address_1_ATA_tradeToken)
		).value.amount;
		let beforeUSDTContractBalance = (
			await connection.getTokenAccountBalance(args.pda_trade_token_ata_account)
		).value.amount;

		while (bAm > 0) {
			price = START_PRICE + (round - BigInt(1)) * PRICE_INCREASE_STEP; //per 1e12 memcoins
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
			BigInt(burntAmount),
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//assertApproxEqAbs(outUsdtAmount, outAmount, 1);
		//assertApproxEqAbs(outAmountFee, fee, 1);

		let [inAmount, includeFee] = await _calcBurnTokensForExactStable(
			outUsdtAmount,
			{ connection, mintAccount: args.mintKeypair.publicKey },
		);
		//assertApproxEqAbs(includeFee, fee, 1);
		//assertApproxEqAbs(inAmount, burntAmount, 10 ** (memcoin_decimals - 1));

		//				 memcoin.approve(address(memcoin), burntAmount);
		//emit TradeManager.Deal(address(1), address(memcoin), burntAmount, outUsdtAmount);
		burnExactTokensForStable(connection, address_1, args, burntAmount);
	});
});
