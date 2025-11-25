import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { parseEther, zeroAddress } from "viem";

describe("NftAuctionFactory", function () {
  let viem: any;
  let publicClient: any;
  let owner: any;
  let seller: any;
  let bidder: any;
  let factory: any;
  let nft: any;
  let priceConverter: any;
  let mockAggregator: any;

  const DEFAULT_FEE_RATE = 250n; // 2.5%

  beforeEach(async () => {
    // 初始化 viem 和账户
    const network = await hre.network.connect();
    viem = network.viem;
    publicClient = await viem.getPublicClient();
    [owner, seller, bidder] = await viem.getWalletClients();
    // 部署 NFT
    nft = await viem.deployContract("ERC721Collectible", [], {
      client: { wallet: owner },
    });
    await nft.write.initialize(["TestNFT", "TNFT"], { account: owner.account });

    // 部署 Price Converter
    mockAggregator = await viem.deployContract("MockAggregatorV3", [], {
      client: { wallet: owner },
    });
    await mockAggregator.write.setLatestAnswer([2000n * 10n ** 8n], {
      account: owner.account,
    });

    priceConverter = await viem.deployContract(
      "PriceConverter",
      [mockAggregator.address],
      { client: { wallet: owner } }
    );

    // 部署 Factory
    factory = await viem.deployContract("NftAuctionFactory", [], {
      client: { wallet: owner },
    });

    await factory.write.initialize(
      [owner.account.address, priceConverter.address, DEFAULT_FEE_RATE],
      { account: owner.account }
    );
  });

  it("Should initialize correctly", async () => {
    const converter = await factory.read.priceConverter();
    const feeRate = await factory.read.defaultFeeRate();

    assert.equal(
      converter.toLowerCase(),
      priceConverter.address.toLowerCase()
    );
    assert.equal(feeRate, DEFAULT_FEE_RATE);
  });

  it("Should have default fee structures", async () => {
    const fee0 = await factory.read.feeStructures([0n]);
    const fee1 = await factory.read.feeStructures([1n]);
    const fee2 = await factory.read.feeStructures([2n]);

    // 0-1000 USD: 2.5%
    assert.equal(fee0[0], 1000n * 10n ** 8n);
    assert.equal(fee0[1], 250n);

    // 1000-10000 USD: 2%
    assert.equal(fee1[0], 10000n * 10n ** 8n);
    assert.equal(fee1[1], 200n);

    // 10000+ USD: 1.5%
    assert.equal(fee2[1], 150n);
  });

  it("Should create auction and deploy Auction contract", async () => {
    // Mint NFT to seller
    await nft.write.mint([seller.account.address], { account: owner.account });
    const tokenId = 1n;

    // Approve factory
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    const tx = factory.write.createAuction(
      [
        3600n, // duration
        parseEther("1"), // start price
        nft.address,
        tokenId,
      ],
      { account: seller.account }
    );

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: await tx,
    });

    // Check event emitted
    const logs = await publicClient.getLogs({
      address: factory.address,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    assert.ok(logs.length > 0);

    // Check auction was recorded
    const count = await factory.read.auctionCount();
    assert.equal(count, 1n);

    const auctionAddress = await factory.read.getAuctionAddress([0n]);
    assert.ok(auctionAddress !== zeroAddress);

    // Check isAuction mapping
    const isAuction = await factory.read.isAuction([auctionAddress]);
    assert.equal(isAuction, true);
  });

  it("Should track auctions by seller", async () => {
    await nft.write.mint([seller.account.address], { account: owner.account });
    await nft.write.approve([factory.address, 1n], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, 1n],
      { account: seller.account }
    );

    const auctions = await factory.read.getAuctionsBySeller([
      seller.account.address,
    ]);
    assert.equal(auctions.length, 1);
  });

  it("Should track auctions by NFT", async () => {
    await nft.write.mint([seller.account.address], { account: owner.account });
    const tokenId = 1n;

    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, tokenId],
      { account: seller.account }
    );

    const auctions = await factory.read.getAuctionsByNFT([
      nft.address,
      tokenId,
    ]);
    assert.equal(auctions.length, 1);
  });

  it("Should return all auctions", async () => {
    // Create 2 auctions
    await nft.write.mint([seller.account.address], { account: owner.account });
    await nft.write.mint([seller.account.address], { account: owner.account });

    await nft.write.approve([factory.address, 1n], {
      account: seller.account,
    });
    await nft.write.approve([factory.address, 2n], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, 1n],
      { account: seller.account }
    );
    await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, 2n],
      { account: seller.account }
    );

    const allAuctions = await factory.read.allAuction();
    assert.equal(allAuctions.length, 2);
  });

  it("Should create ERC20 auction", async () => {
    const mockToken = await viem.deployContract(
      "MockERC20",
      ["TestToken", "TEST", 18],
      { client: { wallet: owner } }
    );

    await nft.write.mint([seller.account.address], { account: owner.account });
    await nft.write.approve([factory.address, 1n], {
      account: seller.account,
    });

    const auctionAddr = await factory.write.createAuctionWithToken(
      [nft.address, 1n, mockToken.address, parseEther("100"), 3600n],
      { account: seller.account }
    );

    const count = await factory.read.auctionCount();
    assert.equal(count, 1n);
  });

  it("Should calculate dynamic fee rate", async () => {
    // $500 -> 2.5%
    let rate = await factory.read.calculateFeeRate([500n * 10n ** 8n]);
    assert.equal(rate, 250n);

    // $5000 -> 2%
    rate = await factory.read.calculateFeeRate([5000n * 10n ** 8n]);
    assert.equal(rate, 200n);

    // $50000 -> 1.5%
    rate = await factory.read.calculateFeeRate([50000n * 10n ** 8n]);
    assert.equal(rate, 150n);
  });

  it("Should update price converter", async () => {
    const newConverter = bidder.account.address;

    await viem.assertions.emitWithArgs(
      factory.write.setPriceConverter([newConverter], {
        account: owner.account,
      }),
      factory,
      "PriceConverterUpdated",
      [priceConverter.address, newConverter]
    );

    const converter = await factory.read.priceConverter();
    assert.equal(converter.toLowerCase(), newConverter.toLowerCase());
  });

  it("Should update default fee rate", async () => {
    const newRate = 300n; // 3%

    await viem.assertions.emitWithArgs(
      factory.write.setDefaultFeeRate([newRate], { account: owner.account }),
      factory,
      "DefaultFeeRateUpdated",
      [DEFAULT_FEE_RATE, newRate]
    );

    const rate = await factory.read.defaultFeeRate();
    assert.equal(rate, newRate);
  });

  it("Should update fee structure", async () => {
    const newThreshold = 5000n * 10n ** 8n;
    const newRate = 180n;

    await viem.assertions.emitWithArgs(
      factory.write.setFeeStructure([1n, newThreshold, newRate], {
        account: owner.account,
      }),
      factory,
      "FeeStructureUpdated",
      [1n, newThreshold, newRate]
    );

    const fee = await factory.read.feeStructures([1n]);
    assert.equal(fee[0], newThreshold);
    assert.equal(fee[1], newRate);
  });

  it("Should reject invalid parameters", async () => {
    await assert.rejects(
      async () => {
        await factory.write.createAuction(
          [3600n, 0n, nft.address, 1n], // price = 0
          { account: seller.account }
        );
      },
      (error: any) => {
        return error.message.includes("InvalidParameter");
      }
    );
  });

  it("Should prevent non-admin from admin functions", async () => {
    await assert.rejects(
      async () => {
        await factory.write.setDefaultFeeRate([300n], {
          account: bidder.account,
        });
      },
      (error: any) => {
        return error.message.includes("AccessControlUnauthorizedAccount");
      }
    );
  });

  it("Should receive ETH fees", async () => {
    // Send ETH to factory (simulating fee collection)
    await bidder.sendTransaction({
      to: factory.address,
      value: parseEther("1"),
    });

    const balance = await publicClient.getBalance({
      address: factory.address,
    });
    assert.equal(balance, parseEther("1"));
  });

  it("Should withdraw ETH fees", async () => {
    // Send ETH to factory
    await bidder.sendTransaction({
      to: factory.address,
      value: parseEther("1"),
    });

    const balanceBefore = await publicClient.getBalance({
      address: owner.account.address,
    });

    await factory.write.withdrawFees([owner.account.address], {
      account: owner.account,
    });

    const balanceAfter = await publicClient.getBalance({
      address: owner.account.address,
    });

    assert.ok(balanceAfter > balanceBefore);
  });
});

