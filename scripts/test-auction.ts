/**
 * 拍卖系统功能测试脚本
 * 替代 Hardhat 3 Beta 不可用的测试功能
 */
import { network } from "hardhat";
import { parseEther } from "viem";
import assert from "node:assert/strict";

// 简单的测试框架
let passCount = 0;
let failCount = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passCount++;
  } catch (error: any) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failCount++;
    throw error;
  }
}

async function main() {
  console.log("🧪 NFT 拍卖系统功能测试\n");
  console.log("=" .repeat(60));

  const { viem } = await network.connect();
  const [deployer, seller, bidder1, bidder2] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("\n📦 阶段 1: 部署合约");
  console.log("-" .repeat(60));

  // 部署 Mock Aggregator
  const mockAgg = await viem.deployContract("MockAggregatorV3", [], {
    client: { wallet: deployer },
  });
  await mockAgg.write.setLatestAnswer([2000n * 10n ** 8n], {
    account: deployer.account,
  });
  console.log("  ✅ MockAggregatorV3 部署成功");

  // 部署 PriceConverter
  const priceConverter = await viem.deployContract(
    "PriceConverter",
    [mockAgg.address],
    { client: { wallet: deployer } }
  );
  console.log("  ✅ PriceConverter 部署成功");

  // 部署 NFT
  const nft = await viem.deployContract("ERC721Collectible", [], {
    client: { wallet: deployer },
  });
  await nft.write.initialize(["Test NFT", "TNFT"], {
    account: deployer.account,
  });
  console.log("  ✅ ERC721Collectible 部署成功");

  // 部署 Factory
  const factory = await viem.deployContract("NftAuctionFactory", [], {
    client: { wallet: deployer },
  });
  await factory.write.initialize(
    [deployer.account.address, priceConverter.address, 250n],
    { account: deployer.account }
  );
  console.log("  ✅ NftAuctionFactory 部署成功");

  // 测试 NFT 功能
  console.log("\n🧪 阶段 2: NFT 合约测试");
  console.log("-" .repeat(60));

  await test("应该能够 mint NFT", async () => {
    await nft.write.mint([seller.account.address], {
      account: deployer.account,
    });
    const owner = await nft.read.ownerOf([1n]);
    assert.equal(owner.toLowerCase(), seller.account.address.toLowerCase());
  });

  await test("应该能够获取 token 计数", async () => {
    const count = await nft.read.getTokenCounter();
    assert.ok(count >= 1n);
  });

  await test("应该支持 ERC721 接口", async () => {
    const supportsInterface = await nft.read.supportsInterface(["0x80ac58cd"]);
    assert.equal(supportsInterface, true);
  });

  // 测试价格转换器
  console.log("\n🧪 阶段 3: 价格转换器测试");
  console.log("-" .repeat(60));

  await test("应该返回正确的 ETH 价格", async () => {
    const price = await priceConverter.read.getEthPrice();
    assert.equal(price, 2000n * 10n ** 8n);
  });

  await test("应该转换 ETH 到 USD", async () => {
    const value = await priceConverter.read.getEthValueInUSD([parseEther("1")]);
    assert.equal(value, 2000n * 10n ** 8n);
  });

  await test("应该转换 2 ETH 到 USD", async () => {
    const value = await priceConverter.read.getEthValueInUSD([parseEther("2")]);
    assert.equal(value, 4000n * 10n ** 8n);
  });

  // 测试工厂合约
  console.log("\n🧪 阶段 4: 工厂合约测试");
  console.log("-" .repeat(60));

  await test("应该能够创建拍卖", async () => {
    await nft.write.mint([seller.account.address], {
      account: deployer.account,
    });
    await nft.write.approve([factory.address, 2n], {
      account: seller.account,
    });

    const tx = await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, 2n],
      { account: seller.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });

    const count = await factory.read.auctionCount();
    assert.equal(count, 1n);
  });

  await test("应该将 NFT 转移到拍卖合约", async () => {
    const auctionAddr = await factory.read.getAuctionAddress([0n]);
    const owner = await nft.read.ownerOf([2n]);
    assert.equal(owner.toLowerCase(), auctionAddr.toLowerCase());
  });

  await test("应该能够获取拍卖地址", async () => {
    const auctionAddr = await factory.read.getAuctionAddress([0n]);
    assert.ok(auctionAddr !== "0x0000000000000000000000000000000000000000");
  });

  await test("应该标记拍卖为有效", async () => {
    const auctionAddr = await factory.read.getAuctionAddress([0n]);
    const isValid = await factory.read.isAuction([auctionAddr]);
    assert.equal(isValid, true);
  });

  // 测试拍卖功能
  console.log("\n🧪 阶段 5: 拍卖合约测试");
  console.log("-" .repeat(60));

  const auctionAddr = await factory.read.getAuctionAddress([0n]);
  const auction = await viem.getContractAt("Auction", auctionAddr);

  await test("应该能够出价", async () => {
    await auction.write.bid({
      value: parseEther("1.2"),
      account: bidder1.account,
    });
    const info = await auction.read.auctionInfo();
    assert.equal(info[7], parseEther("1.2")); // highestBid
  });

  await test("应该记录正确的出价者", async () => {
    const info = await auction.read.auctionInfo();
    assert.equal(
      info[8].toLowerCase(),
      bidder1.account.address.toLowerCase()
    ); // highestBidder
  });

  await test("应该拒绝低于当前出价的出价", async () => {
    let errorThrown = false;
    try {
      await auction.write.bid({
        value: parseEther("1.1"),
        account: bidder2.account,
      });
    } catch (error: any) {
      errorThrown = error.message.includes("BidTooLow");
    }
    assert.ok(errorThrown, "应该抛出 BidTooLow 错误");
  });

  await test("应该接受更高的出价", async () => {
    await auction.write.bid({
      value: parseEther("1.5"),
      account: bidder2.account,
    });
    const info = await auction.read.auctionInfo();
    assert.equal(
      info[8].toLowerCase(),
      bidder2.account.address.toLowerCase()
    );
    assert.equal(info[7], parseEther("1.5"));
  });

  await test("应该能够再次出更高的价", async () => {
    await auction.write.bid({
      value: parseEther("2"),
      account: bidder1.account,
    });
    const info = await auction.read.auctionInfo();
    assert.equal(info[7], parseEther("2"));
  });

  // 测试 USD 价格
  console.log("\n🧪 阶段 6: USD 价格转换测试");
  console.log("-" .repeat(60));

  await test("应该返回正确的 USD 价值", async () => {
    const usdValue = await auction.read.getHighestBidInUSD();
    // 2 ETH * $2000 = $4000
    assert.equal(usdValue, 4000n * 10n ** 8n);
  });

  await test("应该能够检查拍卖是否可以结束", async () => {
    const canEnd = await auction.read.canEnd();
    assert.equal(canEnd, false); // 时间未到
  });

  await test("应该返回正确的剩余时间", async () => {
    const remaining = await auction.read.timeRemaining();
    assert.ok(remaining > 0n);
  });

  // 测试手续费
  console.log("\n🧪 阶段 7: 手续费测试");
  console.log("-" .repeat(60));

  await test("应该返回默认手续费率", async () => {
    const feeRate = await factory.read.defaultFeeRate();
    assert.equal(feeRate, 250n); // 2.5%
  });

  await test("应该计算正确的动态费率 (低额)", async () => {
    const rate = await factory.read.calculateFeeRate([500n * 10n ** 8n]); // $500
    assert.equal(rate, 250n); // 2.5%
  });

  await test("应该计算正确的动态费率 (中额)", async () => {
    const rate = await factory.read.calculateFeeRate([5000n * 10n ** 8n]); // $5000
    assert.equal(rate, 200n); // 2%
  });

  await test("应该计算正确的动态费率 (高额)", async () => {
    const rate = await factory.read.calculateFeeRate([50000n * 10n ** 8n]); // $50000
    assert.equal(rate, 150n); // 1.5%
  });

  // 总结
  console.log("\n" + "=" .repeat(60));
  console.log("📊 测试结果统计");
  console.log("=" .repeat(60));
  console.log(`  ✅ 通过: ${passCount} 个测试`);
  console.log(`  ❌ 失败: ${failCount} 个测试`);
  console.log(`  📈 通过率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
  
  if (failCount === 0) {
    console.log("\n🎉 所有测试通过！系统完全正常！");
  } else {
    console.log("\n⚠️  部分测试失败，请检查错误信息");
  }
  
  console.log("=" .repeat(60));
}

main()
  .then(() => {
    if (failCount === 0) {
      console.log("\n✅ 测试完成");
      process.exit(0);
    } else {
      console.log("\n❌ 测试失败");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("\n❌ 测试执行出错:", error.message);
    process.exit(1);
  });

