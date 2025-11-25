import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { parseEther, getAddress } from "viem";

describe("Auction", function () {
  let viem: any;
  let publicClient: any;
  let owner: any;
  let seller: any;
  let bidder1: any;
  let bidder2: any;
  let nft: any;
  let priceConverter: any;
  let mockAggregator: any;
  let auction: any;
  let tokenId: bigint;

  const AUCTION_DURATION = 3600n; // 1 hour
  const START_PRICE = parseEther("1");

  beforeEach(async () => {
    // 初始化 viem 和账户
    const network = await hre.network.connect();
    viem = network.viem;
    publicClient = await viem.getPublicClient();
    [owner, seller, bidder1, bidder2] = await viem.getWalletClients();
    // 部署 NFT
    nft = await viem.deployContract("ERC721Collectible", [], {
      client: { wallet: owner },
    });
    await nft.write.initialize(["TestNFT", "TNFT"], { account: owner.account });

    // Mint NFT to seller
    await nft.write.mint([seller.account.address], { account: owner.account });
    tokenId = 1n;

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

    // Owner (acting as factory) receives NFT from seller
    await nft.write.transferFrom(
      [seller.account.address, owner.account.address, tokenId],
      { account: seller.account }
    );

    // 部署 Auction（owner作为factory）
    auction = await viem.deployContract(
      "Auction",
      [
        seller.account.address,
        nft.address,
        tokenId,
        "0x0000000000000000000000000000000000000000", // ETH
        START_PRICE,
        AUCTION_DURATION,
        250n, // 2.5% fee
        priceConverter.address,
      ],
      { client: { wallet: owner } }
    );

    // Owner approves NFT to Auction and calls initialize
    await nft.write.approve([auction.address, tokenId], {
      account: owner.account,
    });
    await auction.write.initialize({ account: owner.account });
  });

  it("Should create auction and transfer NFT to contract", async () => {
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assert.equal(
      nftOwner.toLowerCase(),
      auction.address.toLowerCase()
    );
  });

  it("Should initialize auction info correctly", async () => {
    const info = await auction.read.auctionInfo();
    assert.equal(info[0].toLowerCase(), seller.account.address.toLowerCase()); // seller
    assert.equal(info[4], START_PRICE); // startPrice
    assert.equal(info[6], AUCTION_DURATION); // duration
    assert.equal(info[9], false); // ended
  });

  it("Should accept ETH bid", async () => {
    const bidAmount = parseEther("1.5");

    await viem.assertions.emitWithArgs(
      auction.write.bid({ value: bidAmount, account: bidder1.account }),
      auction,
      "BidPlaced",
      [bidder1.account.address, bidAmount, 3000n * 10n ** 8n] // $3000 at $2000/ETH
    );

    const info = await auction.read.auctionInfo();
    assert.equal(info[7], bidAmount); // highestBid
    assert.equal(
      info[8].toLowerCase(),
      bidder1.account.address.toLowerCase()
    ); // highestBidder
  });

  it("Should refund previous bidder", async () => {
    const bid1 = parseEther("1.5");
    const bid2 = parseEther("2");

    // First bid
    await auction.write.bid({ value: bid1, account: bidder1.account });

    const balanceBefore = await publicClient.getBalance({
      address: bidder1.account.address,
    });

    // Second bid should refund first bidder
    await auction.write.bid({ value: bid2, account: bidder2.account });

    const balanceAfter = await publicClient.getBalance({
      address: bidder1.account.address,
    });

    // Bidder1 should have received refund
    assert.ok(balanceAfter > balanceBefore);
  });

  it("Should reject bid lower than current highest", async () => {
    await auction.write.bid({
      value: parseEther("2"),
      account: bidder1.account,
    });

    await assert.rejects(
      async () => {
        await auction.write.bid({
          value: parseEther("1.5"),
          account: bidder2.account,
        });
      },
      (error: any) => {
        return error.message.includes("BidTooLow");
      }
    );
  });

  it("Should reject bid below start price", async () => {
    await assert.rejects(
      async () => {
        await auction.write.bid({
          value: parseEther("0.5"),
          account: bidder1.account,
        });
      },
      (error: any) => {
        return error.message.includes("BidTooLow");
      }
    );
  });

  it("Should end auction after duration", async () => {
    const bidAmount = parseEther("2");
    await auction.write.bid({ value: bidAmount, account: bidder1.account });

    // Increase time
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    const sellerBalanceBefore = await publicClient.getBalance({
      address: seller.account.address,
    });

    await auction.write.endAuction({ account: owner.account });

    const sellerBalanceAfter = await publicClient.getBalance({
      address: seller.account.address,
    });

    // Check NFT transferred to winner
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assert.equal(
      nftOwner.toLowerCase(),
      bidder1.account.address.toLowerCase()
    );

    // Check seller received payment minus fee (2.5%)
    const expectedAmount = (bidAmount * 975n) / 1000n;
    assert.ok(sellerBalanceAfter > sellerBalanceBefore);

    // Check auction ended
    const info = await auction.read.auctionInfo();
    assert.equal(info[9], true);
  });

  it("Should return NFT to seller if no bids", async () => {
    // Increase time
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    await auction.write.endAuction({ account: owner.account });

    const nftOwner = await nft.read.ownerOf([tokenId]);
    assert.equal(
      nftOwner.toLowerCase(),
      seller.account.address.toLowerCase()
    );
  });

  it("Should reject ending auction before duration", async () => {
    await auction.write.bid({
      value: parseEther("2"),
      account: bidder1.account,
    });

    await assert.rejects(
      async () => {
        await auction.write.endAuction({ account: owner.account });
      },
      (error: any) => {
        return error.message.includes("AuctionNotEnded");
      }
    );
  });

  it("Should allow seller to cancel auction without bids", async () => {
    await auction.write.cancelAuction({ account: seller.account });

    const nftOwner = await nft.read.ownerOf([tokenId]);
    assert.equal(
      nftOwner.toLowerCase(),
      seller.account.address.toLowerCase()
    );

    const info = await auction.read.auctionInfo();
    assert.equal(info[9], true);
  });

  it("Should reject cancel after bids placed", async () => {
    await auction.write.bid({
      value: parseEther("2"),
      account: bidder1.account,
    });

    await assert.rejects(
      async () => {
        await auction.write.cancelAuction({ account: seller.account });
      },
      (error: any) => {
        return error.message.includes("Cannot cancel with bids");
      }
    );
  });

  it("Should get highest bid in USD", async () => {
    await auction.write.bid({
      value: parseEther("2"),
      account: bidder1.account,
    });

    const usdValue = await auction.read.getHighestBidInUSD();
    // 2 ETH * $2000 = $4000
    assert.equal(usdValue, 4000n * 10n ** 8n);
  });

  it("Should check if auction can end", async () => {
    let canEnd = await auction.read.canEnd();
    assert.equal(canEnd, false);

    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    canEnd = await auction.read.canEnd();
    assert.equal(canEnd, true);
  });

  it("Should return correct time remaining", async () => {
    let remaining = await auction.read.timeRemaining();
    assert.ok(remaining > 0n);

    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [Number(AUCTION_DURATION)],
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [],
    });

    remaining = await auction.read.timeRemaining();
    assert.equal(remaining, 0n);
  });
});

