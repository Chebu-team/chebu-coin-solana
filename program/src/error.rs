//! Error types

use {
    solana_program::{
        decode_error::DecodeError,
        program_error::ProgramError,
    },
    thiserror::Error,
};

/// Errors that may be returned by the Token program.
//#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TokenError {
    // 0
    /// Lamport balance below rent-exempt threshold.
    #[error("Cant buy zero")]
    ZeroBuy,

    #[error("MAX_TOTAL_SUPPLY LIMIT")]
    MAX_TOTAL_SUPPLY,

    #[error("MAX_TOKEN_AMOUNT LIMIT")]
    MAX_TOKEN_AMOUNT,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Slippage occur")]
    Slippage_occur,

    #[error("WRONG pda_trade_token_ata_account")]
    WRONG_pda_trade_token_ata_account,

    #[error("WRONG mint_account")]
    WRONG_mint_account,
}
impl From<TokenError> for ProgramError {
    fn from(e: TokenError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<T> DecodeError<T> for TokenError {
    fn type_of() -> &'static str {
        "TokenError"
    }
}
