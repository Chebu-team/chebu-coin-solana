import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { struct } from '@solana/buffer-layout';
import { publicKey, u64 } from '@solana/buffer-layout-utils';
import { InitArgs } from './init_test';

export interface accountStateData {
	mint_account: PublicKey;
	trade_token_address: PublicKey;
	total: bigint;
	claimed: bigint;
	claime_authority: PublicKey;
}
export const StateLayout = struct<accountStateData>([
	publicKey('mint_account'),
	publicKey('trade_token_address'),
	u64('total'),
	u64('claimed'),
	publicKey('claime_authority'),
]);

const START_PRICE = BigInt(1);
const PRICE_INCREASE_STEP = BigInt(1); // 1 decimal unit of stable coin
const INCREASE_FROM_ROUND = BigInt(1);
const _distributionTokenDecimals = 7;
const ROUND_VOLUME = BigInt(1_000_000 * 10 ** _distributionTokenDecimals); // in wei
/////////////////////////////////////////////////

const FEE_PERCENT_POINT = BigInt(50000);
const PERCENT_DENOMINATOR = BigInt(10000);

export class Args {
	connection: Connection;
	mintAccount: PublicKey;
}

export async function calcMintTokensForExactStable_calcMintTokensForExactStable(
	_inAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	return await _calcMintTokensForExactStable(_inAmount, args);
}

export async function _calcMintTokensForExactStable(
	_inAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	// Calc realy inamount with excluded fee
	let inA: bigint =
		(_inAmount * BigInt(100) * PERCENT_DENOMINATOR) /
		(BigInt(100) * PERCENT_DENOMINATOR + FEE_PERCENT_POINT);

	let inAmountFee = _inAmount - inA;
	let curR = await _currenRound(args);

	let curPrice = BigInt(0);
	let curRest = BigInt(0);
	let outAmount = BigInt(0);

	let dstTokenDecimals = _distributionTokenDecimals;
	let counter = 0;
	while (inA > 0) {
		counter++;
		[curPrice, curRest] = await _priceInUnitsAndRemainByRound(curR, args);

		if (
			// calc out amount
			(inA * BigInt(10 ** dstTokenDecimals)) / curPrice >
			curRest
		) {
			outAmount += curRest;
			inA -= (curRest * curPrice) / BigInt(10 ** dstTokenDecimals);
			++curR;
		} else {
			// Case when inAmount less or eqal then price of all tokens
			// in current round
			outAmount += (inA * BigInt(10 ** dstTokenDecimals)) / curPrice;

			return [outAmount, inAmountFee];
		}
	}
	console.log('counter: ', counter);
	return [outAmount, inAmountFee];
}

export async function priceAndRemainByRound(
	_round: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	return await _priceInUnitsAndRemainByRound(_round, args);
}

export async function _priceInUnitsAndRemainByRound(
	_round: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	let price = _priceForRound(_round);
	let rest = BigInt(0);
	let currenRound = await _currenRound(args);
	let distributedAmount = await _distributedAmount(args);
	// in finished rounds rest always zero
	if (_round < currenRound) {
		rest = BigInt(0);

		// in current round need calc
	} else if (_round == currenRound) {
		if (_round == BigInt(1)) {
			// first round
			rest = ROUND_VOLUME - distributedAmount;
		} else {
			rest = ROUND_VOLUME - (distributedAmount % ROUND_VOLUME);
		}

		// in future rounds rest always ROUND_VOLUME
	} else {
		rest = ROUND_VOLUME;
	}
	return [price, rest];
}

export async function _distributedAmount(args: Args): Promise<bigint> {
	let mintAccount = await getMint(args.connection, args.mintAccount);

	return BigInt(mintAccount.supply);
}

export function _priceForRound(_round: bigint): bigint {
	let price = BigInt(0);
	if (_round < INCREASE_FROM_ROUND) {
		START_PRICE;
	} else {
		price = PRICE_INCREASE_STEP * (_round - INCREASE_FROM_ROUND + BigInt(1));
	}
	return price;
}

export async function getCurrentRound(args: Args): Promise<bigint> {
	return await _currenRound(args);
}

export async function _currenRound(args: Args): Promise<bigint> {
	return (await _distributedAmount(args)) / ROUND_VOLUME + BigInt(1);
}

export async function getState(
	connection: Connection,
	args: InitArgs,
): Promise<accountStateData> {
	let stateAccount = await connection.getAccountInfo(
		args.stateAddress,
		'processed',
	);
	return StateLayout.decode(stateAccount.data);
}

export async function calcMintStableForExactTokens(
	_outAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	return await _calcMintStableForExactTokens(_outAmount, args);
}

export async function _calcMintStableForExactTokens(
	_outAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	let outA = _outAmount;
	let curR = await _currenRound(args);
	let curPrice: bigint = BigInt(0);
	let curRest: bigint = BigInt(0);
	let inAmount: bigint = BigInt(0);
	let dstTokenDecimals = _distributionTokenDecimals;
	while (outA > 0) {
		[curPrice, curRest] = await _priceInUnitsAndRemainByRound(curR, args);
		if (outA > curRest) {
			inAmount += (curRest * curPrice) / BigInt(10 ** dstTokenDecimals);
			outA -= curRest;
			++curR;
		} else {
			inAmount += (outA * curPrice) / BigInt(10 ** dstTokenDecimals);
			break;
		}
	}
	// Fee Charge
	let includeFee =
		(inAmount * FEE_PERCENT_POINT) / (BigInt(100) * PERCENT_DENOMINATOR);
	inAmount += includeFee; // return inAmount with fee incleded
	return [inAmount, includeFee];
}

export async function calcBurnExactTokensForStable(
	_inAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	return await _calcBurnExactTokensForStable(_inAmount, args);
}

export async function _calcBurnExactTokensForStable(
	_inAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	let inA = _inAmount;
	let curR = await _currenRound(args);
	let curPrice = BigInt(0);
	let curMint = BigInt(0);
	let outAmount = BigInt(0);

	let dstTokenDecimals = _distributionTokenDecimals;

	while (inA > 0) {
		[curPrice, curMint] = await _priceInUnitsAndMintedInRound(curR, args);
		// Case when

		if (inA > curMint) {
			outAmount += (curMint * curPrice) / BigInt(10 ** dstTokenDecimals);
			inA -= curMint;
			--curR;
		} else {
			outAmount += (inA * curPrice) / BigInt(10 ** dstTokenDecimals);
			break;
		}
	}
	// Fee Charge

	let outAmountFee =
		(outAmount * FEE_PERCENT_POINT) / (BigInt(100) * PERCENT_DENOMINATOR);
	outAmount -= outAmountFee; // return outAmount  fee excleded

	return [outAmount, outAmountFee];
}

export async function priceAndMintedInRound(
	_round: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	return await _priceInUnitsAndMintedInRound(_round, args);
}

async function _priceInUnitsAndMintedInRound(
	_round: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	let price = _priceForRound(_round);
	let minted = BigInt(0);
	let currenRound = await _currenRound(args);
	let distributedAmount = await _distributedAmount(args);
	// in finished rounds rest always zero
	if (_round < currenRound) {
		minted = ROUND_VOLUME;

		// in current round need calc
	} else if (_round == currenRound) {
		if (_round == BigInt(1)) {
			// first round
			minted = distributedAmount;
		} else {
			minted = distributedAmount % ROUND_VOLUME;
		}

		// in future rounds rest always ROUND_VOLUME
	} else {
		minted = BigInt(0);
	}
	return [price, minted];
}

export async function calcBurnTokensForExactStable(
	_outAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	return await _calcBurnTokensForExactStable(_outAmount, args);
}

export async function _calcBurnTokensForExactStable(
	_outAmount: bigint,
	args: Args,
): Promise<[bigint, bigint]> {
	// Calc realy out amount before pay fee
	let outA =
		(_outAmount * BigInt(100) * PERCENT_DENOMINATOR) /
		(BigInt(100) * PERCENT_DENOMINATOR - FEE_PERCENT_POINT);
	let payedFee = outA - _outAmount;

	let curR = await _currenRound(args);
	let curPrice = BigInt(0);
	let curMint = BigInt(0);
	let dstTokenDecimals = _distributionTokenDecimals;
	let inAmount = BigInt(0);
	while (outA > 0) {
		[curPrice, curMint] = await _priceInUnitsAndMintedInRound(curR, args);
		if (
			// calc out amount
			(outA * BigInt(10 ** dstTokenDecimals)) / curPrice >
			curMint
		) {
			// Case when inAmount more then price of all tokens
			inAmount += curMint;
			outA -= (curMint * curPrice) / BigInt(10 ** dstTokenDecimals);
			--curR;
		} else {
			// Case when inAmount less or equal then price of all tokens
			// in current round
			inAmount += (outA * BigInt(10 ** dstTokenDecimals)) / curPrice;
			return [inAmount, payedFee];
		}
	}
	return [inAmount, payedFee];
}
