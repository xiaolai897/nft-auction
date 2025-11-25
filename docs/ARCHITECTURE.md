# NFT 拍卖市场 - 系统架构文档

## 概述

基于 Hardhat 3 和 OpenZeppelin 的 NFT 拍卖市场系统，采用 Uniswap V2 风格的工厂模式，集成 Chainlink 价格预言机，支持 UUPS 合约升级。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   用户层 (Users)                         │
│  - NFT 持有者 (Sellers)                                  │
│  - 竞拍者 (Bidders)                                      │
│  - 平台管理员 (Admins)                                   │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│              工厂合约 (NftAuctionFactory)                │
│  - 创建拍卖实例                                          │
│  - 管理所有拍卖                                          │
│  - 配置手续费率                                          │
│  - 收取平台费用                                          │
│  - UUPS 可升级 ✓                                        │
└────┬───────────────────────────────────────────┬────────┘
     │                                           │
     │ 部署                                      │ 查询
     │                                           │
┌────▼─────────────────┐              ┌─────────▼─────────┐
│  拍卖实例 (Auction)  │              │  价格转换器        │
│  - NFT 托管          │◄─────────────┤  (PriceConverter)  │
│  - 接收出价          │   获取价格    │  - ETH/USD        │
│  - 结算交易          │              │  - ERC20/USD      │
│  - 退款机制          │              │  - Chainlink Feed │
└──────┬───────────────┘              └───────────────────┘
       │                                        ▲
       │ 转移                                   │
       │                                        │
┌──────▼─────────────────────────────┐  ┌──────┴──────────┐
│  ERC721 NFT                        │  │  Chainlink      │
│  (ERC721Collectible)               │  │  Price Feeds    │
│  - Mint NFT                        │  │  - 预言机节点    │
│  - UUPS 可升级 ✓                   │  │  - 实时价格      │
└────────────────────────────────────┘  └─────────────────┘
```

## 核心合约

### 1. NftAuctionFactory（工厂合约）

**职责：**
- 部署独立的 Auction 合约实例
- 维护所有拍卖的索引
- 提供拍卖查询功能
- 管理平台手续费配置
- 收集和分发平台费用

**关键特性：**
- ✅ UUPS 可升级模式
- ✅ 基于角色的访问控制（AccessControl）
- ✅ 重入保护（ReentrancyGuard）
- ✅ 动态阶梯费率

**状态变量：**
```solidity
address[] public allAuctions;                // 所有拍卖地址
address public priceConverter;               // 价格转换器
uint256 public defaultFeeRate;               // 默认费率（基点）
FeeStructure[] public feeStructures;         // 阶梯费率
mapping(address => address[]) auctionsBySeller;      // 卖家索引
mapping(address => mapping(uint256 => address[])) auctionsByNFT;  // NFT索引
```

### 2. Auction（拍卖实例）

**职责：**
- 托管单个 NFT
- 处理出价逻辑（ETH 和 ERC20）
- 退款之前的出价者
- 结算拍卖（转移 NFT 和资金）
- 计算并扣除平台手续费

**关键特性：**
- ✅ 支持 ETH 和 ERC20 双币种
- ✅ 实时 USD 价格转换
- ✅ 防重入攻击
- ✅ 可取消（无出价时）

**生命周期：**
```
[创建] -> [进行中] -> [结束] -> [结算]
   │         │          │         │
   │      [出价]     [到期]   [转移资产]
   │      [退款]              [扣除手续费]
   │
[取消]（仅无出价时）
```

### 3. PriceConverter（价格转换器）

**职责：**
- 集成 Chainlink 价格预言机
- 提供 ETH/USD 价格查询
- 提供 ERC20/USD 价格查询
- 管理多个价格 Feed

**关键特性：**
- ✅ 价格数据时效性检查
- ✅ 异常处理机制
- ✅ 支持多种 ERC20
- ✅ Owner 可配置 Feed

### 4. ERC721Collectible（NFT 合约）

**职责：**
- 标准 ERC721 实现
- NFT 铸造
- 权限管理

**关键特性：**
- ✅ UUPS 可升级
- ✅ 基于角色的铸造权限
- ✅ 兼容 ERC721 标准

## 工作流程

### 拍卖创建流程

```
1. 卖家 Mint/拥有 NFT
2. 卖家 Approve Factory 合约
3. 卖家调用 Factory.createAuction()
4. Factory 部署新的 Auction 实例
5. Auction 构造函数转移 NFT 到自身
6. Factory 记录拍卖索引
7. 触发 AuctionCreated 事件
```

### 出价流程（ETH）

```
1. 竞拍者调用 Auction.bid() 发送 ETH
2. 检查拍卖状态和出价金额
3. 退还之前最高出价者的 ETH
4. 更新当前最高出价
5. 查询 PriceConverter 获取 USD 价值
6. 触发 BidPlaced 事件
```

### 出价流程（ERC20）

```
1. 竞拍者 Approve Auction 合约
2. 竞拍者调用 Auction.bidWithERC20(amount)
3. 检查拍卖状态和出价金额
4. transferFrom 竞拍者代币到 Auction
5. transfer 退还之前出价者的代币
6. 更新最高出价
7. 查询 Token/USD 价格
8. 触发 BidPlaced 事件
```

### 拍卖结束流程

```
1. 任何人调用 Auction.endAuction()
2. 检查拍卖是否到期
3. 标记拍卖已结束
4. 如果有出价者：
   a. 计算平台手续费
   b. 转移 NFT 给获胜者
   c. 转移资金给卖家（扣除手续费）
   d. 转移手续费给 Factory
5. 如果无出价：
   a. 退还 NFT 给卖家
6. 触发 AuctionEnded 事件
```

## 安全机制

### 1. 重入攻击防护
- 所有涉及资金转移的函数使用 `nonReentrant` 修饰符
- 遵循 CEI 模式（Checks-Effects-Interactions）

### 2. 访问控制
- Factory 使用 AccessControl 管理角色
- 关键操作需要特定角色权限
- Auction 实例限制卖家取消权限

### 3. 资金安全
- 出价资金托管在 Auction 合约
- 退款机制确保资金可追溯
- 手续费自动扣除并转移

### 4. 价格安全
- Chainlink 价格数据时效性验证
- 价格查询异常不阻塞核心功能
- Try-catch 包裹预言机调用

### 5. 升级安全
- UUPS 模式限制升级权限
- 需要 UPGRADER_ROLE
- 存储布局兼容性检查

## 费率机制

### 默认费率
- 固定费率：2.5%（250 基点）

### 动态阶梯费率

| USD 金额范围 | 费率 |
|-------------|------|
| $0 - $1,000 | 2.5% |
| $1,000 - $10,000 | 2% |
| $10,000+ | 1.5% |

**计算公式：**
```
平台手续费 = 成交价 × 费率 / 10000
卖家收益 = 成交价 - 平台手续费
```

## Gas 优化

1. **使用自定义错误** - 替代 require 字符串
2. **状态变量打包** - 优化存储布局
3. **事件索引优化** - 最多 3 个 indexed 参数
4. **循环优化** - 缓存数组长度
5. **存储 vs 内存** - 合理使用 storage/memory

## 可扩展性

### 已实现
- ✅ 多币种支持（ETH + 任意 ERC20）
- ✅ 多 NFT 合约支持
- ✅ 动态费率配置
- ✅ 合约升级能力

### 未来扩展方向
- [ ] Chainlink CCIP 跨链拍卖
- [ ] 荷兰式拍卖模式
- [ ] 批量拍卖功能
- [ ] NFT 碎片化拍卖
- [ ] 自动做市商（AMM）集成

## 依赖项

- **Hardhat 3.0+** - 开发框架
- **OpenZeppelin Contracts 5.4+** - 标准库
- **OpenZeppelin Upgradeable 5.4+** - 升级库
- **Chainlink Contracts 1.2+** - 预言机
- **Viem 2.37+** - 以太坊库
- **TypeScript 5.8** - 类型支持

## 网络支持

### 测试网
- Sepolia Testnet
- Hardhat Local Network

### Chainlink Feeds (Sepolia)
- ETH/USD: `0x694AA1769357215DE4FAC081bf1f309aDC325306`

## 事件系统

### Factory 事件
```solidity
event AuctionCreated(address indexed auctionAddress, ...);
event PriceConverterUpdated(address indexed oldConverter, ...);
event DefaultFeeRateUpdated(uint256 oldRate, uint256 newRate);
event FeeStructureUpdated(uint256 indexed index, ...);
event PlatformFeeWithdrawn(address indexed token, ...);
```

### Auction 事件
```solidity
event BidPlaced(address indexed bidder, uint256 amount, uint256 amountInUSD, ...);
event AuctionEnded(address indexed winner, ...);
event AuctionCancelled(address indexed seller);
```

## 总结

本系统采用模块化设计，清晰分离关注点：
- **Factory** 负责管理
- **Auction** 负责业务
- **PriceConverter** 负责数据
- **NFT** 负责资产

通过 UUPS 升级模式保证可维护性，通过 Chainlink 预言机保证价格准确性，通过完善的安全机制保证资金安全。

