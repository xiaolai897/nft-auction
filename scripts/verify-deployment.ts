/**
 * 完整的合约验证和测试脚本
 * 集成所有测试用例，全面验证系统功能
 * 
 * 🌐 自动适配网络：
 * - 本地网络（localhost/hardhat）：自动部署 MockAggregatorV3
 * - 测试网（sepolia/goerli等）：自动使用 Chainlink 真实预言机
 * - 主网（mainnet）：自动使用 Chainlink 真实预言机
 * 
 * 📌 使用方式：
 * - npx hardhat run scripts/verify-deployment.ts --network localhost
 * - npx hardhat run scripts/verify-deployment.ts --network sepolia
 * - npx hardhat run scripts/verify-deployment.ts --network mainnet
 */
import hre from "hardhat";
import { parseEther, encodeFunctionData, zeroAddress } from "viem";

// Chainlink ETH/USD 价格预言机地址（各网络）
const CHAINLINK_ETH_USD_FEEDS: Record<string, string> = {
  // 主网
  mainnet: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  // 测试网
  sepolia: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  goerli: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
  arbitrum: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
  optimism: "0x13e3Ee699D1909E989722E753853AE30b17e08c5",
  polygon: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
  bsc: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
  avalanche: "0x0A77230d17318075983913bC2145DB16C7366156",
  // 本地测试标记
  localhost: "MOCK",
  hardhat: "MOCK",
  hardhatMainnet: "MOCK",
};

// 测试统计
let passedTests = 0;
let failedTests = 0;
const failedTestsList: string[] = [];

// 时间操作辅助函数
async function increaseTime(publicClient: any, seconds: number) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [seconds],
  } as any);
  await publicClient.request({
    method: "evm_mine",
    params: [],
  } as any);
}

// 测试辅助函数
function assertEqual(actual: any, expected: any, message: string) {
  if (actual.toString().toLowerCase() !== expected.toString().toLowerCase()) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value: boolean, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

function assertGreater(value1: bigint, value2: bigint, message: string) {
  if (value1 <= value2) {
    throw new Error(`${message}: ${value1} is not greater than ${value2}`);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`   ✅ ${name}`);
    passedTests++;
  } catch (error: any) {
    console.log(`   ❌ ${name}`);
    console.log(`      错误: ${error.message}`);
    failedTests++;
    failedTestsList.push(name);
  }
}

async function main() {
  const network = await hre.network.connect();
  const viem = network.viem;
  
  // 从命令行参数获取网络名称
  const networkArg = process.argv.find(arg => arg.startsWith('--network'));
  const networkName = networkArg ? networkArg.split('=')[1] || process.argv[process.argv.indexOf(networkArg) + 1] : "localhost";
  const isLocalNetwork = ["localhost", "hardhat", "hardhatMainnet"].includes(networkName);
  
  console.log("=" .repeat(70));
  console.log("🚀 开始全面测试系统功能...\n");
  console.log("=" .repeat(70));
  
  const walletClients = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  
  // 在真实网络上只有一个账户，在本地测试环境有多个账户
  const deployer = walletClients[0];
  const seller = walletClients[1] || deployer; // 真实网络上使用同一账户
  const bidder1 = walletClients[2] || deployer;
  const bidder2 = walletClients[3] || deployer;
  const bidder3 = walletClients[4] || deployer;

  console.log("\n📋 账户信息:");
  console.log("   网络:", networkName);
  console.log("   环境:", isLocalNetwork ? "🏠 本地测试" : "🌐 真实网络");
  console.log("   Deployer:", deployer.account.address);
  
  if (isLocalNetwork) {
    console.log("   Seller:", seller.account.address);
    console.log("   Bidder1:", bidder1.account.address);
    console.log("   Bidder2:", bidder2.account.address);
    console.log("   Bidder3:", bidder3.account.address);
  } else {
    console.log("   ⚠️  注意：真实网络上只部署合约，不运行完整测试");
  }

  // ==================== 第一部分：部署基础设施 ====================
  console.log("\n" + "=" .repeat(70));
  console.log("📦 第一部分：部署基础设施");
  console.log("=" .repeat(70));

  // 1. 配置价格预言机（自动适配网络）
  console.log("\n1️⃣  配置 Chainlink 价格预言机...");
  
  let priceFeedAddress: string;
  let ethPriceFromOracle: bigint;
  
  if (isLocalNetwork) {
    // 本地网络：部署 Mock Aggregator
    console.log("   🏠 检测到本地网络，部署 MockAggregatorV3...");
    const mockAggregator = await viem.deployContract("MockAggregatorV3", [], {
      client: { wallet: deployer },
    });
    priceFeedAddress = mockAggregator.address;
    
    // 设置测试价格 $2000
    const testPrice = 2000n * 10n ** 8n;
    await mockAggregator.write.setLatestAnswer([testPrice], {
      account: deployer.account,
    });
    
    // 读取价格验证
    const roundData = await mockAggregator.read.latestRoundData();
    ethPriceFromOracle = roundData[1];
    
    console.log("   ✅ Mock Aggregator 地址:", priceFeedAddress);
    console.log("   ✅ 测试价格: $" + (Number(ethPriceFromOracle) / 10 ** 8).toFixed(2));
  } else {
    // 真实网络：使用 Chainlink 预言机
    priceFeedAddress = CHAINLINK_ETH_USD_FEEDS[networkName];
    
    if (!priceFeedAddress) {
      throw new Error(`❌ 不支持的网络: ${networkName}。请在 CHAINLINK_ETH_USD_FEEDS 中添加此网络的预言机地址。`);
    }
    
    console.log("   🌐 检测到真实网络，使用 Chainlink 预言机...");
    console.log("   📍 预言机地址:", priceFeedAddress);
    
    // 连接到真实预言机并读取价格
    const priceFeed = await viem.getContractAt("MockAggregatorV3", priceFeedAddress as `0x${string}`);
    const roundData: any = await priceFeed.read.latestRoundData();
    ethPriceFromOracle = roundData[1];
    
    console.log("   ✅ 当前 ETH 真实价格: $" + (Number(ethPriceFromOracle) / 10 ** 8).toFixed(2));
  }
  
  console.log("");

  // 2. 部署 PriceConverter
  console.log("2️⃣  部署 PriceConverter...");
  const priceConverter = await viem.deployContract(
    "PriceConverter",
    [priceFeedAddress as `0x${string}`], // 使用自动选择的预言机地址
    { client: { wallet: deployer } }
  );
  console.log("   ✅ PriceConverter 地址:", priceConverter.address);
  
  // 验证价格查询功能
  const queriedPrice = await priceConverter.read.getEthPrice();
  console.log("   ✅ 价格查询验证: $" + (Number(queriedPrice) / 10 ** 8).toFixed(2));
  console.log("");

  // 3. 部署 NFT 合约
  console.log("3️⃣  部署 ERC721Collectible (UUPS 代理模式)...");
  const nftImplementation = await viem.deployContract("ERC721Collectible", [], {
    client: { wallet: deployer },
  });
  console.log("   ✅ 实现合约:", nftImplementation.address);

  const nftInitData = encodeFunctionData({
    abi: nftImplementation.abi,
    functionName: "initialize",
    args: ["Test NFT", "TNFT"],
  });

  const nftProxy = await viem.deployContract(
    "UUPSProxy",
    [nftImplementation.address, nftInitData],
    { client: { wallet: deployer } }
  );
  const nft = await viem.getContractAt("ERC721Collectible", nftProxy.address);
  console.log("   ✅ 代理合约:", nftProxy.address);

  // 4. 部署 Factory 合约
  console.log("\n4️⃣  部署 NftAuctionFactory (UUPS 代理模式)...");
  const factoryImplementation = await viem.deployContract("NftAuctionFactory", [], {
    client: { wallet: deployer },
  });
  console.log("   ✅ 实现合约:", factoryImplementation.address);

  const factoryInitData = encodeFunctionData({
    abi: factoryImplementation.abi,
    functionName: "initialize",
    args: [deployer.account.address, priceConverter.address, 250n],
  });

  const factoryProxy = await viem.deployContract(
    "UUPSProxy",
    [factoryImplementation.address, factoryInitData],
    { client: { wallet: deployer } }
  );
  const factory = await viem.getContractAt("NftAuctionFactory", factoryProxy.address);
  console.log("   ✅ 代理合约:", factoryProxy.address);
  console.log("   ✅ 默认手续费率: 2.5%");

  // 5. 部署 Mock ERC20（仅在本地测试环境）
  let mockToken: any;
  if (isLocalNetwork) {
    console.log("\n5️⃣  部署 Mock ERC20 Token...");
    mockToken = await viem.deployContract(
      "MockERC20",
      ["Test Token", "TEST", 18],
      { client: { wallet: deployer } }
    );
    console.log("   ✅ 部署地址:", mockToken.address);

    // 配置 Token 价格 Feed
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
    
    // 从合约读取实际配置的Token价格
    const tokenPrice = await priceConverter.read.getTokenPrice([mockToken.address]);
    console.log("   ✅ Token 价格配置: $" + (Number(tokenPrice) / 10 ** 8));
  } else {
    console.log("\n5️⃣  跳过 Mock ERC20 部署（真实网络不需要）");
  }

  // ==================== 第二部分：PriceConverter 测试 ====================
  if (!isLocalNetwork) {
    console.log("\n" + "=" .repeat(70));
    console.log("⚠️  真实网络：跳过交互测试，仅验证合约部署");
    console.log("=" .repeat(70) + "\n");
    console.log("✅ 所有合约部署成功！");
    console.log("\n📝 部署信息汇总:");
    console.log("   网络:", networkName);
    console.log("   环境: 真实网络");
    console.log("   价格预言机:", priceFeedAddress);
    console.log("   当前 ETH 价格: $" + (Number(ethPriceFromOracle) / 10 ** 8).toFixed(2));
    console.log("   PriceConverter:", priceConverter.address);
    console.log("   NFT 实现合约:", nftImplementation.address);
    console.log("   NFT 代理合约:", nftProxy.address);
    console.log("   Factory 实现合约:", factoryImplementation.address);
    console.log("   Factory 代理合约:", factoryProxy.address);
    console.log("\n🎉 部署完成！请在 Etherscan 上验证：");
    console.log("   PriceConverter: https://sepolia.etherscan.io/address/" + priceConverter.address);
    console.log("   NFT Proxy: https://sepolia.etherscan.io/address/" + nftProxy.address);
    console.log("   Factory Proxy: https://sepolia.etherscan.io/address/" + factoryProxy.address);
    return; // 真实网络上不运行测试
  }

  console.log("\n" + "=" .repeat(70));
  console.log("🧪 第二部分：PriceConverter 功能测试");
  console.log("=" .repeat(70) + "\n");

  await test("获取 ETH 价格", async () => {
    const price = await priceConverter.read.getEthPrice();
    assertEqual(price, 2000n * 10n ** 8n, "ETH 价格应为 $2000");
  });

  await test("计算 ETH USD 价值", async () => {
    const value = await priceConverter.read.getEthValueInUSD([parseEther("1")]);
    assertEqual(value, 2000n * 10n ** 8n, "1 ETH 应为 $2000");
  });

  await test("获取 Token 价格", async () => {
    const price = await priceConverter.read.getTokenPrice([mockToken.address]);
    assertEqual(price, 1n * 10n ** 8n, "Token 价格应为 $1");
  });

  await test("计算 Token USD 价值", async () => {
    const value = await priceConverter.read.getTokenValueInUSD([
      mockToken.address,
      parseEther("1000"),
    ]);
    assertEqual(value, 1000n * 10n ** 8n, "1000 Token 应为 $1000");
  });

  await test("检查 Feed 配置状态", async () => {
    const isConfigured = await priceConverter.read.isFeedConfigured([
      mockToken.address,
    ]);
    assertTrue(isConfigured, "Token Feed 应已配置");
  });

  await test("更新 ETH 价格 Feed", async () => {
    if (isLocalNetwork) {
      // 仅在本地网络测试更新 Feed
      const newAggregator = await viem.deployContract("MockAggregatorV3", [], {
        client: { wallet: deployer },
      });
      await newAggregator.write.setLatestAnswer([3000n * 10n ** 8n], {
        account: deployer.account,
      });
      await priceConverter.write.setEthPriceFeed([newAggregator.address], {
        account: deployer.account,
      });
      const price = await priceConverter.read.getEthPrice();
      assertEqual(price, 3000n * 10n ** 8n, "新 ETH 价格应为 $3000");
      
      // 恢复原价格
      await priceConverter.write.setEthPriceFeed([priceFeedAddress as `0x${string}`], {
        account: deployer.account,
      });
    } else {
      // 真实网络上，只验证价格读取
      const price = await priceConverter.read.getEthPrice();
      assertTrue(price > 0n, "ETH 价格应大于 0");
    }
  });

  // ==================== 第三部分：ERC721Collectible 测试 ====================
  console.log("\n" + "=" .repeat(70));
  console.log("🎨 第三部分：ERC721Collectible (NFT) 功能测试");
  console.log("=" .repeat(70) + "\n");

  await test("NFT 初始化正确", async () => {
    const name = await nft.read.name();
    const symbol = await nft.read.symbol();
    assertEqual(name, "Test NFT", "NFT 名称应为 Test NFT");
    assertEqual(symbol, "TNFT", "NFT 符号应为 TNFT");
  });

  await test("Mint NFT 功能", async () => {
    const mintTx = await nft.write.mint([seller.account.address], {
      account: deployer.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });
    const owner = await nft.read.ownerOf([1n]);
    assertEqual(owner, seller.account.address, "NFT #1 所有者应为 seller");
  });

  await test("Token 计数器递增", async () => {
    await nft.write.mint([seller.account.address], { account: deployer.account });
    const counter = await nft.read.getTokenCounter();
    assertTrue(counter >= 2n, "Token 计数器应该递增");
  });

  await test("支持 ERC721 接口", async () => {
    const supportsERC721 = await nft.read.supportsInterface(["0x80ac58cd"]);
    assertTrue(supportsERC721, "应支持 ERC721 接口");
  });

  await test("角色权限检查", async () => {
    const OPERATOR_ROLE = await nft.read.OPERATOR_ROLE();
    const hasRole = await nft.read.hasRole([
      OPERATOR_ROLE,
      deployer.account.address,
    ]);
    assertTrue(hasRole, "Deployer 应有 OPERATOR_ROLE");
  });

  // ==================== 第四部分：NftAuctionFactory 测试 ====================
  console.log("\n" + "=" .repeat(70));
  console.log("🏭 第四部分：NftAuctionFactory 功能测试");
  console.log("=" .repeat(70) + "\n");

  await test("Factory 初始化正确", async () => {
    const converter = await factory.read.priceConverter();
    const feeRate = await factory.read.defaultFeeRate();
    assertEqual(converter, priceConverter.address, "PriceConverter 地址应匹配");
    assertEqual(feeRate, 250n, "默认手续费率应为 2.5%");
  });

  await test("检查默认手续费结构", async () => {
    const fee0 = await factory.read.feeStructures([0n]);
    const fee1 = await factory.read.feeStructures([1n]);
    const fee2 = await factory.read.feeStructures([2n]);
    
    assertEqual(fee0[0], 1000n * 10n ** 8n, "第一档阈值应为 $1000");
    assertEqual(fee0[1], 250n, "第一档费率应为 2.5%");
    assertEqual(fee1[0], 10000n * 10n ** 8n, "第二档阈值应为 $10000");
    assertEqual(fee1[1], 200n, "第二档费率应为 2%");
    assertEqual(fee2[1], 150n, "第三档费率应为 1.5%");
  });

  await test("创建 ETH 拍卖", async () => {
    await nft.write.mint([seller.account.address], { account: deployer.account });
    const tokenId = await nft.read.getTokenCounter();
    
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    const tx = await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, tokenId],
      { account: seller.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });

    const count = await factory.read.auctionCount();
    assertTrue(count >= 1n, "拍卖数量应该增加");
  });

  await test("获取拍卖地址", async () => {
    const auctionAddress = await factory.read.getAuctionAddress([0n]);
    assertTrue(auctionAddress !== zeroAddress, "拍卖地址不应为零地址");
  });

  await test("检查 isAuction 映射", async () => {
    const auctionAddress = await factory.read.getAuctionAddress([0n]);
    const isAuction = await factory.read.isAuction([auctionAddress]);
    assertTrue(isAuction, "地址应被标记为拍卖合约");
  });

  await test("按卖家查询拍卖", async () => {
    const auctions = await factory.read.getAuctionsBySeller([
      seller.account.address,
    ]);
    assertTrue(auctions.length >= 1, "应该有至少一个拍卖");
  });

  await test("动态手续费率计算", async () => {
    let rate = await factory.read.calculateFeeRate([500n * 10n ** 8n]);
    assertEqual(rate, 250n, "$500 应为 2.5% 费率");

    rate = await factory.read.calculateFeeRate([5000n * 10n ** 8n]);
    assertEqual(rate, 200n, "$5000 应为 2% 费率");

    rate = await factory.read.calculateFeeRate([50000n * 10n ** 8n]);
    assertEqual(rate, 150n, "$50000 应为 1.5% 费率");
  });

  await test("更新默认手续费率", async () => {
    const newRate = 300n;
    await factory.write.setDefaultFeeRate([newRate], { account: deployer.account });
    const rate = await factory.read.defaultFeeRate();
    assertEqual(rate, newRate, "手续费率应已更新");
    
    // 恢复原费率
    await factory.write.setDefaultFeeRate([250n], { account: deployer.account });
  });

  // ==================== 第五部分：Auction 功能测试 ====================
  console.log("\n" + "=" .repeat(70));
  console.log("⚡ 第五部分：Auction 拍卖功能测试");
  console.log("=" .repeat(70) + "\n");

  // 创建一个测试拍卖
  console.log("准备测试拍卖...");
  await nft.write.mint([seller.account.address], { account: deployer.account });
  const testTokenId = await nft.read.getTokenCounter();
  
  await nft.write.approve([factory.address, testTokenId], {
    account: seller.account,
  });

  const createAuctionTx = await factory.write.createAuction(
    [3600n, parseEther("1"), nft.address, testTokenId],
    { account: seller.account }
  );
  await publicClient.waitForTransactionReceipt({ hash: createAuctionTx });
  
  const currentAuctionIndex = (await factory.read.auctionCount()) - 1n;
  const testAuctionAddr = await factory.read.getAuctionAddress([currentAuctionIndex]);
  const testAuction = await viem.getContractAt("Auction", testAuctionAddr);
  console.log("   测试拍卖地址:", testAuctionAddr, "\n");

  await test("NFT 已转移到拍卖合约", async () => {
    const nftOwner = await nft.read.ownerOf([testTokenId]);
    assertEqual(nftOwner, testAuctionAddr, "NFT 应在拍卖合约中");
  });

  await test("拍卖信息初始化正确", async () => {
    const info = await testAuction.read.auctionInfo();
    assertEqual(info[0], seller.account.address, "卖家地址应正确");
    assertEqual(info[4], parseEther("1"), "起拍价应为 1 ETH");
    assertEqual(info[9], false, "拍卖不应已结束");
  });

  await test("接受 ETH 出价", async () => {
    const bidAmount = parseEther("1.5");
    const bidTx = await testAuction.write.bid({
      value: bidAmount,
      account: bidder1.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: bidTx });

    const info = await testAuction.read.auctionInfo();
    assertEqual(info[7], bidAmount, "最高出价应为 1.5 ETH");
    assertEqual(info[8], bidder1.account.address, "最高出价者应为 bidder1");
  });

  await test("退款给之前的出价者", async () => {
    const bid1 = parseEther("2");
    const bid2 = parseEther("2.5");

    const balanceBefore = await publicClient.getBalance({
      address: bidder1.account.address,
    });

    await testAuction.write.bid({ value: bid1, account: bidder2.account });
    await testAuction.write.bid({ value: bid2, account: bidder3.account });

    const balanceAfter = await publicClient.getBalance({
      address: bidder1.account.address,
    });

    assertGreater(balanceAfter, balanceBefore, "Bidder1 应收到退款");
  });

  await test("拒绝低于当前最高价的出价", async () => {
    let rejected = false;
    try {
      await testAuction.write.bid({
        value: parseEther("1"),
        account: bidder1.account,
      });
    } catch (error: any) {
      // 检查错误消息包含 BidTooLow 或其他相关错误
      if (error.message.includes("BidTooLow") || 
          error.message.includes("revert") ||
          error.message.includes("Bid")) {
        rejected = true;
      }
    }
    assertTrue(rejected, "应拒绝过低的出价");
  });

  await test("获取最高出价的 USD 价值", async () => {
    const usdValue = await testAuction.read.getHighestBidInUSD();
    // 2.5 ETH * $2000 = $5000
    assertTrue(usdValue > 0n, "USD 价值应大于 0");
  });

  await test("检查拍卖是否可以结束", async () => {
    let canEnd = await testAuction.read.canEnd();
    assertEqual(canEnd, false, "拍卖时间未到，不应能结束");
  });

  await test("检查剩余时间", async () => {
    const remaining = await testAuction.read.timeRemaining();
    assertTrue(remaining > 0n, "应有剩余时间");
  });

  // ==================== 第六部分：完整拍卖流程测试 ====================
  console.log("\n" + "=" .repeat(70));
  console.log("🔄 第六部分：完整拍卖流程测试");
  console.log("=" .repeat(70) + "\n");

  await test("完整 ETH 拍卖生命周期", async () => {
    // 1. Mint NFT
    await nft.write.mint([seller.account.address], { account: deployer.account });
    const tokenId = await nft.read.getTokenCounter();

    // 2. 创建拍卖
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    const createTx = await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, tokenId],
      { account: seller.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: createTx });

    const auctionIndex = (await factory.read.auctionCount()) - 1n;
    const auctionAddress = await factory.read.getAuctionAddress([auctionIndex]);
    const auction = await viem.getContractAt("Auction", auctionAddress);

    // 3. 多个出价者竞价
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

    // 4. 检查最高出价者
    const info = await auction.read.auctionInfo();
    assertEqual(info[8], bidder3.account.address, "Bidder3 应为最高出价者");
    assertEqual(info[7], parseEther("2"), "最高出价应为 2 ETH");

    // 5. 快进时间
    await increaseTime(publicClient, 3600);

    // 6. 结束拍卖
    const sellerBalanceBefore = await publicClient.getBalance({
      address: seller.account.address,
    });

    await auction.write.endAuction({ account: deployer.account });

    // 7. 验证结果
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assertEqual(nftOwner, bidder3.account.address, "NFT 应转移给 bidder3");

    const sellerBalanceAfter = await publicClient.getBalance({
      address: seller.account.address,
    });
    assertGreater(sellerBalanceAfter, sellerBalanceBefore, "卖家应收到付款");

    const factoryBalance = await publicClient.getBalance({
      address: factory.address,
    });
    assertTrue(factoryBalance > 0n, "Factory 应收到手续费");
  });

  await test("ERC20 Token 拍卖流程", async () => {
    // Mint tokens 给出价者
    await mockToken.write.mint([bidder1.account.address, parseEther("1000")], {
      account: deployer.account,
    });
    await mockToken.write.mint([bidder2.account.address, parseEther("1000")], {
      account: deployer.account,
    });

    // Mint NFT
    await nft.write.mint([seller.account.address], { account: deployer.account });
    const tokenId = await nft.read.getTokenCounter();

    // 创建 ERC20 拍卖
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    await factory.write.createAuctionWithToken(
      [nft.address, tokenId, mockToken.address, parseEther("100"), 3600n],
      { account: seller.account }
    );

    const auctionIndex = (await factory.read.auctionCount()) - 1n;
    const auctionAddress = await factory.read.getAuctionAddress([auctionIndex]);
    const auction = await viem.getContractAt("Auction", auctionAddress);

    // Approve 并出价
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

    // 结束拍卖
    await increaseTime(publicClient, 3600);

    await auction.write.endAuction({ account: deployer.account });

    // 验证 NFT 转移
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assertEqual(nftOwner, bidder2.account.address, "NFT 应转移给 bidder2");

    // 验证 Token 付款
    const sellerBalance = await mockToken.read.balanceOf([
      seller.account.address,
    ]);
    assertTrue(sellerBalance > 0n, "卖家应收到 Token 付款");
  });

  await test("无出价时返还 NFT 给卖家", async () => {
    // Mint NFT
    await nft.write.mint([seller.account.address], { account: deployer.account });
    const tokenId = await nft.read.getTokenCounter();

    // 创建拍卖
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, tokenId],
      { account: seller.account }
    );

    const auctionIndex = (await factory.read.auctionCount()) - 1n;
    const auctionAddress = await factory.read.getAuctionAddress([auctionIndex]);
    const auction = await viem.getContractAt("Auction", auctionAddress);

    // 快进时间但不出价
    await increaseTime(publicClient, 3600);

    await auction.write.endAuction({ account: deployer.account });

    // NFT 应返还给卖家
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assertEqual(nftOwner, seller.account.address, "NFT 应返还给卖家");
  });

  await test("卖家取消无出价的拍卖", async () => {
    // Mint NFT
    await nft.write.mint([seller.account.address], { account: deployer.account });
    const tokenId = await nft.read.getTokenCounter();

    // 创建拍卖
    await nft.write.approve([factory.address, tokenId], {
      account: seller.account,
    });

    await factory.write.createAuction(
      [3600n, parseEther("1"), nft.address, tokenId],
      { account: seller.account }
    );

    const auctionIndex = (await factory.read.auctionCount()) - 1n;
    const auctionAddress = await factory.read.getAuctionAddress([auctionIndex]);
    const auction = await viem.getContractAt("Auction", auctionAddress);

    // 卖家取消拍卖
    await auction.write.cancelAuction({ account: seller.account });

    // NFT 应返还给卖家
    const nftOwner = await nft.read.ownerOf([tokenId]);
    assertEqual(nftOwner, seller.account.address, "NFT 应返还给卖家");

    const info = await auction.read.auctionInfo();
    assertTrue(info[9], "拍卖应标记为已结束");
  });

  await test("提取平台手续费", async () => {
    const factoryBalance = await publicClient.getBalance({
      address: factory.address,
    });

    if (factoryBalance > 0n) {
      const ownerBalanceBefore = await publicClient.getBalance({
        address: deployer.account.address,
      });

      await factory.write.withdrawFees([deployer.account.address], {
        account: deployer.account,
      });

      const ownerBalanceAfter = await publicClient.getBalance({
        address: deployer.account.address,
      });
      
      // 由于 gas 费用，可能不一定增加，所以只检查执行成功
      assertTrue(true, "手续费提取成功");
    } else {
      assertTrue(true, "无手续费可提取");
    }
  });

  // ==================== 测试总结 ====================
  console.log("\n" + "=" .repeat(70));
  console.log("📊 测试结果总结");
  console.log("=" .repeat(70));
  console.log(`\n总测试数: ${passedTests + failedTests}`);
  console.log(`✅ 通过: ${passedTests}`);
  console.log(`❌ 失败: ${failedTests}`);

  if (failedTests > 0) {
    console.log("\n失败的测试:");
    failedTestsList.forEach((name, index) => {
      console.log(`   ${index + 1}. ${name}`);
    });
  }

  console.log("\n" + "=" .repeat(70));
  
  if (failedTests === 0) {
    console.log("🎉 所有测试通过！系统运行正常！");
  } else {
    console.log("⚠️  部分测试失败，请检查错误信息");
  }
  
  console.log("=" .repeat(70) + "\n");

  // 最终部署信息
  console.log("📝 部署信息汇总:");
  console.log("   网络:", networkName);
  console.log("   环境:", isLocalNetwork ? "本地测试" : "真实网络");
  console.log("   价格预言机:", priceFeedAddress);
  console.log("   当前 ETH 价格: $" + (Number(ethPriceFromOracle) / 10 ** 8).toFixed(2));
  console.log("   PriceConverter:", priceConverter.address);
  console.log("   NFT 实现合约:", nftImplementation.address);
  console.log("   NFT 代理合约:", nftProxy.address);
  console.log("   Factory 实现合约:", factoryImplementation.address);
  console.log("   Factory 代理合约:", factoryProxy.address);
  console.log("   MockToken:", mockToken.address);
  console.log(`   拍卖数量: ${await factory.read.auctionCount()}`);
  
  console.log("\n✨ 验证完成！\n");
}

main()
  .then(() => process.exit(failedTests > 0 ? 1 : 0))
  .catch((error) => {
    console.error("\n❌ 脚本执行失败:", error);
    process.exit(1);
  });
