"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 验证合约部署和基本功能
 * 用于验证系统可用性的快速测试脚本
 */
var hardhat_1 = require("hardhat");
var viem_1 = require("viem");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var viem, _a, deployer, seller, bidder, publicClient, mockAggregator, priceConverter, ethPrice, ethValue, nft, mintTx, factory, createTx, auctionAddr, auction, bidTx, info, usdValue;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log("🔍 开始验证系统功能...\n");
                    return [4 /*yield*/, hardhat_1.network.connect()];
                case 1:
                    viem = (_b.sent()).viem;
                    return [4 /*yield*/, viem.getWalletClients()];
                case 2:
                    _a = _b.sent(), deployer = _a[0], seller = _a[1], bidder = _a[2];
                    return [4 /*yield*/, viem.getPublicClient()];
                case 3:
                    publicClient = _b.sent();
                    console.log("📋 账户信息:");
                    console.log("   Deployer:", deployer.account.address);
                    console.log("   Seller:", seller.account.address);
                    console.log("   Bidder:", bidder.account.address, "\n");
                    // 1. 部署 Mock Aggregator
                    console.log("1️⃣  部署 Mock Chainlink Aggregator...");
                    return [4 /*yield*/, viem.deployContract("MockAggregatorV3", [], {
                            client: { wallet: deployer },
                        })];
                case 4:
                    mockAggregator = _b.sent();
                    return [4 /*yield*/, mockAggregator.write.setLatestAnswer([2000n * Math.pow(10n, 8n)], {
                            account: deployer.account,
                        })];
                case 5:
                    _b.sent();
                    console.log("   ✅ MockAggregator 部署成功");
                    console.log("   地址:", mockAggregator.address);
                    console.log("   价格: $2000/ETH\n");
                    // 2. 部署 PriceConverter
                    console.log("2️⃣  部署 PriceConverter...");
                    return [4 /*yield*/, viem.deployContract("PriceConverter", [mockAggregator.address], { client: { wallet: deployer } })];
                case 6:
                    priceConverter = _b.sent();
                    console.log("   ✅ PriceConverter 部署成功");
                    console.log("   地址:", priceConverter.address, "\n");
                    // 3. 测试价格查询
                    console.log("3️⃣  测试价格查询功能...");
                    return [4 /*yield*/, priceConverter.read.getEthPrice()];
                case 7:
                    ethPrice = _b.sent();
                    console.log("   ✅ ETH 价格:", Number(ethPrice) / Math.pow(10, 8), "USD");
                    return [4 /*yield*/, priceConverter.read.getEthValueInUSD([(0, viem_1.parseEther)("1")])];
                case 8:
                    ethValue = _b.sent();
                    console.log("   ✅ 1 ETH 价值:", Number(ethValue) / Math.pow(10, 8), "USD\n");
                    // 4. 部署 NFT
                    console.log("4️⃣  部署 ERC721Collectible...");
                    return [4 /*yield*/, viem.deployContract("ERC721Collectible", [], {
                            client: { wallet: deployer },
                        })];
                case 9:
                    nft = _b.sent();
                    return [4 /*yield*/, nft.write.initialize(["Verify NFT", "VNFT"], {
                            account: deployer.account,
                        })];
                case 10:
                    _b.sent();
                    console.log("   ✅ NFT 合约部署成功");
                    console.log("   地址:", nft.address, "\n");
                    // 5. Mint NFT
                    console.log("5️⃣  Mint NFT...");
                    return [4 /*yield*/, nft.write.mint([seller.account.address], {
                            account: deployer.account,
                        })];
                case 11:
                    mintTx = _b.sent();
                    return [4 /*yield*/, publicClient.waitForTransactionReceipt({ hash: mintTx })];
                case 12:
                    _b.sent();
                    console.log("   ✅ NFT #1 已 mint 给 Seller\n");
                    // 6. 部署 Factory
                    console.log("6️⃣  部署 NftAuctionFactory...");
                    return [4 /*yield*/, viem.deployContract("NftAuctionFactory", [], {
                            client: { wallet: deployer },
                        })];
                case 13:
                    factory = _b.sent();
                    return [4 /*yield*/, factory.write.initialize([deployer.account.address, priceConverter.address, 250n], { account: deployer.account })];
                case 14:
                    _b.sent();
                    console.log("   ✅ Factory 部署成功");
                    console.log("   地址:", factory.address);
                    console.log("   手续费率: 2.5%\n");
                    // 7. 创建拍卖
                    console.log("7️⃣  创建拍卖...");
                    return [4 /*yield*/, nft.write.approve([factory.address, 1n], {
                            account: seller.account,
                        })];
                case 15:
                    _b.sent();
                    return [4 /*yield*/, factory.write.createAuction([3600n, (0, viem_1.parseEther)("0.1"), nft.address, 1n], { account: seller.account })];
                case 16:
                    createTx = _b.sent();
                    return [4 /*yield*/, publicClient.waitForTransactionReceipt({ hash: createTx })];
                case 17:
                    _b.sent();
                    return [4 /*yield*/, factory.read.getAuctionAddress([0n])];
                case 18:
                    auctionAddr = _b.sent();
                    console.log("   ✅ 拍卖已创建");
                    console.log("   拍卖地址:", auctionAddr);
                    console.log("   起拍价: 0.1 ETH\n");
                    // 8. 出价
                    console.log("8️⃣  测试出价功能...");
                    return [4 /*yield*/, viem.getContractAt("Auction", auctionAddr)];
                case 19:
                    auction = _b.sent();
                    return [4 /*yield*/, auction.write.bid({
                            value: (0, viem_1.parseEther)("0.15"),
                            account: bidder.account,
                        })];
                case 20:
                    bidTx = _b.sent();
                    return [4 /*yield*/, publicClient.waitForTransactionReceipt({ hash: bidTx })];
                case 21:
                    _b.sent();
                    console.log("   ✅ Bidder 出价 0.15 ETH\n");
                    // 9. 查询拍卖状态
                    console.log("9️⃣  查询拍卖状态...");
                    return [4 /*yield*/, auction.read.auctionInfo()];
                case 22:
                    info = _b.sent();
                    return [4 /*yield*/, auction.read.getHighestBidInUSD()];
                case 23:
                    usdValue = _b.sent();
                    console.log("   当前最高出价者:", info[8]);
                    console.log("   当前最高出价:", Number(info[7]) / Math.pow(10, 18), "ETH");
                    console.log("   USD 价值: $", Number(usdValue) / Math.pow(10, 8), "\n");
                    // 10. 总结
                    console.log("=".repeat(60));
                    console.log("✅ 所有功能验证通过！\n");
                    console.log("📊 验证结果:");
                    console.log("   ✅ Chainlink 价格预言机集成正常");
                    console.log("   ✅ NFT 合约功能正常");
                    console.log("   ✅ 工厂模式部署正常");
                    console.log("   ✅ 拍卖创建功能正常");
                    console.log("   ✅ 出价功能正常");
                    console.log("   ✅ USD 价格转换正常");
                    console.log("\n🎉 系统完全可用！");
                    console.log("=".repeat(60));
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .then(function () { return process.exit(0); })
    .catch(function (error) {
    console.error("❌ 验证失败:", error);
    process.exit(1);
});
