/**
 * 测试网/主网部署脚本
 * 使用 Chainlink 真实的价格预言机
 * 
 * 运行方式：
 * npx hardhat run scripts/deploy-testnet.ts --network sepolia
 */
import hre from "hardhat";
import { parseEther, encodeFunctionData } from "viem";

// Chainlink ETH/USD 价格预言机地址
const CHAINLINK_PRICE_FEEDS: Record<string, string> = {
  // 主网
  mainnet: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  // 测试网
  sepolia: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
  arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  optimism: "0x13e3Ee699D1909E989722E753853AE30b17e08c5",
  polygon: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
  bsc: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
};

async function main() {
  const networkName = hre.network.name;
  console.log("=" .repeat(70));
  console.log(`🚀 开始部署到 ${networkName}...`);
  console.log("=" .repeat(70) + "\n");

  // 检查网络是否支持
  if (!CHAINLINK_PRICE_FEEDS[networkName]) {
    throw new Error(`不支持的网络: ${networkName}。请使用 sepolia, mainnet, arbitrum 等。`);
  }

  const network = await hre.network.connect();
  const viem = network.viem;
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  console.log("📋 部署信息:");
  console.log("   网络:", networkName);
  console.log("   部署者:", deployer.account.address);
  
  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log("   余额:", Number(balance) / 10 ** 18, "ETH\n");

  // 1. 使用 Chainlink 真实预言机
  const priceFeedAddress = CHAINLINK_PRICE_FEEDS[networkName];
  console.log("1️⃣  配置 Chainlink 价格预言机...");
  console.log("   ✅ ETH/USD 预言机地址:", priceFeedAddress);

  // 读取当前真实价格
  const priceFeed = await viem.getContractAt("AggregatorV3Interface", priceFeedAddress);
  const roundData = await priceFeed.read.latestRoundData();
  const currentPrice = roundData[1];
  console.log("   ✅ 当前 ETH 真实价格: $" + (Number(currentPrice) / 10 ** 8).toFixed(2) + "\n");

  // 2. 部署 PriceConverter
  console.log("2️⃣  部署 PriceConverter...");
  const priceConverter = await viem.deployContract(
    "PriceConverter",
    [priceFeedAddress], // 使用真实的 Chainlink 预言机地址
    { client: { wallet: deployer } }
  );
  console.log("   ✅ PriceConverter 地址:", priceConverter.address);
  
  // 验证价格查询
  const ethPrice = await priceConverter.read.getEthPrice();
  console.log("   ✅ 验证价格查询: $" + (Number(ethPrice) / 10 ** 8).toFixed(2) + "\n");

  // 3. 部署 NFT 合约（UUPS 代理）
  console.log("3️⃣  部署 ERC721Collectible (UUPS)...");
  const nftImplementation = await viem.deployContract("ERC721Collectible", [], {
    client: { wallet: deployer },
  });
  console.log("   ✅ NFT 实现合约:", nftImplementation.address);

  const nftInitData = encodeFunctionData({
    abi: nftImplementation.abi,
    functionName: "initialize",
    args: ["NFT Auction Collection", "NFTAC"],
  });

  const nftProxy = await viem.deployContract(
    "UUPSProxy",
    [nftImplementation.address, nftInitData],
    { client: { wallet: deployer } }
  );
  console.log("   ✅ NFT 代理合约:", nftProxy.address + "\n");

  // 4. 部署 Factory 合约（UUPS 代理）
  console.log("4️⃣  部署 NftAuctionFactory (UUPS)...");
  const factoryImplementation = await viem.deployContract("NftAuctionFactory", [], {
    client: { wallet: deployer },
  });
  console.log("   ✅ Factory 实现合约:", factoryImplementation.address);

  const factoryInitData = encodeFunctionData({
    abi: factoryImplementation.abi,
    functionName: "initialize",
    args: [deployer.account.address, priceConverter.address, 250n], // 2.5% 手续费
  });

  const factoryProxy = await viem.deployContract(
    "UUPSProxy",
    [factoryImplementation.address, factoryInitData],
    { client: { wallet: deployer } }
  );
  console.log("   ✅ Factory 代理合约:", factoryProxy.address);
  console.log("   ✅ 默认手续费率: 2.5%\n");

  // 5. 部署总结
  console.log("=" .repeat(70));
  console.log("🎉 部署完成！");
  console.log("=" .repeat(70));
  console.log("\n📝 部署地址汇总:");
  console.log("   网络:", networkName);
  console.log("   Chainlink ETH/USD Feed:", priceFeedAddress);
  console.log("   PriceConverter:", priceConverter.address);
  console.log("   NFT 实现:", nftImplementation.address);
  console.log("   NFT 代理:", nftProxy.address);
  console.log("   Factory 实现:", factoryImplementation.address);
  console.log("   Factory 代理:", factoryProxy.address);
  
  console.log("\n🔗 下一步:");
  console.log("   1. 在区块浏览器验证合约");
  console.log("   2. 配置前端使用上述合约地址");
  console.log("   3. 测试创建拍卖功能");
  console.log("\n💡 验证合约命令:");
  console.log(`   npx hardhat verify --network ${networkName} ${priceConverter.address} ${priceFeedAddress}`);
  console.log("\n" + "=" .repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:", error);
    process.exit(1);
  });

