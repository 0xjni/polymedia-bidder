import { SuiClient, SuiObjectResponse, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { SignTransaction, SuiClientBase, TransferModule, objResToFields } from "@polymedia/suitcase-core";
import { AuctionModule } from "./AuctionModule.js";
import { AuctionObject } from "./types.js";

/**
 * Execute transactions on the auction::auction Sui module.
 */
export class AuctionClient extends SuiClientBase
{
    public readonly packageId: string;

    constructor(
        suiClient: SuiClient,
        signTransaction: SignTransaction,
        packageId: string,
    ) {
        super(suiClient, signTransaction);
        this.packageId = packageId;
    }

    // === data fetching ===

    public async fetchAuctions(
        auctionIds: string[],
    ): Promise<AuctionObject[]>
    {
        const pagObjRes = await this.suiClient.multiGetObjects({
            ids: auctionIds,
            options: { showContent: true }
        });
        const auctions = pagObjRes.map(objRes => AuctionClient.parseAuction(objRes));
        return auctions;
    }

    // === data parsing ===

    /* eslint-disable */
    public static parseAuction(
        objRes: SuiObjectResponse,
    ): AuctionObject {
        const fields = objResToFields(objRes);
        return {
            id: fields.id.id,
            item_id: fields.item.fields.id.id,
            begin_time_ms: Number(fields.begin_time_ms),
            end_time_ms: Number(fields.end_time_ms),
            admin_addr: fields.admin_addr,
            pay_addr: fields.pay_addr,
            lead_addr: fields.lead_addr,
            lead_value: BigInt(fields.lead_bal),
            minimum_bid: BigInt(fields.minimum_bid),
            minimum_increase_bps: Number(fields.minimum_increase_bps),
            extension_period_ms: Number(fields.extension_period_ms),
        };
    }
    /* eslint-enable */

    // === module interactions ===

    public async createAndShareAuction(
        type_coin: string,
        name: string,
        description: string,
        pay_addr: string,
        begin_time_ms: number,
        duration_ms: number,
        minimum_bid: bigint,
        minimum_increase_bps: number,
        extension_period_ms: number,
        itemsToAuction: { id: string; type: string }[],
    ): Promise<SuiTransactionBlockResponse>
    {
        const tx = new Transaction();

        const [auctionObj] = AuctionModule.admin_creates_auction(
            tx,
            this.packageId,
            type_coin,
            name,
            description,
            pay_addr,
            begin_time_ms,
            duration_ms,
            minimum_bid,
            minimum_increase_bps,
            extension_period_ms,
        );

        for (const item of itemsToAuction) {
            AuctionModule.admin_adds_item(
                tx,
                this.packageId,
                type_coin,
                item.type,
                auctionObj,
                item.id,
            );
        }

        TransferModule.public_share_object(
            tx,
            `${this.packageId}::auction::Auction<${type_coin}>`,
            auctionObj,
        );

        const resp = await this.signAndExecuteTransaction(tx);
        return resp;
    }
}
