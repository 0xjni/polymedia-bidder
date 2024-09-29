import { useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { NestedResult, NetworkName } from "@polymedia/suitcase-core";
import { useState } from "react";
import { useAppContext } from "../App";
import { getRandomDarkColor, getRandomLightColor, makeDisplaySvg, svgToDataUrl, trimSvg } from "../lib/svg";
import { SubmitRes } from "../lib/types";
import { Btn } from "./Btn";

export const DEV_PACKAGE_IDS: Record<NetworkName, string> = {
    mainnet: "",
    testnet: "",
    devnet: "0xb64d01374dbae81966fe999bd340deaa4a893ebd6c36e55aaa48f91286a2b5d9",
    localnet: "",
};

const NFT_COUNT = 10;
const NFT_DESCRIPTION = "A free NFT to test the BIDDER app";
export const NFT_TITLE_LINE_1 = "Dev NFT";
export const getNftTitleLine2 = () => {
    return `#${Math.floor(Math.random() * 9000) + 1000}`;
};

const getNftSvgDataUrl = (titleLine1: string, titleLine2: string): string =>
{
    const svgRaw = makeDisplaySvg({
        backgroundColor: getRandomDarkColor(),
        titleColor: getRandomLightColor(),
        titleSize: 20,
        titleLine1,
        titleLine2,
    });

    const svgTrimmed = trimSvg(svgRaw);
    const svgDataUrl = svgToDataUrl(svgTrimmed);

    return svgDataUrl;
};

export const DevNftCreator: React.FC<{
    onNftCreated: () => void;
}> = ({
    onNftCreated,
}) =>
{
    // === state ===

    const currAcc = useCurrentAccount();

    const { bidderClient, network, setIsWorking } = useAppContext();
    const [ createRes, setCreateRes ] = useState<SubmitRes>({ ok: null });

    const packageId = DEV_PACKAGE_IDS[network];

    // === functions ===

    const createNft = async () =>
    {
        if (!currAcc) {
            return;
        }

        try {
            setIsWorking(true);
            setCreateRes({ ok: null });

            const nfts: NestedResult[] = [];
            const tx = new Transaction();
            for (let i = 0; i < NFT_COUNT; i++)
            {
                const nftTitleLine2 = getNftTitleLine2();
                const [nft] = tx.moveCall({
                    target: `${packageId}::dev_nft::new_dev_nft`,
                    arguments: [
                        tx.pure.string(`${NFT_TITLE_LINE_1} #${nftTitleLine2}`),
                        tx.pure.string(NFT_DESCRIPTION),
                        tx.pure.string(getNftSvgDataUrl(NFT_TITLE_LINE_1, nftTitleLine2)),
                    ],
                });
                nfts.push(nft);
            }
            tx.transferObjects(nfts, currAcc.address);

            const resp = await bidderClient.signAndExecuteTransaction(tx);
            if (resp.effects?.status.status !== "success") {
                throw new Error(resp.effects?.status.error);
            }

            setCreateRes({ ok: true });
            setTimeout(onNftCreated, 750);
        } catch (err) {
            setCreateRes({ ok: false, err: bidderClient.errCodeToStr(err, "Failed to create NFTs") });
            console.warn("[createNft]", err);
        } finally {
            setIsWorking(false);
        }

        console.log("createNft");
    };

    // === html ===

    return <>
        <div className="card compact">
            <div className="card-title">No items? No problem!</div>
            <div className="card-description">You can create free NFTs to test the BIDDER app.</div>
            <div className="btn-submit">
                <Btn onClick={createNft}>Create NFTs</Btn>

                {createRes.ok === true &&
                <div className="success">NFTs created!</div>}

                {createRes.ok === false && createRes.err &&
                <div className="error">{createRes.err}</div>}
            </div>
        </div>
    </>;
};
