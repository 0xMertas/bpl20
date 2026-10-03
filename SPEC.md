# BPL20 Spec v0.1 (DRAFT)

Status: concept. Rules may change. Nothing is deployed.

## Operations

- **deploy**: defines a ticker with a max supply and a per-mint limit.
- **mint**: adds tokens to an owner, up to the per-mint limit and the remaining supply.
- **transfer**: not specified yet.
- **burn**: not specified yet.

## Rules (current draft)

- A ticker can be deployed once. The first valid deploy, by block and transaction order, wins.
- Amounts must be whole numbers greater than zero.
- A mint above the per-mint limit is ignored.
- A mint that would pass the max supply fills only the remaining amount.
- Anything malformed is ignored by the indexer.
- No premine and no team allocation.

## Open questions

- Where the data lives on-chain (inscriptions, OP_RETURN, or another method)
- Same-block conflicts: ordering by transaction position in the block
- Reorg handling: the indexer must roll back state
- Transfer design and how it avoids double spending
- One wallet can mint many times, so a limit reduces concentration but does not remove it

## Not designed yet

- Token-to-NFT conversion (research)
- Trading (research)
