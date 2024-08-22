import { useCurrentAccount } from "@mysten/dapp-kit";
import { PaginatedObjectsResponse, SuiObjectResponse } from "@mysten/sui/client";
import { AUCTION_CONFIG as cnf } from "@polymedia/auction-sdk";
import {
    objResToDisplay,
    objResToFields,
    objResToId,
    objResToType,
    shortenAddress,
} from "@polymedia/suitcase-core";
import { LinkToPolymedia, ReactSetter } from "@polymedia/suitcase-react";
import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AppContext } from "./App";
import { Btn } from "./components/Btn";
import { ConnectToGetStarted } from "./components/ConnectToGetStarted";
import { useInputString, useInputUnsignedBalance, useInputUnsignedInt } from "./components/inputs";

export const PageNew: React.FC = () =>
{
    // === state ===

    const currAcct = useCurrentAccount();

    const { header } = useOutletContext<AppContext>();

    const [ chosenObjs, setChosenObjs ] = useState<SuiObject[]>([]);

    // === html ===

    return (
    <div id="page-new" className="page-regular">

        {header}

        <div className="page-content">

            <h1 className="page-title">NEW AUCTION</h1>

            {!currAcct
            ? <ConnectToGetStarted />
            : <>
                <div className="page-section card">
                    <FormCreateAuction chosenObjs={chosenObjs} />
                </div>

                <div className="page-section">
                    <div className="section-description">
                        Click on the items you want to auction.
                    </div>
                </div>

                <div className="page-section">
                    <ObjectGridSelector setChosenObjs={setChosenObjs} />
                </div>
            </>}

            {/* {chosenObjs.length > 0 &&
            <div id="dialog-create-auction">
                <div className="object-count">
                    {chosenObjs.length} object{chosenObjs.length > 1 ? "s" : ""} selected
                </div>
                <button className="btn">
                    CREATE AUCTION
                </button>
            </div>} */}
        </div>

    </div>
    );
};

// === components ===

const FormCreateAuction: React.FC<{
    chosenObjs: SuiObject[];
}> = ({
    chosenObjs,
}) =>
{
    // === state ===

    const currAcct = useCurrentAccount();
    if (!currAcct) { return; }

    const { auctionClient, network } = useOutletContext<AppContext>();

    const decimals = 9; // TODO: @polymedia/coinmeta

    const form = {
        name: useInputString({ label: "Name", initVal: "", required: true, minBytes: cnf.MIN_NAME_LENGTH, maxBytes: cnf.MAX_NAME_LENGTH }),
        description: useInputString({ label: "Description (optional)", initVal: "", minBytes: cnf.MIN_DESCRIPTION_LENGTH, maxBytes: cnf.MAX_DESCRIPTION_LENGTH }),
        type_coin: useInputString({ label: "Coin type", initVal: "0x2::sui::SUI", required: true }),
        pay_addr: useInputString({ label: "Payment address", initVal: currAcct.address ?? "", required: true }),
        begin_time_ms: useInputUnsignedInt({ label: "Begin time", initVal: "0", required: true }), // TODO MAX_BEGIN_TIME_MS relative to new Date()
        duration_ms: useInputUnsignedInt({ label: "Duration", initVal: "86400000", required: true, min: cnf.MIN_DURATION_MS, max: cnf.MAX_DURATION_MS }),
        minimum_bid: useInputUnsignedBalance({ label: "Minimum bid", decimals, initVal: "1", required: true }),
        minimum_increase_bps: useInputUnsignedInt({ label: "Minimum bid increase", initVal: "500", required: true, min: cnf.MIN_MINIMUM_INCREASE_BPS, max: cnf.MAX_MINIMUM_INCREASE_BPS }),
        extension_period_ms: useInputUnsignedInt({ label: "Extension period", initVal: "900000", required: true, min: cnf.MIN_EXTENSION_PERIOD_MS, max: cnf.MAX_EXTENSION_PERIOD_MS }),
    };

    const hasErrors = Object.values(form).some(input => input.err !== undefined);
    const disableSubmit = chosenObjs.length === 0 || hasErrors;

    // === functions ===

    const onSubmit = async () =>
    {
        if (disableSubmit) {
            return;
        }
        try {
            const resp = await auctionClient.createAndShareAuction(
                form.type_coin.val!,
                form.name.val!,
                form.description.val ?? "",
                form.pay_addr.val!,
                form.begin_time_ms.val!,
                form.duration_ms.val!,
                form.minimum_bid.val!,
                form.minimum_increase_bps.val!,
                form.extension_period_ms.val!,
                chosenObjs,
            );
            console.debug("resp:", resp);
        } catch (err) {
            console.warn(err);
        }
    };

    // === html ===

    return <>
    <div className="form">
        {Object.entries(form).map(([name, input]) => (
            <React.Fragment key={name}>
                {input.input}
            </React.Fragment>
        ))}
    </div>

    {chosenObjs.length > 0 &&
    <div className="object-list">

        {chosenObjs.length} object{chosenObjs.length > 1 ? "s" : ""} selected:

        <div className="list-items">
        {chosenObjs.map(obj =>
            <div key={obj.id}>
                - <LinkToPolymedia addr={obj.id} kind="object" network={network} /> | {shortenAddress(obj.type)} | {obj.name}
            </div>
        )}
        </div>

    </div>}

    <Btn onClick={onSubmit} disabled={disableSubmit}>
        CREATE AUCTION
    </Btn>
    </>;
};

const ObjectGridSelector: React.FC<{
    setChosenObjs: ReactSetter<SuiObject[]>;
}> = ({
    setChosenObjs,
}) =>
{
    // === state ===

    const currAcct = useCurrentAccount();
    if (!currAcct) { return; }

    const { auctionClient } = useOutletContext<AppContext>();

    const [ ownedObjs, setOwnedObjs ] = useState<PaginatedObjectsResponse>();

    // === effects ===

    useEffect(() => {
        fetchOwnedObjects();
    }, [auctionClient, currAcct]);

    // === functions ===

    const fetchOwnedObjects = async (): Promise<void> =>
    {
        try {
            const pagObjRes = await auctionClient.suiClient.getOwnedObjects({
                owner: currAcct.address,
                // owner: "0x10eefc7a3070baa5d72f602a0c89d7b1cb2fcc0b101cf55e6a70e3edb6229f8b",
                filter: { MatchNone: [{ StructType: "0x2::coin::Coin" }], },
                options: { showContent: true, showDisplay: true, showType: true },
                cursor: ownedObjs?.nextCursor,
            });
            setOwnedObjs((prevObjs) => ({
                data: [...(prevObjs ? prevObjs.data : []), ...pagObjRes.data],
                hasNextPage: pagObjRes.hasNextPage,
                nextCursor: pagObjRes.nextCursor,
            }));
        } catch (err) {
            console.warn("[fetchOwnedObjects]", err);
        }
    };

    const addOrRemoveItem = (obj: SuiObject): void =>
    {
        setChosenObjs(prev => {
            const exists = prev.some(item => item.id === obj.id);
            if (exists) {
                return prev.filter(item => item.id !== obj.id);
            } else {
                return [...prev, obj];
            }
        });
    };

    // === html ===

    if (!ownedObjs) {
        return <span>Loading...</span>;
    }

    return <>
    <div className="grid">
        {ownedObjs.data.map((objRes) =>
        {
            const obj = objResToSuiObject(objRes);
            return (
            <div className="grid-item card" key={obj.id}
                onClick={() => { addOrRemoveItem(obj); }}
            >
                <div className="sui-obj">
                    <div className="obj-img">
                        <img src={obj.display.image_url ?? svgNoImage} alt="object image" />
                    </div>
                    <div className="obj-info">
                        <div className="info-line break-all">{shortenAddress(obj.id)} ({shortenAddress(obj.type)})</div>
                        {obj.name && <div className="info-line break-word">{obj.name}</div>}
                        {obj.desc && <div className="info-line break-word">{obj.desc}</div>}
                    </div>
                </div>
            </div>
            );
        })}
    </div>

    {ownedObjs.hasNextPage &&
    <div className="load-more">
        <button className="btn" onClick={fetchOwnedObjects}>
            LOAD MORE
        </button>
    </div>}
    </>;
};

const svgNoImage = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m4.75 16 2.746-3.493a2 2 0 0 1 3.09-.067L13 15.25m-2.085-2.427c1.037-1.32 2.482-3.188 2.576-3.31a2 2 0 0 1 3.094-.073L19 12.25m-12.25 7h10.5a2 2 0 0 0 2-2V6.75a2 2 0 0 0-2-2H6.75a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2Z"></path></svg>');

// === helpers ===

type SuiObject = {
    id: ReturnType<typeof objResToId>;
    type: ReturnType<typeof objResToType>;
    display: ReturnType<typeof objResToDisplay>;
    fields: ReturnType<typeof objResToFields>;
    name: string;
    desc: string;
};

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
function objResToSuiObject(objRes: SuiObjectResponse): SuiObject
{
    const id = objResToId(objRes);
    const type = objResToType(objRes);
    const display = objResToDisplay(objRes);
    const fields = objResToFields(objRes);
    const name = display.name ?? fields.name ?? null;
    const desc = display.description ?? fields.description ?? null;
    return { id, type, display, fields, name, desc };
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment */
