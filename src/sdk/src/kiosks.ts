import { getNormalizedRuleType, KioskClient, KioskOwnerCap, KioskTransaction, TransferPolicy } from "@mysten/kiosk";
import { Transaction } from "@mysten/sui/transactions";
import { NetworkName } from "@polymedia/suitcase-core";

// === types ===

export type KioskKind = "regular" | "personal" | "origin_byte";

export type OwnedKioskItem = {
    cap: KioskOwnerCap;
    kiosk: {
        id: string;
        itemCount: number;
        allowExtensions: boolean;
    };
    item: {
        isLocked: boolean;
        isListed: boolean;
    };
};

// === functions ===

/**
 * Check if a `KioskClient` has all the rule resolvers for an item type.
 */
export async function hasAllRuleResolvers(
    kioskClient: KioskClient,
    itemType: string,
): Promise<{ hasAll: boolean, missing: TransferPolicy[] }> {
    const policies = await kioskClient.getTransferPolicies({ type: itemType });

    const missing = policies.filter(
        (p) => !hasRuleResolver(kioskClient, p.type)
    );

    return {
        hasAll: missing.length === 0,
        missing,
    };
}

/**
 * Check if a `KioskClient` has a rule resolver.
 */
export function hasRuleResolver(
    kioskClient: KioskClient,
    ruleType: string,
): boolean {
    return kioskClient.rules.some(
        (x) => getNormalizedRuleType(x.rule) === getNormalizedRuleType(ruleType)
    );
}

/**
 * Extract an unlocked item from a kiosk and return it.
 */
export function takeItemFromKiosk(
    tx: Transaction,
    kioskClient: KioskClient,
    cap: KioskOwnerCap,
    itemId: string,
    itemType: string
) {
    const kioskTx = new KioskTransaction({ transaction: tx, kioskClient, cap });

    const item = kioskTx.take({ itemId, itemType });

    kioskTx.finalize();

    return item;
}

/**
 * List the item for 0 SUI in the seller's kiosk, purchase the item, and place it into a new kiosk.
 */
export async function sellForZeroIntoNewKiosk(
    tx: Transaction,
    kioskClient: KioskClient,
    sellerCap: KioskOwnerCap,
    itemId: string,
    itemType: string,
): Promise<KioskTransaction>
{
    // List the NFT for 0 SUI in the seller's kiosk
    const sellerKioskTx = new KioskTransaction({ transaction: tx, kioskClient, cap: sellerCap });
    sellerKioskTx.list({ itemType, itemId, price: 0n });

    // Create a new kiosk for the buyer
    const newKioskTx = new KioskTransaction({ transaction: tx, kioskClient });
    newKioskTx.create();

    // Purchase the item and resolve the TransferPolicy
    await newKioskTx.purchaseAndResolve({
        itemType,
        itemId,
        price: 0n,
        sellerKiosk: sellerKioskTx.getKiosk(),
    });

    newKioskTx.share();

    sellerKioskTx.finalize();

    return newKioskTx;
}

// === config ===

export const KIOSK_CAP_TYPES: Record<NetworkName, Record<KioskKind, string>> = {
    mainnet: {
        regular: "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap",
        personal: "0x0cb4bcc0560340eb1a1b929cabe56b33fc6449820ec8c1980d69bb98b649b802::personal_kiosk::PersonalKioskCap",
        origin_byte: "0x95a441d389b07437d00dd07e0b6f05f513d7659b13fd7c5d3923c7d9d847199b::ob_kiosk::OwnerToken",
    },
    testnet: {
        regular: "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap",
        personal: "0x06f6bdd3f2e2e759d8a4b9c252f379f7a05e72dfe4c0b9311cdac27b8eb791b1::personal_kiosk::PersonalKioskCap",
        origin_byte: "",
    },
    devnet: {
        regular: "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap",
        personal: "",
        origin_byte: "",
    },
    localnet: {
        regular: "0x0000000000000000000000000000000000000000000000000000000000000002::kiosk::KioskOwnerCap",
        personal: "",
        origin_byte: "",
    },
};
