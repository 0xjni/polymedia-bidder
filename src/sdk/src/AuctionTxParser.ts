import { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { getArgVal, isArgInput, isTxMoveCall, isTxSplitCoins, SuiObjectChangeCreated, SuiObjectChangeMutated, txResToData } from "@polymedia/suitcase-core";
import { AnyAuctionTx, TxAdminCancelsAuction, TxAdminCreatesAuction, TxAdminSetsPayAddr, TxAnyoneBids, TxAnyonePaysFunds, TxAnyoneSendsItemToWinner } from "./AuctionTxTypes";

/**
 * Parse transactions for the `bidder::auction` Sui module.
 */
export class AuctionTxParser
{
    constructor(protected readonly packageId: string) {}

    // === transaction parsers ===

    /**
     * Parse various transactions on the `auction` module.
     */
    public parseAuctionTx(
        resp: SuiTransactionBlockResponse,
    ): AnyAuctionTx | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }

        for (const tx of txData.txs) {
            if (!isTxMoveCall(tx) || tx.MoveCall.package !== this.packageId || tx.MoveCall.module !== "auction") {
                continue;
            }
            if (tx.MoveCall.function === "admin_creates_auction") {
                return this.admin_creates_auction(resp);
            }
            if (tx.MoveCall.function === "anyone_bids") {
                return this.anyone_bids(resp);
            }
            // if (tx.MoveCall.function === "admin_accepts_bid") {
            //     return this.admin_accepts_bid(resp);
            // }
            if (tx.MoveCall.function === "admin_cancels_auction") {
                return this.admin_cancels_auction(resp);
            }
            if (tx.MoveCall.function === "admin_sets_pay_addr") {
                return this.admin_sets_pay_addr(resp);
            }
            // typically these two calls are executed in the same tx, so only one of them will be returned
            if (tx.MoveCall.function === "anyone_pays_funds") {
                return this.anyone_pays_funds(resp);
            }
            if (tx.MoveCall.function === "anyone_sends_item_to_winner") {
                return this.anyone_sends_item_to_winner(resp);
            }
        }

        return null;
    }

    /**
     * Parse an `auction::admin_creates_auction` transaction.
     * Assumes the tx block contains only one `admin_creates_auction` call.
     */
    public admin_creates_auction(
        resp: SuiTransactionBlockResponse,
    ): TxAdminCreatesAuction | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }
        const allInputs = txData.inputs;

        // find the created auction object
        const auctionObjChange = this.extractAuctionObjChange(resp);
        if (!auctionObjChange) { return null; }

        let createTxInputs: TxAdminCreatesAuction["inputs"] | undefined;

        for (const tx of txData.txs)
        {
            // find the `admin_creates_auction` tx
            if (
                !isTxMoveCall(tx) ||
                !tx.MoveCall.arguments ||
                !tx.MoveCall.type_arguments ||
                tx.MoveCall.package !== this.packageId ||
                tx.MoveCall.module !== "auction" ||
                tx.MoveCall.function !== "admin_creates_auction"
            ) {
                continue;
            }

            // parse the tx inputs
            const txInputs = tx.MoveCall.arguments
                .filter(arg => isArgInput(arg))
                .map(arg => allInputs[arg.Input]);

            if (txInputs.length !== 10) { return null; }

            createTxInputs = {
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
            };
        }

        if (!createTxInputs) { return null; }

        return {
            kind: "admin_creates_auction",
            digest: resp.digest,
            timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
            sender: txData.sender,
            auctionId: auctionObjChange.objectId,
            inputs: createTxInputs,
        };
    }

    /**
     * Parse an `auction::anyone_bids` transaction.
     * Assumes the tx block contains only one `anyone_bids` call.
     */
    public anyone_bids(
        resp: SuiTransactionBlockResponse,
    ): TxAnyoneBids | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }
        const allInputs = txData.inputs;

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
                    .map(arg => allInputs[arg.Input]);

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
                    .map(arg => allInputs[arg.Input]);

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

    /**
     * Parse an `auction::anyone_pays_funds` transaction.
     * Assumes the tx block contains only one `anyone_pays_funds` call.
     */
    public anyone_pays_funds(
        resp: SuiTransactionBlockResponse,
    ): TxAnyonePaysFunds | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }
        const allInputs = txData.inputs;

        let type_coin: string | undefined;
        let auction_addr: string | undefined;

        for (const tx of txData.txs)
        {
            // find the `anyone_pays_funds` tx
            if (isTxMoveCall(tx) &&
                tx.MoveCall.package === this.packageId &&
                tx.MoveCall.module === "auction" &&
                tx.MoveCall.function === "anyone_pays_funds" &&
                tx.MoveCall.arguments &&
                tx.MoveCall.type_arguments
            ) {
                const txInputs = tx.MoveCall.arguments
                    .filter(arg => isArgInput(arg))
                    .map(arg => allInputs[arg.Input]);

                if (txInputs.length !== 2) { return null; }

                type_coin = tx.MoveCall.type_arguments[0];
                auction_addr = getArgVal(txInputs[0]);
            }
        }

        if (!auction_addr || !type_coin) { return null; }

        return {
            kind: "anyone_pays_funds",
            digest: resp.digest,
            timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
            sender: txData.sender,
            inputs: {
                type_coin,
                auction_addr,
            },
        };
    }

    /**
     * Parse an `auction::anyone_sends_item_to_winner` transaction.
     * Assumes the tx block contains only one `anyone_sends_item_to_winner` call.
     */
    public anyone_sends_item_to_winner(
        resp: SuiTransactionBlockResponse,
    ): TxAnyoneSendsItemToWinner | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }
        const allInputs = txData.inputs;

        let type_coin: string | undefined;
        let type_item: string | undefined;
        let auction_addr: string | undefined;
        let item_addr: string | undefined;

        for (const tx of txData.txs)
        {
            // find the `anyone_sends_item_to_winner` tx
            if (isTxMoveCall(tx) &&
                tx.MoveCall.package === this.packageId &&
                tx.MoveCall.module === "auction" &&
                tx.MoveCall.function === "anyone_sends_item_to_winner" &&
                tx.MoveCall.arguments &&
                tx.MoveCall.type_arguments
            ) {
                const txInputs = tx.MoveCall.arguments
                    .filter(arg => isArgInput(arg))
                    .map(arg => allInputs[arg.Input]);

                if (txInputs.length !== 3) { return null; }

                type_coin = tx.MoveCall.type_arguments[0];
                type_item = tx.MoveCall.type_arguments[1];
                auction_addr = getArgVal(txInputs[0]);
                item_addr = getArgVal(txInputs[1]);
            }
        }

        if (!auction_addr || !item_addr || !type_coin || !type_item) { return null; }

        return {
            kind: "anyone_sends_item_to_winner",
            digest: resp.digest,
            timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
            sender: txData.sender,
            inputs: {
                type_coin,
                type_item,
                auction_addr,
                item_addr,
            },
        };
    }

    /**
     * Parse an `auction::admin_cancels_auction` transaction.
     * Assumes the tx block contains only one `admin_cancels_auction` call.
     */
    public admin_cancels_auction(
        resp: SuiTransactionBlockResponse,
    ): TxAdminCancelsAuction | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }
        const allInputs = txData.inputs;

        const auctionObjChange = this.extractAuctionObjChange(resp);
        if (!auctionObjChange) { return null; }

        let type_coin: string | undefined;
        let auction_addr: string | undefined;

        for (const tx of txData.txs)
        {
            // find the `admin_cancels_auction` tx
            if (isTxMoveCall(tx) &&
                tx.MoveCall.package === this.packageId &&
                tx.MoveCall.module === "auction" &&
                tx.MoveCall.function === "admin_cancels_auction" &&
                tx.MoveCall.arguments &&
                tx.MoveCall.type_arguments
            ) {
                const txInputs = tx.MoveCall.arguments
                    .filter(arg => isArgInput(arg))
                    .map(arg => allInputs[arg.Input]);

                if (txInputs.length !== 2) { return null; }

                type_coin = tx.MoveCall.type_arguments[0];
                auction_addr = getArgVal(txInputs[0]);
            }
        }

        if (!auction_addr || !type_coin) { return null; }

        return {
            kind: "admin_cancels_auction",
            digest: resp.digest,
            timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
            sender: txData.sender,
            inputs: {
                type_coin,
                auction_addr,
            },
        };
    }

    public admin_sets_pay_addr(
        resp: SuiTransactionBlockResponse,
    ): TxAdminSetsPayAddr | null
    {
        let txData: ReturnType<typeof txResToData>;
        try { txData = txResToData(resp); }
        catch (_err) { return null; }
        const allInputs = txData.inputs;

        const auctionObjChange = this.extractAuctionObjChange(resp);
        if (!auctionObjChange) { return null; }

        let type_coin: string | undefined;
        let auction_addr: string | undefined;
        let pay_addr: string | undefined;
        for (const tx of txData.txs)
        {
            // find the `admin_sets_pay_addr` tx
            if (isTxMoveCall(tx) &&
                tx.MoveCall.package === this.packageId &&
                tx.MoveCall.module === "auction" &&
                tx.MoveCall.function === "admin_sets_pay_addr" &&
                tx.MoveCall.arguments &&
                tx.MoveCall.type_arguments
            ) {
                const txInputs = tx.MoveCall.arguments
                    .filter(arg => isArgInput(arg))
                    .map(arg => allInputs[arg.Input]);

                if (txInputs.length !== 3) { return null; }

                type_coin = tx.MoveCall.type_arguments[0];
                auction_addr = getArgVal(txInputs[0]);
                pay_addr = getArgVal(txInputs[1]);
            }
        }

        if (!auction_addr || !type_coin || !pay_addr) { return null; }

        return {
            kind: "admin_sets_pay_addr",
            digest: resp.digest,
            timestamp: resp.timestampMs ? parseInt(resp.timestampMs) : 0,
            sender: txData.sender,
            inputs: {
                type_coin,
                auction_addr,
                pay_addr,
            },
        };
    }

    // === object extractors ===

    /**
     * Extract the created Auction object (if any) from `SuiTransactionBlockResponse.objectChanges`.
     */
    public extractAuctionObjChange(
        resp: SuiTransactionBlockResponse,
    ): SuiObjectChangeCreated | SuiObjectChangeMutated | undefined
    {
        return resp.objectChanges?.find(o =>
            o.type === "created" || o.type === "mutated" && o.objectType.startsWith(`${this.packageId}::auction::Auction<`)
        ) as SuiObjectChangeCreated | SuiObjectChangeMutated | undefined;
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
