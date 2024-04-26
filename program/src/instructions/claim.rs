use super::create::State;
use crate::error::TokenError;
use {
    borsh::{BorshDeserialize, BorshSerialize},
    solana_program::{
        account_info::{next_account_info, AccountInfo},
        entrypoint::ProgramResult,
        msg,
        program::{invoke, invoke_signed},
        pubkey::Pubkey,

    },
    spl_associated_token_account::instruction as associated_token_account_instruction,
    spl_token::{instruction as token_instruction,  ID as spl_token_program_id},
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ClaimArgs {
    pub amount: u64,
}

pub fn claim_token(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: ClaimArgs,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    let claim_account = next_account_info(accounts_iter)?;
    let state_account = next_account_info(accounts_iter)?;
    let pda_trade_token_ata_account = next_account_info(accounts_iter)?;
    let claim_account_trade_token_ata_account = next_account_info(accounts_iter)?;
    let pda_trade_token_ata_authority_info = next_account_info(accounts_iter)?;
    let trade_token = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let associated_token_program = next_account_info(accounts_iter)?;

    let mut account_state = State::try_from_slice(&state_account.data.borrow()).unwrap();

    if claim_account.is_signer {
        if (*claim_account.key != account_state.claim_authority) {
            return Err(TokenError::Unauthorized.into());
        }
    } else {
        return Err(TokenError::Unauthorized.into());
    };

    assert!(args.amount <= account_state.total - account_state.claimed);
    msg!(
        "amount: {}, total: {}, claimed: {}",
        args.amount,
        account_state.total,
        account_state.claimed
    );

    account_state.claimed += args.amount;
    account_state
        .serialize(&mut &mut state_account.data.borrow_mut()[..])
        .unwrap();

    //check  ATA account
    if claim_account_trade_token_ata_account.lamports() == 0 {
        invoke(
            &associated_token_account_instruction::create_associated_token_account(
                claim_account.key,
                claim_account.key,
                trade_token.key,
                token_program.key,
            ),
            &[
                trade_token.clone(),
                claim_account_trade_token_ata_account.clone(),
                claim_account.clone(),
                system_program.clone(),
                token_program.clone(),
                associated_token_program.clone(),
            ],
        )?;
    };

    let (pda_trade_token_ata_authority, bump_seed_2) =
        Pubkey::find_program_address(&[b"ata_trade_token_authority"], &program_id);

    invoke_signed(
        &token_instruction::transfer(
            &spl_token_program_id,
            pda_trade_token_ata_account.key,
            claim_account_trade_token_ata_account.key,
            &pda_trade_token_ata_authority,
            &[&pda_trade_token_ata_authority],
            args.amount,
        )?,
        &[
            pda_trade_token_ata_account.clone(),
            claim_account_trade_token_ata_account.clone(),
            pda_trade_token_ata_authority_info.clone(),
        ],
        &[&[b"ata_trade_token_authority", &[bump_seed_2]]],
    )?;

    Ok(())
}
