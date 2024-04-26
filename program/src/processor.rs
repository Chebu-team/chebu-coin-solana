use {
    borsh::{BorshDeserialize, BorshSerialize},
    solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, pubkey::Pubkey},
};

use crate::instructions::{
    claim::{claim_token, ClaimArgs},
    create::{create_token, CreateTokenArgs},
    trade::{
        burnExactTokensForStable, burnExactTokensForStableArgs, mintTokensForExactStable,
        mintTokensForExactStableArgs, mintTokensForExactStableWithSlippage,
        mintTokensForExactStableWithSlippageArgs,
    },
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
enum SplMinterIntstruction {
    Create(CreateTokenArgs),
    MintTokensForExactStableWithSlippage(mintTokensForExactStableWithSlippageArgs),
    MintTokensForExactStable(mintTokensForExactStableArgs),
    BurnExactTokensForStable(burnExactTokensForStableArgs),
    Claim(ClaimArgs),
}

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = SplMinterIntstruction::try_from_slice(instruction_data)?;

    match instruction {
        SplMinterIntstruction::Create(args) => create_token(_program_id, accounts, args),
        SplMinterIntstruction::MintTokensForExactStableWithSlippage(args) => {
            mintTokensForExactStableWithSlippage(_program_id, accounts, args)
        }
        SplMinterIntstruction::MintTokensForExactStable(args) => {
            mintTokensForExactStable(_program_id, accounts, args)
        }
        SplMinterIntstruction::BurnExactTokensForStable(args) => {
            burnExactTokensForStable(_program_id, accounts, args)
        }
        SplMinterIntstruction::Claim(args) => claim_token(_program_id, accounts, args),
    }
}

#[cfg(test)]
mod test {
    use {
        super::*,
        assert_matches::*,
        borsh::{BorshDeserialize, BorshSerialize},
        solana_program::instruction::{AccountMeta, Instruction},
        solana_program_test::*,
        solana_sdk::{signature::Signer, transaction::Transaction},
    };
    #[derive(BorshSerialize, BorshDeserialize, Debug)]
    pub struct MyInstruction {
        pub variant: u8,
        pub _inAmount: u64,
    }

    #[tokio::test]
    async fn test_transaction_2() {

        let program_id = Pubkey::new_unique();

        let (mut banks_client, payer, recent_blockhash) = ProgramTest::new(
            "bpf_program_template",
            program_id,
            processor!(process_instruction),
        )
        .start()
        .await;

        let accounts = vec![
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), false),
        ];

        let instr = MyInstruction {
            variant: 3,
            _inAmount: 1_000_000_000_000_000_000,
        };

        let mut instr_in_bytes: Vec<u8> = Vec::new();
        instr.serialize(&mut instr_in_bytes).unwrap();

        let instruction =
            Instruction::new_with_bytes(program_id, &instr_in_bytes, accounts.to_vec());

        let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
        transaction.sign(&[&payer], recent_blockhash);

        assert_matches!(banks_client.process_transaction(transaction).await, Ok(()));
    }
}
