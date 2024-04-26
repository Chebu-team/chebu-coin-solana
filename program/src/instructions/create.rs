use {
    borsh::{BorshDeserialize, BorshSerialize},
    mpl_token_metadata::{instructions as mpl_instruction, types::DataV2},
    solana_program::{
        account_info::{next_account_info, AccountInfo},
        entrypoint::ProgramResult,
        msg,
        program::{invoke, invoke_signed},
        program_pack::Pack,
        pubkey::Pubkey,
        rent::Rent,
        system_instruction,
        sysvar::Sysvar,
    },
    spl_associated_token_account::instruction as associated_token_account_instruction,
    spl_token::{instruction as token_instruction, state::Mint},
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct CreateTokenArgs {
    pub token_title: String,
    pub token_symbol: String,
    pub token_uri: String,
    pub claime_authority: Pubkey,
}

pub fn create_token(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: CreateTokenArgs,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    let mint_account = next_account_info(accounts_iter)?;
    let mint_authority = next_account_info(accounts_iter)?;
    let metadata_account = next_account_info(accounts_iter)?;
    let payer = next_account_info(accounts_iter)?;
    let state_account = next_account_info(accounts_iter)?;
    let pda_trade_token_ata_account = next_account_info(accounts_iter)?;
    let pda_trade_token_authority = next_account_info(accounts_iter)?;
    let trade_token_account = next_account_info(accounts_iter)?;
    let rent = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let token_metadata_program = next_account_info(accounts_iter)?;


    // First create the account for the Mint
    //
    msg!("Creating mint account...");
    msg!("Mint: {}", mint_account.key);
    invoke(
        &system_instruction::create_account(
            payer.key,
            mint_account.key,
            (Rent::get()?).minimum_balance(Mint::LEN),
            Mint::LEN as u64,
            token_program.key,
        ),
        &[
            mint_account.clone(),
            payer.clone(),
            system_program.clone(),
            token_program.clone(),
        ],
    )?;

    // Now initialize that account as a Mint (standard Mint)
    //
    msg!("Initializing mint account...");
    msg!("Mint: {}", mint_account.key);

    let (_, bump_seed_2) = Pubkey::find_program_address(&[b"mint_authority"], &program_id);

    invoke_signed(
        &token_instruction::initialize_mint(
            token_program.key,
            mint_account.key,
            mint_authority.key,
            Some(mint_authority.key),
            7, // 7 Decimals for the default SPL Token standard
        )?,
        &[
            mint_account.clone(),
            mint_authority.clone(),
            token_program.clone(),
            rent.clone(),
        ],
        &[&[b"mint_authority", &[bump_seed_2]]],
    )?;

    mpl_instruction::CreateMetadataAccountV3CpiBuilder::new(token_metadata_program)
        .metadata(metadata_account)
        .mint(mint_account)
        .mint_authority(mint_authority)
        .payer(payer)
        .update_authority(mint_authority, true)
        .system_program(system_program)
        .data(DataV2 {
            name: args.token_title,
            uri: args.token_uri,
            symbol: args.token_symbol,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        })
        .is_mutable(true)
        .invoke_signed(&[&[b"mint_authority", &[bump_seed_2]]])?;
    msg!("Token mint created successfully.");

    //State struct
    let (state_pda, blog_bump) = Pubkey::find_program_address(&[b"state".as_ref()], program_id);
    let rent = Rent::get()?;
    let rent_lamports = rent.minimum_balance(State::LEN);

    let create_blog_pda_ix = &system_instruction::create_account(
        payer.key,
        state_account.key,
        rent_lamports,
        State::LEN.try_into().unwrap(),
        program_id,
    );
    msg!("Creating State account!");
    invoke_signed(
        create_blog_pda_ix,
        &[payer.clone(), state_account.clone(), system_program.clone()],
        &[&[b"state".as_ref(), &[blog_bump]]],
    )?;

    let mut account_state = State::try_from_slice(&state_account.data.borrow())?;
    account_state.mint_account = *mint_account.key;
    account_state.trade_token_address = *trade_token_account.key;
    account_state.total = 0;
    account_state.claimed = 0;
    account_state.claim_authority = args.claime_authority;
    account_state.serialize(&mut &mut state_account.data.borrow_mut()[..])?;

    //4.1. Create ATA pda if needed
    let (pda_trade_token_authority_address, bump_seed_3) =
        Pubkey::find_program_address(&[b"ata_trade_token_authority"], &program_id);

    if pda_trade_token_ata_account.lamports() == 0 {
        msg!("Creating associated token account...");
        invoke_signed(
            &associated_token_account_instruction::create_associated_token_account(
                payer.key,
                &pda_trade_token_authority_address,
                trade_token_account.key,
                token_program.key,
            ),
            &[
                payer.clone(),
                pda_trade_token_ata_account.clone(),
                pda_trade_token_authority.clone(),
                trade_token_account.clone(),
                system_program.clone(),
                token_program.clone(),
            ],
            &[&[b"ata_trade_token_authority", &[bump_seed_3]]],
        )?;
    };

    Ok(())
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct State {
    pub mint_account: Pubkey,
    pub trade_token_address: Pubkey,
    pub total: u64,
    pub claimed: u64,
    pub claim_authority: Pubkey,
}
impl State {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 32;
}
