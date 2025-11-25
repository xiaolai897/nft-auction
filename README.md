# NFT 拍卖市场 (NFT Auction Marketplace)

基于 Hardhat 3、OpenZeppelin 和 Chainlink 的去中心化 NFT 拍卖平台。

[![Hardhat](https://img.shields.io/badge/Hardhat-3.0-yellow.svg)](https://hardhat.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue.svg)](https://soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.4.0-blue.svg)](https://openzeppelin.com/)
[![Chainlink](https://img.shields.io/badge/Chainlink-1.2.0-blue.svg)](https://chain.link/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## 功能特性

- **工厂模式** - 采用 Uniswap V2 风格的工厂模式，每场拍卖独立部署
- **多币种支持** - 支持 ETH 和任意 ERC20 代币出价
- **价格预言机** - 集成 Chainlink 实时价格转换为 USD
- **UUPS 升级** - 工厂和 NFT 合约支持安全升级
- **动态手续费** - 根据拍卖金额自动调整平台费率
- **完整测试** - 100% 测试覆盖率，包含单元和集成测试
- **安全优化** - 防重入攻击、访问控制、CEI 模式

## 项目结构

```
NftAuction/
├── contracts/
│   ├── Auction.sol              # 拍卖实例合约
│   ├── NftAuctionFactory.sol    # 工厂管理合约
│   ├── PriceConverter.sol       # Chainlink 价格转换器
│   ├── ERC721Collectible.sol    # NFT 合约
│   ├── MockERC20.sol             # 测试代币
│   ├── MockAggregatorV3.sol      # Mock Chainlink
│   └── interfaces/
│       ├── INftAuctionFactory.sol
│       └── IPriceConverter.sol
├── test/
│   ├── ERC721Collectible.test.ts
│   ├── PriceConverter.test.ts
│   ├── Auction.test.ts
│   ├── NftAuctionFactory.test.ts
│   └── Integration.test.ts
├── scripts/
│   ├── verify-deployment.ts     # 部署及测试脚本
├── ignition/
│   └── modules/
│       └── NFTAuction.ts        # Ignition 部署模块
└── docs/
    ├── ARCHITECTURE.md          # 架构文档
    ├── DEPLOYMENT.md            # 部署指南
    └── API.md                   # API 文档
```

## 快速开始

### 1. 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd NftAuction

# 安装依赖
npm install
```

### 2. 运行测试

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试
npx hardhat test test/Auction.test.ts

# 查看测试覆盖率
npx hardhat coverage
```

### 3. 本地部署

```bash
# 启动本地节点（终端 1）
npx hardhat node

# 部署合约（终端 2）
npx hardhat run scripts/verify-deployment.ts --network localhost
```

### 4. 测试网部署

```bash
# 配置私钥
npx hardhat keystore set SEPOLIA_PRIVATE_KEY

# 部署到 Sepolia
npx hardhat run scripts/verify-deployment.ts --network sepolia
```

## 系统架构

```
┌──────────────┐
│    用户层     │
└──────┬───────┘
       │
┌──────▼──────────────┐
│  NftAuctionFactory  │ (工厂合约 - UUPS 可升级)
│  - 创建拍卖          │
│  - 管理费率          │
│  - 收取手续费        │
└──────┬──────────────┘
       │ 部署
       │
┌──────▼──────────────┐      ┌────────────────┐
│     Auction         │◄─────┤ PriceConverter │
│  - NFT 托管          │ 价格  │ (Chainlink)    │
│  - 处理出价          │ 查询  │ - ETH/USD      │
│  - 结算交易          │      │ - ERC20/USD    │
└─────────────────────┘      └────────────────┘
```

## 核心功能

### 创建拍卖

```typescript
// 1. Mint NFT
await nft.write.mint([seller.address]);

// 2. Approve Factory
await nft.write.approve([factory.address, tokenId]);

// 3. Create Auction
await factory.write.createAuction([
  3600n,              // 持续时间: 1 小时
  parseEther("1"),    // 起拍价: 1 ETH
  nft.address,
  tokenId
]);
```

### 参与竞拍

```typescript
// ETH 出价
await auction.write.bid({ value: parseEther("1.5") });

// ERC20 出价
await token.write.approve([auction.address, amount]);
await auction.write.bidWithERC20([amount]);
```

### 结束拍卖

```typescript
// 任何人都可以在拍卖到期后调用
await auction.write.endAuction();

// 获取结果
const info = await auction.read.auctionInfo();
console.log("Winner:", info.highestBidder);
console.log("Amount:", info.highestBid);
```

## 动态手续费

| USD 金额范围     | 手续费率 |
| ---------------- | -------- |
| $0 - $1,000      | 2.5%     |
| $1,000 - $10,000 | 2.0%     |
| $10,000+         | 1.5%     |

## 安全特性

- **重入保护** - 所有资金转移使用 `nonReentrant`
- **访问控制** - 基于角色的权限管理
- **价格验证** - Chainlink 数据时效性检查
- **CEI 模式** - Checks-Effects-Interactions 模式
- **自定义错误** - Gas 优化的错误处理
- **UUPS 升级** - 安全的合约升级机制

## 测试

本项目使用 Hardhat 3 的 `node:test` 和 `viem`：

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/Auction.test.ts

# 查看测试报告
npx hardhat test --reporter spec
```

**测试覆盖：**
- NFT 合约测试（铸造、权限、升级）
- 价格转换器测试（Chainlink 集成）
- 拍卖合约测试（出价、退款、结算）
- 工厂合约测试（部署、查询、手续费）
- 集成测试（完整拍卖流程）

## 网络支持

### 测试网
- Sepolia Testnet
- Hardhat Local Network


### Seplia测试网合约地址
- Chainlink：0x694AA1769357215DE4FAC081bf1f309aDC325306
- PriceConverter：0xae56cabda484842bdcfc8886d1d1d9aacb831d2e
- NFT实现合约：0x4da5005bbdfbe56a074d47dc1ad8a8a010932bb0
- NFT代理合约：0x6cc6dc02309e957a5634df134a2c272c5949cde9
- Factory实现合约：0xf55732d080a92c878112518f4c8bcf8c5034f0d4
- Factory代理合约：0xbe886001d06c25a243585c45fb118821a855d76b
