use uint::construct_uint;
use {
    super::create,
    borsh::{BorshDeserialize, BorshSerialize},
    solana_program::{
        account_info::{next_account_info, AccountInfo},
        entrypoint::ProgramResult,
        msg,
        program::{invoke, invoke_signed},
        program_pack::Pack,
        pubkey::Pubkey,
    },
    spl_associated_token_account::{
        get_associated_token_address,
        instruction as associated_token_account_instruction,
    },
    spl_token::{instruction as token_instruction, state::Mint},
};
construct_uint! {
    pub struct U128(2);
}

use crate::error::TokenError;
use create::State;
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct mintTokensForExactStableArgs {
    pub _inAmount: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct mintTokensForExactStableWithSlippageArgs {
    pub _inAmount: u64,
    pub _outNotLess: u64,
}
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct burnExactTokensForStableArgs {
    pub _inAmount: u64,
}

const MAX_TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000_0;
const MAX_TOKEN_AMOUNT: u64 = 10_000_000_000_000;
/////////////////////////////////////////////////
///  Main Constants, check before Deployment   //
/////////////////////////////////////////////////
const START_PRICE: u64 = 1;
const PRICE_INCREASE_STEP: u64 = 1;
const INCREASE_FROM_ROUND: u64 = 1;
const ROUND_VOLUME: u64 = 1_000_000 * u64::pow(10, 7);
/////////////////////////////////////////////////

const FEE_PERCENT_POINT: u64 = 50000;
const PERCENT_DENOMINATOR: u64 = 10000;

pub fn mintTokensForExactStableWithSlippage(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: mintTokensForExactStableWithSlippageArgs,
) -> ProgramResult {
    if args._inAmount > MAX_TOKEN_AMOUNT {
        return Err(TokenError::MAX_TOKEN_AMOUNT.into());
    }
    let accounts_iter = &mut accounts.iter();

    let mint_account = next_account_info(accounts_iter)?;
    let mint = Mint::unpack(&mint_account.data.borrow()).unwrap();
    let _distributedAmount = mint.supply;

    let (out, _) = new_calcMintTokensForExactStable(_distributedAmount, args._inAmount);
    //		assert!(out >= args._outNotLess,"Slippage occur");
    if out < args._outNotLess {
        return Err(TokenError::Slippage_occur.into());
    }
    mintTokensForExactStable(
        program_id,
        accounts,
        mintTokensForExactStableArgs {
            _inAmount: args._inAmount,
        },
    );
    Ok(())
}

pub fn mintTokensForExactStable(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: mintTokensForExactStableArgs,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let mint_account = next_account_info(accounts_iter)?;
    let mint_authority = next_account_info(accounts_iter)?;
    let associated_token_account = next_account_info(accounts_iter)?; //payer mem token ATA
    let payer = next_account_info(accounts_iter)?;
    let state_account = next_account_info(accounts_iter)?;
    let payer_trade_token_ata_account = next_account_info(accounts_iter)?;
    //		let pda_trade_token_authority = next_account_info(accounts_iter)?;
    let pda_trade_token_ata_account = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let associated_token_program = next_account_info(accounts_iter)?;

    //check  associated_token_account own payer, tradeToken ATA own payer
    //chack tradeToken ATA contains tradeToken token
    let (pda_trade_token_authority_address, bump_seed_3) =
        Pubkey::find_program_address(&[b"ata_trade_token_authority"], &program_id);
    let mut account_state = State::try_from_slice(&state_account.data.borrow()).unwrap();

    let rigth_pda_ata_trade_token_address = get_associated_token_address(
        &pda_trade_token_authority_address,
        &account_state.trade_token_address,
    );
    if rigth_pda_ata_trade_token_address != *pda_trade_token_ata_account.key {
        return Err(TokenError::WRONG_pda_trade_token_ata_account.into());
    }
    if *mint_account.key != account_state.mint_account {
        return Err(TokenError::WRONG_mint_account.into());
    }

    if args._inAmount > MAX_TOKEN_AMOUNT {
        return Err(TokenError::MAX_TOKEN_AMOUNT.into());
    }
    // 1. Calc distribution tokens

    let mint = Mint::unpack(&mint_account.data.borrow()).unwrap();
    let _distributedAmount = mint.supply;
    //	let _distributedAmount = 0;
    msg!(
        "_distributedAmount: {}, args._inAmount: {} ",
        _distributedAmount,
        args._inAmount
    );

    //	let (outAmount, inAmountFee)= _calcMintTokensForExactStable(_distributedAmount,args._inAmount);
    let (outAmount, inAmountFee) =
        new_calcMintTokensForExactStable(_distributedAmount, args._inAmount);

    msg!("outAmount: {}, inAmountFee: {} ", outAmount, inAmountFee);
    //	let (outAmount, inAmountFee)= _calcMintTokensForExactStable(0,args._inAmount);
    if outAmount == 0 {
        return Err(TokenError::ZeroBuy.into());
    }

    // 2. Charge Fee

    account_state.total += inAmountFee;
    account_state
        .serialize(&mut &mut state_account.data.borrow_mut()[..])
        .unwrap();

    // 3. Mint distribution token
    // 3.0 check max supply

    let current_supply = mint.supply;
    if (outAmount + current_supply) > MAX_TOTAL_SUPPLY {
        return Err(TokenError::MAX_TOTAL_SUPPLY.into());
    }

    //3.1. chek if ata exist
    let (_, bump_seed_2) = Pubkey::find_program_address(&[b"mint_authority"], &program_id);
    if associated_token_account.lamports() == 0 {
        msg!("Creating associated token account...");
        invoke(
            &associated_token_account_instruction::create_associated_token_account(
                payer.key,
                payer.key,
                mint_account.key,
                token_program.key,
            ),
            &[
                mint_account.clone(),
                associated_token_account.clone(),
                payer.clone(),
                system_program.clone(),
                token_program.clone(),
                associated_token_program.clone(),
            ],
        )?;
    };

    //3.2. mint
    invoke_signed(
        &token_instruction::mint_to(
            token_program.key,
            mint_account.key,
            associated_token_account.key,
            mint_authority.key,
            &[mint_authority.key],
            outAmount,
        )?,
        &[
            mint_account.clone(),
            mint_authority.clone(),
            associated_token_account.clone(),
            token_program.clone(),
        ],
        &[&[b"mint_authority", &[bump_seed_2]]],
    )?;
    msg!("Mint on acc.: {}", associated_token_account.key);

    let mint_01 = Mint::unpack(&mint_account.data.borrow()).unwrap();
    let _distributedAmount_01 = mint.supply;
    /* 	msg!(
           "Supply after mint: {} ",
           _distributedAmount_01
       );
    */
    ////	_mintFor(msg.sender, outAmount);

    // 4. Get payment

    //    let (pda_trade_token_ata_authority, bump_seed_2) = Pubkey::find_program_address(&[b"ata_trade_token_authority"], &program_id);

    invoke(
        &token_instruction::transfer(
            token_program.key,
            payer_trade_token_ata_account.key,
            pda_trade_token_ata_account.key,
            payer.key,
            &[payer.key],
            args._inAmount,
        )?,
        &[
            payer_trade_token_ata_account.clone(),
            pda_trade_token_ata_account.clone(),
            payer.clone(),
            //            pda_trade_token_authority.clone(),
            //            token_program.clone(),
        ],
    )?;
    //	tradeToken.safeTransferFrom(msg.sender, address(this), _inAmount);

    //	emit Deal(msg.sender, address(tradeToken), _inAmount, outAmount);
    /* 	msg!(
            "Deal {} {} {} {}",
            payer.key,
            payer_trade_token_ata_account.key,
            args._inAmount,
            outAmount
        );
    */
    Ok(())
}

pub fn burnExactTokensForStable(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: burnExactTokensForStableArgs,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    let mint_account = next_account_info(accounts_iter)?;
    //		let mint_authority = next_account_info(accounts_iter)?;
    let associated_token_account = next_account_info(accounts_iter)?; //pater mem token ATA
    let payer = next_account_info(accounts_iter)?;
    let state_account = next_account_info(accounts_iter)?;
    let payer_trade_token_ata_account = next_account_info(accounts_iter)?;
    let pda_trade_token_authority = next_account_info(accounts_iter)?;
    let pda_trade_token_ata_account = next_account_info(accounts_iter)?;
    //		let system_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    //		let associated_token_program = next_account_info(accounts_iter)?;

    let (pda_trade_token_authority_address, bump_seed_3) =
        Pubkey::find_program_address(&[b"ata_trade_token_authority"], &program_id);
    let mut account_state = State::try_from_slice(&state_account.data.borrow()).unwrap();

    let rigth_pda_ata_trade_token_address = get_associated_token_address(
        &pda_trade_token_authority_address,
        &account_state.trade_token_address,
    );
    if rigth_pda_ata_trade_token_address != *pda_trade_token_ata_account.key {
        return Err(TokenError::WRONG_pda_trade_token_ata_account.into());
    }
    if *mint_account.key != account_state.mint_account {
        return Err(TokenError::WRONG_mint_account.into());
    }

    // 1. Calc distribution tokens
    let mint = Mint::unpack(&mint_account.data.borrow()).unwrap();
    let _distributedAmount = mint.supply;

    let (outAmount, outAmountFee) =
        new_calcBurnExactTokensForStable(_distributedAmount, args._inAmount);
    //		assert!(outAmount > 0,"Cant buy zero");
    if outAmount == 0 {
        return Err(TokenError::ZeroBuy.into());
    }
    // 2. Charge Fee
    account_state.total += outAmountFee;
    account_state
        .serialize(&mut &mut state_account.data.borrow_mut()[..])
        .unwrap();

    //		fee.total += outAmountFee;

    // 3. bursn distribution token
    //        _burnFor(msg.sender, _inAmount);
    invoke(
        &token_instruction::burn(
            token_program.key,
            associated_token_account.key,
            mint_account.key,
            payer.key,
            &[payer.key],
            args._inAmount,
        )?,
        &[
            associated_token_account.clone(),
            payer.clone(),
            mint_account.clone(),
        ],
    )?;

    // 4. Get payment

    let (pda_trade_token_ata_authority, bump_seed_2) =
        Pubkey::find_program_address(&[b"ata_trade_token_authority"], &program_id);

    invoke_signed(
        &token_instruction::transfer(
            token_program.key,
            pda_trade_token_ata_account.key,
            payer_trade_token_ata_account.key,
            &pda_trade_token_ata_authority,
            &[],
            outAmount,
        )?,
        &[
            pda_trade_token_ata_account.clone(),
            payer_trade_token_ata_account.clone(),
            pda_trade_token_authority.clone(),
            //				payer.clone(),
            //				token_program.clone(),
        ],
        &[&[b"ata_trade_token_authority", &[bump_seed_2]]],
    )?;

    //        tradeToken.safeTransfer(msg.sender, outAmount);

    //        emit Deal(msg.sender, address(this), _inAmount, outAmount);
    msg!(
        "Deal {} {} {} {}",
        payer.key,
        pda_trade_token_ata_account.key,
        args._inAmount,
        outAmount
    );

    Ok(())
}

fn mul_div_u64(a: u64, b: u64, divisor: u64) -> Option<u64> {
    let result = U128::from(a)
        .checked_mul(b.into())?
        .checked_div(divisor.into())?;
    if result.0[1] != 0 {
        None
    } else {
        Some(result.0[0])
    }
}

fn new_calcMintTokensForExactStable(_distributedAmount: u64, _inAmount: u64) -> (u64, u64) {
    let mut inA128: u128 = _inAmount as u128 * 100 * PERCENT_DENOMINATOR as u128
        / (100 * PERCENT_DENOMINATOR as u128 + FEE_PERCENT_POINT as u128);
    let mut inCleanedUSDTAmount = u64::try_from(inA128).unwrap();

    //	let mut inA = mul_div_u64(_inAmount,100 * PERCENT_DENOMINATOR,(100 * PERCENT_DENOMINATOR  + FEE_PERCENT_POINT )).unwrap();

    let inAmountFee = _inAmount - inCleanedUSDTAmount;
    /* 	let curR = _currenRound(_distributedAmount);
        let curPrice:u64 = 0;
        let curRest:u64 = 0;
        let dstTokenDecimals:u32 = 7;
        let mut outAmount:u64 = 0;
        let mut curR:u64 = 0;
    */
    let dstTokenDecimals: u32 = 7;
    let mut round: u64 = _distributedAmount / ROUND_VOLUME + 1;
    //	msg!("round in contract: {}", round);

    let mut price: u64 = 0;
    let mut roundUSDTAmount: u64 = 0;
    let mut memcoinAmount: u64 = 0;

    let mut counter = 0;
    while inCleanedUSDTAmount > 0 {
        counter += 1;
        //		if counter>10000 {break}
        //		let (curPrice, curRest) = _priceInUnitsAndRemainByRound(_distributedAmount,curR);
        price = round;
        let calc_round_volume = if counter == 1 {
            ROUND_VOLUME - (_distributedAmount % ROUND_VOLUME)
        } else {
            ROUND_VOLUME
        };

        //		let roundUSDTAmount128 = calc_round_volume as u128 * price as u128 / u128::pow(10,dstTokenDecimals);
        //		roundUSDTAmount = u64::try_from(roundUSDTAmount128).unwrap();

        if price < 1_000_000 {
            roundUSDTAmount = calc_round_volume * price / u64::pow(10, dstTokenDecimals);
        } else {
            let roundUSDTAmount128 =
                calc_round_volume as u128 * price as u128 / u128::pow(10, dstTokenDecimals);
            roundUSDTAmount = u64::try_from(roundUSDTAmount128).unwrap();
        }

        if (inCleanedUSDTAmount > roundUSDTAmount) {
            //			memcoinAmount += ROUND_VOLUME; ROUND_VOLUME - (_distributedAmount % ROUND_VOLUME);
            /*if counter==1 {
            memcoinAmount += ROUND_VOLUME - (_distributedAmount % ROUND_VOLUME);
            }
            else {
            memcoinAmount += ROUND_VOLUME;
            } */
            memcoinAmount += calc_round_volume;

            inCleanedUSDTAmount -= roundUSDTAmount;
            round += 1;
        } else {
            let memcoinAmount128 =
                inCleanedUSDTAmount as u128 * u128::pow(10, dstTokenDecimals) / price as u128;
            memcoinAmount += u64::try_from(memcoinAmount128).unwrap();
            inCleanedUSDTAmount = 0;
        }
        //		msg!("memcoinAmount: {}, price: {}, inCleanedUSDTAmount: {}", memcoinAmount, price, inCleanedUSDTAmount);
    }

    //	msg!("counter: {}", counter);
    (memcoinAmount, inAmountFee)
}

fn new_calcBurnExactTokensForStable(_distributedAmount: u64, _inAmount: u64) -> (u64, u64) {
    let mut bAm = _inAmount;
    let dstTokenDecimals = 7;

    let mut round = _currenRound(_distributedAmount);
    let mut price: u64 = 0;
    let mut calculatedUSDT: u64 = 0;
    let mut counter: u64 = 0;
    while (bAm > 0) {
        counter += 1;
        price = round;
        let calc_round_volume = if counter == 1 {
            _distributedAmount % ROUND_VOLUME
        } else {
            ROUND_VOLUME
        };
        if (bAm > calc_round_volume) {
            let calculatedUSDT128 =
                calc_round_volume as u128 * price as u128 / u128::pow(10, dstTokenDecimals);
            calculatedUSDT += u64::try_from(calculatedUSDT128).unwrap();
            bAm -= calc_round_volume;
            round -= 1;
        } else {
            let calculatedUSDT128 = bAm as u128 * price as u128 / u128::pow(10, dstTokenDecimals);
            calculatedUSDT += u64::try_from(calculatedUSDT128).unwrap();
            bAm = 0;
        }
    }
    // Fee Charge

    let outUsdtAmount128 = calculatedUSDT as u128
        * (100 * PERCENT_DENOMINATOR - FEE_PERCENT_POINT) as u128
        / (100 * PERCENT_DENOMINATOR) as u128;
    let outUsdtAmount = u64::try_from(outUsdtAmount128).unwrap();

    let fee = calculatedUSDT - outUsdtAmount;
    (outUsdtAmount, fee)
}

fn _priceInUnitsAndMintedInRound(_distributedAmount: u64, _round: u64) -> (u64, u64) {
    let price = _priceForRound(_round);
    let cur_round = _currenRound(_distributedAmount);

    // in finished rounds rest always zero
    let minted = if _round < cur_round {
        ROUND_VOLUME

    // in current round need calc
    } else if _round == cur_round {
        if _round == 1 {
            // first round
            _distributedAmount
        } else {
            _distributedAmount % ROUND_VOLUME
        }

    // in future rounds rest always ROUND_VOLUME
    } else {
        0
    };
    (price, minted)
}

fn _priceInUnitsAndRemainByRound(_distributedAmount: u64, _round: u64) -> (u64, u64) {
    let price = _priceForRound(_round);
    let cur_round = _currenRound(_distributedAmount);
    // in finished rounds rest always zero
    let rest = if _round < cur_round {
        0

    // in current round need calc
    } else if _round == cur_round {
        if _round == 1 {
            // first round
            ROUND_VOLUME - _distributedAmount
        } else {
            ROUND_VOLUME - (_distributedAmount % ROUND_VOLUME)
        }

    // in future rounds rest always ROUND_VOLUME
    } else {
        ROUND_VOLUME
    };
    (price, rest)
}

fn _priceForRound(_round: u64) -> u64 {
    let price = if _round < INCREASE_FROM_ROUND {
        START_PRICE
    } else {
        PRICE_INCREASE_STEP * (_round - INCREASE_FROM_ROUND + 1)
    };
    price
}

fn _currenRound(_distributedAmount: u64) -> u64 {
    return _distributedAmount / ROUND_VOLUME + 1;
}

#[cfg(test)]
mod test {
    use {
        super::*,
        assert_matches::*,
        solana_program::instruction::{AccountMeta, Instruction},
        solana_program_test::*,
        solana_sdk::{signature::Signer, transaction::Transaction},
    };

    #[test]
    fn test_transaction() {
        let (out_amount, inFee) = new_calcMintTokensForExactStable(0, 1000000000000);
        msg!("out_amount {}, inFee {}", out_amount, inFee);
    }

}
