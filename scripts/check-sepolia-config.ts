/**
 * Sepolia 配置检查脚本
 * 在部署前运行此脚本检查配置是否正确
 */
import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("=" .repeat(60));
  console.log("🔍 Sepolia 部署配置检查");
  console.log("=" .repeat(60) + "\n");

  // 1. 检查环境变量
  console.log("1️⃣  检查环境变量...");
  const hasPrivateKey = !!process.env.PRIVATE_KEY;
  const hasRpcUrl = !!process.env.SEPOLIA_RPC_URL;
  
  console.log("   PRIVATE_KEY:", hasPrivateKey ? "✅ 已配置" : "❌ 未配置");
  console.log("   SEPOLIA_RPC_URL:", hasRpcUrl ? "✅ 已配置" : "⚠️  使用默认 RPC");
  
  if (!hasPrivateKey) {
    console.log("\n❌ 错误：未找到 PRIVATE_KEY");
    console.log("\n请按以下步骤配置：");
    console.log("1. 在项目根目录创建 .env 文件");
    console.log("2. 添加以下内容：");
    console.log("\nPRIVATE_KEY=your_private_key_here");
    console.log("SEPOLIA_RPC_URL=https://rpc.sepolia.org");
    console.log("\n详细说明请查看 SEPOLIA_DEPLOYMENT_GUIDE.md");
    process.exit(1);
  }

  // 2. 连接到 Sepolia
  console.log("\n2️⃣  连接到 Sepolia 测试网...");
  try {
    const network = await hre.network.connect();
    const viem = network.viem;
    const [deployer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    
    console.log("   ✅ 连接成功");
    console.log("   部署地址:", deployer.account.address);
    
    // 3. 检查余额
    console.log("\n3️⃣  检查账户余额...");
    const balance = await publicClient.getBalance({
      address: deployer.account.address,
    });
    const balanceInEth = Number(balance) / 10**18;
    
    console.log("   余额:", balanceInEth, "ETH");
    
    if (balanceInEth < 0.05) {
      console.log("   ⚠️  警告：余额较低，可能不足以完成部署");
      console.log("   建议余额：至少 0.2 ETH");
      console.log("\n获取测试 ETH：");
      console.log("   - https://sepoliafaucet.com/");
      console.log("   - https://www.infura.io/faucet/sepolia");
    } else {
      console.log("   ✅ 余额充足");
    }
    
    // 4. 检查 Chainlink 预言机
    console.log("\n4️⃣  检查 Chainlink 价格预言机...");
    const priceFeedAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    console.log("   预言机地址:", priceFeedAddress);
    
    try {
      const priceFeed = await viem.getContractAt("MockAggregatorV3", priceFeedAddress as `0x${string}`);
      const roundData: any = await priceFeed.read.latestRoundData();
      const price = roundData[1];
      
      console.log("   ✅ 预言机可用");
      console.log("   当前 ETH 价格: $" + (Number(price) / 10**8).toFixed(2));
    } catch (error) {
      console.log("   ⚠️  无法读取价格（可能是 RPC 问题）");
    }
    
    // 5. 总结
    console.log("\n" + "=" .repeat(60));
    console.log("📊 配置检查完成");
    console.log("=" .repeat(60));
    
    if (balanceInEth >= 0.05) {
      console.log("\n✅ 所有检查通过！可以开始部署");
      console.log("\n运行部署命令：");
      console.log("npx hardhat run scripts/verify-deployment.ts --network sepolia");
    } else {
      console.log("\n⚠️  请先获取足够的测试 ETH");
    }
    
  } catch (error: any) {
    console.log("   ❌ 连接失败");
    console.log("\n错误信息:", error.message);
    console.log("\n请检查：");
    console.log("1. PRIVATE_KEY 是否正确（不含 0x 前缀）");
    console.log("2. SEPOLIA_RPC_URL 是否可用");
    console.log("3. 网络连接是否正常");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 检查失败:", error);
    process.exit(1);
  });

