/**
 * 本地测试网部署脚本
 * 用于快速部署和测试完整系统
 */
import { network } from "hardhat";
import { parseEther } from "viem";

async function main() {
  console.log("🚀 开始部署 NFT 拍卖系统到本地网络...\n");

  const { viem } = await network.connect();
  const [deployer, seller, bidder1, bidder2] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("部署账户:", deployer.account.address);
  console.log(
    "账户余额:",
    await publicClient.getBalance({ address: deployer.account.address }),
    "wei\n"
  );

  // 1. 部署 Mock Chainlink Aggregator
  console.log("📊 部署 Mock Chainlink Aggregator...");
  const mockAggregator = await viem.deployContract("MockAggregatorV3", [], {
    client: { wallet: deployer },
  });
  await mockAggregator.write.setLatestAnswer([2000n * 10n ** 8n], {
    account: deployer.account,
  });
  console.log("   ✅ MockAggregator:", mockAggregator.address);
  console.log("   📈 ETH 价格设置为: $2000\n");

  // 2. 部署 PriceConverter
  console.log("💱 部署 PriceConverter...");
  const priceConverter = await viem.deployContract(
    "PriceConverter",
    [mockAggregator.address],
    { client: { wallet: deployer } }
  );
  console.log("   ✅ PriceConverter:", priceConverter.address, "\n");

  // 3. 部署 NFT 合约
  console.log("🎨 部署 ERC721Collectible...");
  const nft = await viem.deployContract("ERC721Collectible", [], {
    client: { wallet: deployer },
  });
  await nft.write.initialize(["Auction NFT", "ANFT"], {
    account: deployer.account,
  });
  console.log("   ✅ NFT:", nft.address);
  console.log("   📛 名称: Auction NFT (ANFT)\n");

  // 4. 部署工厂合约
  console.log("🏭 部署 NftAuctionFactory...");
  const factory = await viem.deployContract("NftAuctionFactory", [], {
    client: { wallet: deployer },
  });
  await factory.write.initialize(
    [deployer.account.address, priceConverter.address, 250n],
    { account: deployer.account }
  );
  console.log("   ✅ Factory:", factory.address);
  console.log("   💰 默认手续费率: 2.5%\n");

  // 5. 部署测试 ERC20
  console.log("💵 部署测试 ERC20...");
  const mockToken = await viem.deployContract(
    "MockERC20",
    ["Test USDC", "TUSDC", 6],
    { client: { wallet: deployer } }
  );
  console.log("   ✅ MockERC20:", mockToken.address);

  // 配置 Token 价格 feed
  const tokenAggregator = await viem.deployContract("MockAggregatorV3", [], {
    client: { wallet: deployer },
  });
  await tokenAggregator.write.setLatestAnswer([1n * 10n ** 8n], {
    account: deployer.account,
  });
  await priceConverter.write.setTokenPriceFeed(
    [mockToken.address, tokenAggregator.address],
    { account: deployer.account }
  );
  console.log("   📈 Token 价格设置为: $1\n");

  // 6. Mint 测试 NFT
  console.log("🎁 Mint 测试 NFT...");
  await nft.write.mint([seller.account.address], {
    account: deployer.account,
  });
  await nft.write.mint([seller.account.address], {
    account: deployer.account,
  });
  console.log("   ✅ Minted Token #1 to:", seller.account.address);
  console.log("   ✅ Minted Token #2 to:", seller.account.address, "\n");

  // 7. 创建示例拍卖
  console.log("⚡ 创建示例 ETH 拍卖...");
  await nft.write.approve([factory.address, 1n], {
    account: seller.account,
  });

  const createTx = await factory.write.createAuction(
    [
      3600n, // 1 hour
      parseEther("0.1"), // 0.1 ETH
      nft.address,
      1n,
    ],
    { account: seller.account }
  );

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: createTx,
  });
  const auctionAddress = await factory.read.getAuctionAddress([0n]);

  console.log("   ✅ 拍卖已创建:", auctionAddress);
  console.log("   🏷️  NFT Token ID: 1");
  console.log("   💎 起拍价: 0.1 ETH");
  console.log("   ⏰ 持续时间: 1 hour\n");

  // 8. 模拟出价
  console.log("🎯 模拟出价...");
  const auction = await viem.getContractAt("Auction", auctionAddress);

  await auction.write.bid({
    value: parseEther("0.15"),
    account: bidder1.account,
  });
  console.log("   ✅ Bidder1 出价: 0.15 ETH");

  await auction.write.bid({
    value: parseEther("0.2"),
    account: bidder2.account,
  });
  console.log("   ✅ Bidder2 出价: 0.2 ETH\n");

  const info = await auction.read.auctionInfo();
  console.log("📊 当前拍卖状态:");
  console.log("   最高出价者:", info[8]);
  console.log("   最高出价:", info[7], "wei");

  const usdValue = await auction.read.getHighestBidInUSD();
  console.log("   USD 价值: $", Number(usdValue) / 10 ** 8, "\n");

  // 9. 打印部署摘要
  console.log("=" .repeat(60));
  console.log("✨ 部署完成！\n");
  console.log("📝 合约地址汇总:");
  console.log("   MockAggregator:  ", mockAggregator.address);
  console.log("   PriceConverter:  ", priceConverter.address);
  console.log("   NFT Contract:    ", nft.address);
  console.log("   Factory:         ", factory.address);
  console.log("   MockERC20:       ", mockToken.address);
  console.log("   Auction #1:      ", auctionAddress);
  console.log("\n🎮 测试账户:");
  console.log("   Deployer:        ", deployer.account.address);
  console.log("   Seller:          ", seller.account.address);
  console.log("   Bidder1:         ", bidder1.account.address);
  console.log("   Bidder2:         ", bidder2.account.address);
  console.log("=" .repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });

