import * as borsh from "borsh";


class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            return (this[key] = properties[key]);
        });
    };
};

export enum SplMinterInstruction {
    Create,
    MintTokensForExactStableWithSlippage,
    MintTokensForExactStable,
    BurnExactTokensForStable,
    Claim
}

export class CreateTokenArgs extends Assignable {
    toBuffer() {
        return Buffer.from(borsh.serialize(CreateTokenArgsSchema, this));
    }
};

const CreateTokenArgsSchema = new Map([
    [
        CreateTokenArgs, {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['token_title', 'string'],
                ['token_symbol', 'string'],
                ['token_uri', 'string'],
                ['claim_authority', [32]],
            ]
        }
    ]
]);


export class MintToArgs extends Assignable {
    toBuffer() {
        return Buffer.from(borsh.serialize(MintToArgsSchema, this));
    }
};
const MintToArgsSchema = new Map([
    [
        MintToArgs, {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['quantity', 'u64'],
            ]
        }
    ]
]);


export class CliamToArgs extends Assignable {
    toBuffer() {
        return Buffer.from(borsh.serialize(CliamToArgsSchema, this));
    }
};
const CliamToArgsSchema = new Map([
    [
        CliamToArgs, {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['amount', 'u64'],
            ]
        }
    ]
]);


export class MintTokensForExactStableWithSlippageToArgs extends Assignable {
    toBuffer() {
        return Buffer.from(borsh.serialize(MintTokensForExactStableWithSlippageToArgsSchema, this));
    }
};
const MintTokensForExactStableWithSlippageToArgsSchema = new Map([
    [
        MintTokensForExactStableWithSlippageToArgs, {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['_inAmount', 'u64'],
                ['_outNotLess', 'u64'],
            ]
        }
    ]
]);

export class MintTokensForExactStableToArgs extends Assignable {
    toBuffer() {
        return Buffer.from(borsh.serialize(MintTokensForExactStableToArgsSchema, this));
    }
};
const MintTokensForExactStableToArgsSchema = new Map([
    [
        MintTokensForExactStableToArgs, {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['_inAmount', 'u64'],
            ]
        }
    ]
]);
export class BurnExactTokensForStableToArgs extends Assignable {
    toBuffer() {
        return Buffer.from(borsh.serialize(BurnExactTokensForStableToArgsSchema, this));
    }
};
const BurnExactTokensForStableToArgsSchema = new Map([
    [
        BurnExactTokensForStableToArgs, {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['_inAmount', 'u64'],
            ]
        }
    ]
]);

export class StateAccoundData extends Assignable {}

export const dataStateSchema = new Map([
    [
        StateAccoundData,
      {
        kind: "struct",
        fields: [
          ["initialized", "u8"],
          ["mint_account", [32]],
          ["total", "u64"],
          ["claimed", "u64"],
          ["trade_token", [32]],
          ["claime_authority", [32]],
        ],
      },
    ],
  ]);

