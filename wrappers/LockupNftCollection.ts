import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Dictionary, Sender, SendMode } from 'ton-core';
import { CollectionMint, MintValue } from './helpers/collectionHelpers';
import { encodeOffChainContent } from './helpers/content';

export type RoyaltyParams = {
    tvlFactor: number;
    tvlBase: number;
    rewardsFactor: number;
    rewardsBase: number;
    royaltyAddress: Address;
};

export type NftCollectionConfig = {
    nextItemIndex: number;
    collectionContent: Cell;
    nftItemCode: Cell;
    royaltyParams: RoyaltyParams;
    stakingParams: Dictionary<number, number>;
    withdrawalFactorTon1: number;
    withdrawalFactorJetton: number;
};

export type NftCollectionContent = {
    collectionContent: string;
    commonContent: string;
};

export function buildNftCollectionContentCell(data: NftCollectionContent): Cell {
    let contentCell = beginCell();

    let collectionContent = encodeOffChainContent(data.collectionContent);

    let commonContent = beginCell();
    commonContent.storeStringTail(data.commonContent);

    contentCell.storeRef(collectionContent);
    contentCell.storeRef(commonContent);

    return contentCell.endCell();
}

export function nftCollectionConfigToCell(config: NftCollectionConfig): Cell {
    return beginCell()
        .storeUint(config.nextItemIndex, 64)
        .storeRef(config.nftItemCode)
        .storeRef(config.collectionContent)
        .storeRef(
            beginCell()
                .storeUint(config.royaltyParams.tvlFactor, 32)
                .storeUint(config.royaltyParams.tvlBase, 32)
                .storeUint(config.royaltyParams.rewardsFactor, 32)
                .storeUint(config.royaltyParams.rewardsBase, 32)
                .storeAddress(config.royaltyParams.royaltyAddress)
            .endCell()
        )
        .storeDict(config.stakingParams)
        .storeUint(0, 2)
        .storeUint(config.withdrawalFactorTon1, 16)
        .storeUint(config.withdrawalFactorJetton, 16)
        .storeCoins(0)
        .storeCoins(0)
    .endCell();
}

export class NftCollection implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new NftCollection(address);
    }

    static createFromConfig(config: NftCollectionConfig, code: Cell, workchain = 0) {
        const data = nftCollectionConfigToCell(config);
        const init = { code, data };
        return new NftCollection(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMintNft(provider: ContractProvider, via: Sender, 
        opts: {
            value: bigint;
            queryId: number;
            itemIndex: number;
            itemOwnerAddress: Address;
            itemContent: string;
            amount: bigint;
        }
    ) {

        const nftContent = beginCell();
        nftContent.storeBuffer(Buffer.from(opts.itemContent));

        const nftMessage = beginCell();

        nftMessage.storeAddress(opts.itemOwnerAddress);
        nftMessage.storeRef(nftContent);

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(1, 32)
                .storeUint(opts.queryId, 64)
                .storeUint(opts.itemIndex, 64)
                .storeCoins(opts.amount)
                .storeRef(nftMessage)
            .endCell(),
        });
    }

    async sendBatchMint(provider: ContractProvider, via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            nfts: CollectionMint[];
        }
    ) {

        if (opts.nfts.length > 250) {
            throw new Error('More than 250 items');
        }

        const dict = Dictionary.empty(Dictionary.Keys.Uint(64), MintValue);
            for (const nft of opts.nfts) {
                dict.set(nft.index, nft);
            }

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(2, 32)
                .storeUint(opts.queryId, 64)
                .storeDict(dict)
            .endCell(),
        });
    }

}