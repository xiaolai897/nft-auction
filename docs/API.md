# 合约 API 文档

## NftAuctionFactory

工厂合约，负责创建和管理拍卖实例。

### 写入方法

#### `createAuction`

创建新的拍卖（使用 ETH）。

```solidity
function createAuction(
    uint256 duration,
    uint256 price,
    address nftAddress,
    uint256 nftId
) external returns (uint256)
```

**参数：**
- `duration`: 拍卖持续时间（秒）
- `price`: 起拍价（wei）
- `nftAddress`: NFT 合约地址
- `nftId`: NFT Token ID

**返回：**
- 拍卖地址的 uint256 表示

**前置条件：**
- 调用者拥有该 NFT
- 已 approve Factory 合约

**示例：**
```typescript
const auctionId = await factory.write.createAuction([
  3600n,              // 1 hour
  parseEther("1"),    // 1 ETH
  nftAddress,
  1n
]);
```

---

#### `createAuctionWithToken`

创建支持 ERC20 支付的拍卖。

```solidity
function createAuctionWithToken(
    address nftAddress,
    uint256 nftId,
    address paymentToken,
    uint256 startPrice,
    uint256 duration
) external returns (address)
```

**参数：**
- `paymentToken`: ERC20 代币地址
- 其他参数同上

**返回：**
- 拍卖合约地址

---

#### `endAuction`

结束指定拍卖。

```solidity
function endAuction(uint256 auctionId) external
```

---

#### `setPriceConverter`

设置价格转换器地址（仅管理员）。

```solidity
function setPriceConverter(address _priceConverter) external
```

---

#### `setDefaultFeeRate`

设置默认手续费率（仅管理员）。

```solidity
function setDefaultFeeRate(uint256 _feeRate) external
```

**参数：**
- `_feeRate`: 费率（基点，1% = 100）

---

#### `setFeeStructure`

设置阶梯费率（仅管理员）。

```solidity
function setFeeStructure(
    uint256 index,
    uint256 threshold,
    uint256 feeRate
) external
```

---

#### `withdrawFees`

提取平台手续费（ETH）。

```solidity
function withdrawFees(address payable to) external
```

---

#### `withdrawTokenFees`

提取平台手续费（ERC20）。

```solidity
function withdrawTokenFees(address token, address to) external
```

---

### 只读方法

#### `auctionCount`

获取拍卖总数。

```solidity
function auctionCount() external view returns (uint256)
```

---

#### `getAuctionAddress`

获取拍卖地址。

```solidity
function getAuctionAddress(uint256 index) external view returns (address)
```

---

#### `allAuction`

获取所有拍卖地址。

```solidity
function allAuction() external view returns (address[] memory)
```

---

#### `getAuctionsBySeller`

获取卖家的所有拍卖。

```solidity
function getAuctionsBySeller(address seller) external view returns (address[] memory)
```

---

#### `getAuctionsByNFT`

获取特定 NFT 的所有拍卖。

```solidity
function getAuctionsByNFT(
    address nftContract,
    uint256 tokenId
) external view returns (address[] memory)
```

---

#### `calculateFeeRate`

计算动态费率。

```solidity
function calculateFeeRate(uint256 amountInUSD) public view returns (uint256)
```

**参数：**
- `amountInUSD`: 金额（8 位小数）

**返回：**
- 费率（基点）

---

### 事件

#### `AuctionCreated`

```solidity
event AuctionCreated(
    address indexed auctionAddress,
    address indexed seller,
    address indexed nftContract,
    uint256 tokenId,
    address paymentToken,
    uint256 startPrice,
    uint256 duration
)
```

---

## Auction

拍卖实例合约。

### 写入方法

#### `bid`

使用 ETH 出价。

```solidity
function bid() external payable
```

**要求：**
- 拍卖进行中
- 出价高于当前最高价或起拍价
- msg.value > 0

**示例：**
```typescript
await auction.write.bid({ value: parseEther("1.5") });
```

---

#### `bidWithERC20`

使用 ERC20 出价。

```solidity
function bidWithERC20(uint256 amount) external
```

**前置条件：**
- 已 approve Auction 合约
- amount > 当前最高价

---

#### `endAuction`

结束拍卖。

```solidity
function endAuction() external
```

**要求：**
- 拍卖已到期
- 未结束

---

#### `cancelAuction`

取消拍卖（仅卖家，无出价时）。

```solidity
function cancelAuction() external
```

---

### 只读方法

#### `auctionInfo`

获取拍卖信息。

```solidity
function auctionInfo() external view returns (AuctionInfo memory)
```

**返回结构：**
```solidity
struct AuctionInfo {
    address seller;
    address nftContract;
    uint256 tokenId;
    address paymentToken;
    uint256 startPrice;
    uint256 startTime;
    uint256 duration;
    uint256 highestBid;
    address highestBidder;
    bool ended;
    uint256 feeRate;
}
```

---

#### `getHighestBidInUSD`

获取当前最高出价的 USD 价值。

```solidity
function getHighestBidInUSD() external view returns (uint256)
```

**返回：**
- USD 金额（8 位小数）

---

#### `canEnd`

检查拍卖是否可以结束。

```solidity
function canEnd() external view returns (bool)
```

---

#### `timeRemaining`

获取剩余时间。

```solidity
function timeRemaining() external view returns (uint256)
```

**返回：**
- 剩余秒数

---

### 事件

#### `BidPlaced`

```solidity
event BidPlaced(
    address indexed bidder,
    uint256 amount,
    uint256 amountInUSD,
    uint256 timestamp
)
```

#### `AuctionEnded`

```solidity
event AuctionEnded(
    address indexed winner,
    uint256 amount,
    uint256 amountInUSD,
    uint256 platformFee
)
```

#### `AuctionCancelled`

```solidity
event AuctionCancelled(address indexed seller)
```

---

## PriceConverter

价格转换器合约。

### 写入方法

#### `setEthPriceFeed`

设置 ETH 价格 Feed（仅 Owner）。

```solidity
function setEthPriceFeed(address _ethPriceFeed) external
```

---

#### `setTokenPriceFeed`

设置 ERC20 价格 Feed。

```solidity
function setTokenPriceFeed(address token, address feed) external
```

---

#### `setTokenPriceFeeds`

批量设置价格 Feed。

```solidity
function setTokenPriceFeeds(
    address[] calldata tokens,
    address[] calldata feeds
) external
```

---

### 只读方法

#### `getEthPrice`

获取 ETH 当前价格。

```solidity
function getEthPrice() public view returns (uint256)
```

**返回：**
- 价格（USD，8 位小数）

---

#### `getTokenPrice`

获取 ERC20 当前价格。

```solidity
function getTokenPrice(address token) public view returns (uint256)
```

---

#### `getEthValueInUSD`

获取 ETH 的 USD 价值。

```solidity
function getEthValueInUSD(uint256 ethAmount) external view returns (uint256)
```

**参数：**
- `ethAmount`: ETH 数量（wei）

**返回：**
- USD 价值（8 位小数）

---

#### `getTokenValueInUSD`

获取 ERC20 的 USD 价值。

```solidity
function getTokenValueInUSD(
    address token,
    uint256 amount
) external view returns (uint256)
```

---

#### `isFeedConfigured`

检查 Feed 是否已配置。

```solidity
function isFeedConfigured(address token) external view returns (bool)
```

---

## ERC721Collectible

NFT 合约。

### 写入方法

#### `initialize`

初始化合约（仅一次）。

```solidity
function initialize(string memory name, string memory symbol) public
```

---

#### `mint`

铸造 NFT（需要 OPERATOR_ROLE）。

```solidity
function mint(address to) external returns (uint256)
```

**返回：**
- 新铸造的 Token ID

---

### 只读方法

#### `getTokenCounter`

获取已铸造的代币数量。

```solidity
function getTokenCounter() external view returns (uint256)
```

---

## 错误定义

### Auction 错误

```solidity
error AuctionNotStarted();
error AuctionEnded();
error AuctionNotEnded();
error BidTooLow(uint256 required, uint256 provided);
error InvalidBidder();
error TransferFailed();
error Unauthorized();
error AuctionAlreadyEnded();
```

### Factory 错误

```solidity
error InvalidAddress();
error InvalidParameter();
error Unauthorized();
error WithdrawFailed();
```

### PriceConverter 错误

```solidity
error InvalidFeedAddress();
error StalePrice();
error InvalidPrice();
error FeedNotConfigured();
```

---

## 常量

### 角色标识符

```solidity
bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
```

### 其他常量

```solidity
uint256 public constant PRICE_STALE_THRESHOLD = 3600; // 1 hour
```

---

## 完整示例

### 创建并参与拍卖

```typescript
import { parseEther } from "viem";

// 1. Mint NFT
await nft.write.mint([seller.account.address]);

// 2. Approve Factory
await nft.write.approve([factory.address, 1n], { account: seller.account });

// 3. Create Auction
const createTx = await factory.write.createAuction([
  3600n,           // 1 hour
  parseEther("1"), // 1 ETH start price
  nft.address,
  1n
], { account: seller.account });

// 4. Get auction address
const auctionAddr = await factory.read.getAuctionAddress([0n]);
const auction = await viem.getContractAt("Auction", auctionAddr);

// 5. Place bid
await auction.write.bid({ 
  value: parseEther("1.5"),
  account: bidder.account 
});

// 6. Wait for auction to end
await new Promise(resolve => setTimeout(resolve, 3700 * 1000));

// 7. End auction
await auction.write.endAuction({ account: anyone.account });

// 8. Check winner
const info = await auction.read.auctionInfo();
console.log("Winner:", info.highestBidder);
console.log("Amount:", info.highestBid);
```

---

更多示例请参考 `test/` 目录下的测试文件。

