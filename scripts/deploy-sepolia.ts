/**
 * Sepolia 测试网部署脚本
 */
import { network } from "hardhat";

async function main() {
  console.log("🚀 开始部署 NFT 拍卖系统到 Sepolia 测试网...\n");

  const { viem } = await network.connect({ network: "sepolia" });
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("部署账户:", deployer.account.address);
  console.log(
    "账户余额:",
    await publicClient.getBalance({ address: deployer.account.address }),
    "wei\n"
  );

  // Sepolia Chainlink Price Feeds
  const SEPOLIA_ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  // 1. 部署 PriceConverter
  console.log("💱 部署 PriceConverter...");
  const priceConverter = await viem.deployContract(
    "PriceConverter",
    [SEPOLIA_ETH_USD_FEED],
    { client: { wallet: deployer } }
  );
  console.log("   ✅ PriceConverter:", priceConverter.address, "\n");

  // 2. 部署 NFT 合约
  console.log("🎨 部署 ERC721Collectible...");
  const nft = await viem.deployContract("ERC721Collectible", [], {
    client: { wallet: deployer },
  });
  await nft.write.initialize(["Sepolia Auction NFT", "SANFT"], {
    account: deployer.account,
  });
  console.log("   ✅ NFT:", nft.address, "\n");

  // 3. 部署工厂合约
  console.log("🏭 部署 NftAuctionFactory...");
  const factory = await viem.deployContract("NftAuctionFactory", [], {
    client: { wallet: deployer },
  });
  await factory.write.initialize(
    [deployer.account.address, priceConverter.address, 250n],
    { account: deployer.account }
  );
  console.log("   ✅ Factory:", factory.address, "\n");

  console.log("=" .repeat(60));
  console.log("✨ 部署完成！\n");
  console.log("📝 合约地址:");
  console.log("   PriceConverter:  ", priceConverter.address);
  console.log("   NFT Contract:    ", nft.address);
  console.log("   Factory:         ", factory.address);
  console.log("\n🔗 在 Etherscan 验证:");
  console.log(`   https://sepolia.etherscan.io/address/${factory.address}`);
  console.log("=" .repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });

