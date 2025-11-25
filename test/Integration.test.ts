import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { parseEther } from "viem";

describe("Integration Tests - Full Auction Flow", function () {
  let viem: any;
  let publicClient: any;
  let owner: any;
  let seller: any;
  let bidder1: any;
  let bidder2: any;
  let bidder3: any;
  let factory: any;
  let nft: any;
  let priceConverter: any;
  let mockAggregator: any;
  let mockToken: any;

  const AUCTION_DURATION = 3600n;

  beforeEach(async () => {
    // 初始化 viem 和账户
    const network = await hre.network.connect();
    viem = network.viem;
    publicClient = await viem.getPublicClient();
    [owner, seller, bidder1, bidder2, bidder3] = await viem.getWalletClients();
    // 部署完整系统
    nft = await viem.deployContract("ERC721Collectible", [], {
      client: { wallet: owner },
    });
    await nft.write.initialize(["TestNFT", "TNFT"], { account: owner.account });

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

    factory = await viem.deployContract("NftAuctionFactory", [], {
      client: { wallet: owner },
    });
    await factory.write.initialize(
      [owner.account.address, priceConverter.address, 250n],
      { account: owner.account }
    );

    // 部署 ERC20
    mockToken = await viem.deployContract(
      "MockERC20",
      ["TestToken", "TEST", 18],
      { client: { wallet: owner } }
    );

    // 配置 Token 价格
    const tokenAggregator = await viem.deployContract("MockAggregatorV3", [], {
      client: { wallet: owner },
    });
    await tokenAggregator.write.setLatestAnswer([1n * 10n ** 8n], {
      account: owner.account,
    });
    await priceConverter.write.setTokenPriceFeed(
      [mockToken.address, tokenAggregator.address],
      { account: owner.account }
    );
  });

  it("Should complete full ETH auction lifecycle", async () => {
    // 1. Mint NFT
    await nft.write.mint([seller.account.address], { account: owner.account });
    const tokenId = 1n;

    // 2. Seller creates auction via factory
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    const createTx = await factory.write.createAuction(
      [AUCTION_DURATION, parseEther("1"), nft.address, tokenId],
      { account: seller.account }
    );

    await publicClient.waitForTransactionReceipt({ hash: createTx });

    const auctionAddress = await factory.read.getAuctionAddress([0n]);

    // 3. Multiple bidders place bids
    const auction = await viem.getContractAt("Auction", auctionAddress);

    await auction.write.bid({
      value: parseEther("1.2"),
      account: bidder1.account,
    });

    await auction.write.bid({
      value: parseEther("1.5"),
      account: bidder2.account,
    });

    await auction.write.bid({
      value: parseEther("2"),
      account: bidder3.account,
    });

    // 4. Check highest bidder
    const info = await auction.read.auctionInfo();
    assert.equal(
      info[8].toLowerCase(),
      bidder3.account.address.toLowerCase()
    );
    assert.equal(info[7], parseEther("2"));

    // 5. Fast forward time
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    // 6. End auction
    const sellerBalanceBefore = await publicClient.getBalance({
      address: seller.account.address,
    });

    await auction.write.endAuction({ account: owner.account });

    // 7. Verify results
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assert.equal(
      nftOwner.toLowerCase(),
      bidder3.account.address.toLowerCase()
    );

    const sellerBalanceAfter = await publicClient.getBalance({
      address: seller.account.address,
    });
    assert.ok(sellerBalanceAfter > sellerBalanceBefore);

    // Factory should have received fees
    const factoryBalance = await publicClient.getBalance({
      address: factory.address,
    });
    assert.ok(factoryBalance > 0n);
  });

  it("Should complete ERC20 auction", async () => {
    // Mint tokens to bidders
    await mockToken.write.mint([bidder1.account.address, parseEther("1000")], {
      account: owner.account,
    });
    await mockToken.write.mint([bidder2.account.address, parseEther("1000")], {
      account: owner.account,
    });

    // Mint NFT
    await nft.write.mint([seller.account.address], { account: owner.account });
    const tokenId = 1n;

    // Create ERC20 auction
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    await factory.write.createAuctionWithToken(
      [nft.address, tokenId, mockToken.address, parseEther("100"), AUCTION_DURATION],
      { account: seller.account }
    );

    const auctionAddress = await factory.read.getAuctionAddress([0n]);
    const auction = await viem.getContractAt("Auction", auctionAddress);

    // Approve and bid
    await mockToken.write.approve([auctionAddress, parseEther("200")], {
      account: bidder1.account,
    });
    await auction.write.bidWithERC20([parseEther("150")], {
      account: bidder1.account,
    });

    await mockToken.write.approve([auctionAddress, parseEther("300")], {
      account: bidder2.account,
    });
    await auction.write.bidWithERC20([parseEther("200")], {
      account: bidder2.account,
    });

    // End auction
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    await auction.write.endAuction({ account: owner.account });

    // Verify NFT transfer
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assert.equal(
      nftOwner.toLowerCase(),
      bidder2.account.address.toLowerCase()
    );

    // Verify token payment
    const sellerBalance = await mockToken.read.balanceOf([
      seller.account.address,
    ]);
    assert.ok(sellerBalance > 0n);
  });

  it("Should handle multiple parallel auctions", async () => {
    // Create 3 NFTs and 3 auctions
    const tokenIds = [1n, 2n, 3n];

    for (const id of tokenIds) {
      await nft.write.mint([seller.account.address], {
        account: owner.account,
      });
      await nft.write.approve([factory.address, id], {
        account: seller.account,
      });
      await factory.write.createAuction(
        [AUCTION_DURATION, parseEther("1"), nft.address, id],
        { account: seller.account }
      );
    }

    const auctionCount = await factory.read.auctionCount();
    assert.equal(auctionCount, 3n);

    // Bid on each auction
    for (let i = 0; i < 3; i++) {
      const auctionAddr = await factory.read.getAuctionAddress([BigInt(i)]);
      const auction = await viem.getContractAt("Auction", auctionAddr);
      await auction.write.bid({
        value: parseEther("1.5"),
        account: bidder1.account,
      });
    }

    // End all auctions
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    for (let i = 0; i < 3; i++) {
      await factory.write.endAuction([BigInt(i)], { account: owner.account });
    }

    // Verify all NFTs transferred
    for (const id of tokenIds) {
      const owner = await nft.read.ownerOf([id]);
      assert.equal(owner.toLowerCase(), bidder1.account.address.toLowerCase());
    }
  });

  it("Should track USD values correctly", async () => {
    await nft.write.mint([seller.account.address], { account: owner.account });
    await nft.write.approve([factory.address, 1n], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [AUCTION_DURATION, parseEther("1"), nft.address, 1n],
      { account: seller.account }
    );

    const auctionAddr = await factory.read.getAuctionAddress([0n]);
    const auction = await viem.getContractAt("Auction", auctionAddr);

    // Bid 2 ETH at $2000/ETH = $4000
    await auction.write.bid({
      value: parseEther("2"),
      account: bidder1.account,
    });

    const usdValue = await auction.read.getHighestBidInUSD();
    assert.equal(usdValue, 4000n * 10n ** 8n);
  });

  it("Should withdraw accumulated platform fees", async () => {
    // Create and complete an auction
    await nft.write.mint([seller.account.address], { account: owner.account });
    await nft.write.approve([factory.address, 1n], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [AUCTION_DURATION, parseEther("1"), nft.address, 1n],
      { account: seller.account }
    );

    const auctionAddr = await factory.read.getAuctionAddress([0n]);
    const auction = await viem.getContractAt("Auction", auctionAddr);

    await auction.write.bid({
      value: parseEther("10"),
      account: bidder1.account,
    });

    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    await auction.write.endAuction({ account: owner.account });

    // Withdraw fees
    const factoryBalance = await publicClient.getBalance({
      address: factory.address,
    });
    assert.ok(factoryBalance > 0n);

    const ownerBalanceBefore = await publicClient.getBalance({
      address: owner.account.address,
    });

    await factory.write.withdrawFees([owner.account.address], {
      account: owner.account,
    });

    const ownerBalanceAfter = await publicClient.getBalance({
      address: owner.account.address,
    });
    assert.ok(ownerBalanceAfter > ownerBalanceBefore);
  });
});

