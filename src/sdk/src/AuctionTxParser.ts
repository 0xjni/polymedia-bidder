import { MoveCallSuiTransaction, SuiCallArg, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { getArgVal, isArgInput, isTxMoveCall, isTxSplitCoins, SuiObjectChangeCreated, SuiObjectChangeMutated, txResToData } from "@polymedia/suitcase-core";
import { AnyAuctionTx, TxAdminCancelsAuction, TxAdminCreatesAuction, TxAdminSetsPayAddr, TxAnyoneBids, TxAnyonePaysFunds, TxAnyoneSendsItemToWinner } from "./AuctionTxTypes";

type TxData = ReturnType<typeof txResToData>;

/**
 * Parse transactions for the `bidder::auction` Sui module.
 */
export class AuctionTxParser
{
    constructor(protected readonly packageId: string) {}

    /**
     * Parse various transactions on the `bidder::auction` module.
     */
    public parseAuctionTx(
        resp: SuiTransactionBlockResponse,
    ): AnyAuctionTx | null
    {
        let txData: TxData;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }

        for (const tx of txData.txs)
        {
            if (!isTxMoveCall(tx) ||
                tx.MoveCall.package !== this.packageId ||
                tx.MoveCall.module !== "auction" ||
                !tx.MoveCall.arguments ||
                !tx.MoveCall.type_arguments
            ) continue;

            const txInputs = tx.MoveCall.arguments
                .filter(arg => isArgInput(arg))
                .map(arg => txData.inputs[arg.Input]);

            if (tx.MoveCall.function === "admin_creates_auction") {
                if (txInputs.length !== 10) return null;

                const auctionObjChange = this.extractAuctionObjCreated(resp);
                if (!auctionObjChange) { return null; }

                return {
                    kind: "admin_creates_auction",
                    digest: resp.digest,
                    timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
                    sender: txData.sender,
                    auctionId: auctionObjChange.objectId,
                    inputs: {
                        type_coin: tx.MoveCall.type_arguments[0],
                        name: getArgVal(txInputs[0]),
                        description: getArgVal(txInputs[1]),
                        item_addrs: getArgVal(txInputs[2]),
                        pay_addr: getArgVal(txInputs[3]),
                        begin_delay_ms: getArgVal(txInputs[4]),
                        duration_ms: getArgVal(txInputs[5]),
                        minimum_bid: getArgVal(txInputs[6]),
                        minimum_increase_bps: getArgVal<number>(txInputs[7]),
                        extension_period_ms: getArgVal(txInputs[8]),
                    },
                };
            }
            if (tx.MoveCall.function === "anyone_bids") {
                return this.anyone_bids(resp, txData);
            }
            if (tx.MoveCall.function === "admin_accepts_bid") {
                if (txInputs.length !== 2) return null;
                return {
                    kind: "admin_accepts_bid",
                    digest: resp.digest,
                    timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
                    sender: txData.sender,
                    inputs: {
                        type_coin: tx.MoveCall.type_arguments[0],
                        auction_addr: getArgVal(txInputs[0]),
                    },
                };
            }
            if (tx.MoveCall.function === "admin_cancels_auction") {
                if (txInputs.length !== 2) return null;
                return {
                    kind: "admin_cancels_auction",
                    digest: resp.digest,
                    timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
                    sender: txData.sender,
                    inputs: {
                        type_coin: tx.MoveCall.type_arguments[0],
                        auction_addr: getArgVal(txInputs[0]),
                    },
                };
            }
            if (tx.MoveCall.function === "admin_sets_pay_addr") {
                if (txInputs.length !== 3) return null;
                return {
                    kind: "admin_sets_pay_addr",
                    digest: resp.digest,
                    timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
                    sender: txData.sender,
                    inputs: {
                        type_coin: tx.MoveCall.type_arguments[0],
                        auction_addr: getArgVal(txInputs[0]),
                        pay_addr: getArgVal(txInputs[1]),
                    },
                };
            }
            // typically these two calls are executed in the same tx, so only one of them will be returned
            if (tx.MoveCall.function === "anyone_pays_funds") {
                if (txInputs.length !== 2) return null;
                return {
                    kind: "anyone_pays_funds",
                    digest: resp.digest,
                    timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
                    sender: txData.sender,
                    inputs: {
                        type_coin: tx.MoveCall.type_arguments[0],
                        auction_addr: getArgVal(txInputs[0]),
                    },
                };
            }
            if (tx.MoveCall.function === "anyone_sends_item_to_winner") {
                if (txInputs.length !== 3) return null;
                return {
                    kind: "anyone_sends_item_to_winner",
                    digest: resp.digest,
                    timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
                    sender: txData.sender,
                    inputs: {
                        type_coin: tx.MoveCall.type_arguments[0],
                        type_item: tx.MoveCall.type_arguments[1],
                        auction_addr: getArgVal(txInputs[0]),
                        item_addr: getArgVal(txInputs[1]),
                    },
                };
            }
        }

        return null;
    }

    /**
     * Parse an `auction::anyone_bids` transaction.
     * Assumes the tx block contains only one `anyone_bids` call.
     */
    protected anyone_bids(
        resp: SuiTransactionBlockResponse,
        txData: TxData,
    ): TxAnyoneBids | null
    {
        let amount: bigint | undefined;
        let type_coin: string | undefined;
        let auction_addr: string | undefined;

        for (const tx of txData.txs)
        {
            // find the SplitCoins tx and parse the bid amount
            if (isTxSplitCoins(tx))
            {
                const splitTxInputs = tx.SplitCoins[1]
                    .filter(arg => isArgInput(arg))
                    .map(arg => txData.inputs[arg.Input]);

                if (splitTxInputs.length !== 1) { return null; }

                amount = getArgVal(splitTxInputs[0]);
            }
            // find the `anyone_bids` tx and parse the userId and auctionId
            if (isTxMoveCall(tx) &&
                tx.MoveCall.package === this.packageId &&
                tx.MoveCall.module === "auction" &&
                tx.MoveCall.function === "anyone_bids" &&
                tx.MoveCall.arguments &&
                tx.MoveCall.type_arguments
            ) {
                const bidTxInputs = tx.MoveCall.arguments
                    .filter(arg => isArgInput(arg))
                    .map(arg => txData.inputs[arg.Input]);

                if (bidTxInputs.length !== 2) { return null; }

                type_coin = tx.MoveCall.type_arguments[0];
                auction_addr = getArgVal(bidTxInputs[0]);
            }
        }

        if (!amount || !type_coin || !auction_addr) { return null; }

        return {
            kind: "anyone_bids",
            digest: resp.digest,
            timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
            sender: txData.sender,
            inputs: {
                type_coin,
                auction_addr,
                amount,
            },
        };
    }

    // === object extractors ===

    /**
     * Extract the created Auction object (if any) from `SuiTransactionBlockResponse.objectChanges`.
     */
    public extractAuctionObjCreated(
        resp: SuiTransactionBlockResponse,
    ): SuiObjectChangeCreated | undefined
    {
        return resp.objectChanges?.find(o =>
            o.type === "created" && o.objectType.startsWith(`${this.packageId}::auction::Auction<`)
        ) as SuiObjectChangeCreated | undefined;
    }

    /**
     * Extract the mutated Auction object (if any) from `SuiTransactionBlockResponse.objectChanges`.
     */
    public extractAuctionObjMutated(
        resp: SuiTransactionBlockResponse,
    ): SuiObjectChangeMutated | undefined
    {
        return resp.objectChanges?.find(o =>
            o.type === "mutated" && o.objectType.startsWith(`${this.packageId}::auction::Auction<`)
        ) as SuiObjectChangeMutated | undefined;
    }

    /**
     * Extract the created or mutated User object (if any) from `SuiTransactionBlockResponse.objectChanges`.
     */
    public extractUserObjChange(
        resp: SuiTransactionBlockResponse,
    ): SuiObjectChangeCreated | SuiObjectChangeMutated | undefined
    {
        return resp.objectChanges?.find(o =>
            (o.type === "created" || o.type === "mutated") && o.objectType === `${this.packageId}::user::User`
        ) as SuiObjectChangeCreated | SuiObjectChangeMutated | undefined;
    }
}