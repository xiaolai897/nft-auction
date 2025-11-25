import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { parseEther, parseUnits } from "viem";

describe("PriceConverter", function () {
  let viem: any;
  let publicClient: any;
  let owner: any;
  let user1: any;
  let priceConverter: any;
  let mockAggregator: any;
  let mockERC20: any;

  beforeEach(async () => {
    // 初始化 viem 和账户
    const network = await hre.network.connect();
    viem = network.viem;
    publicClient = await viem.getPublicClient();
    [owner, user1] = await viem.getWalletClients();
    // 部署 Mock Aggregator（模拟 Chainlink feed）
    mockAggregator = await viem.deployContract("MockAggregatorV3", [], {
      client: { wallet: owner },
    });

    // 设置 ETH 价格为 2000 USD（8 位小数）
    await mockAggregator.write.setLatestAnswer([2000n * 10n ** 8n], {
      account: owner.account,
    });

    // 部署 PriceConverter
    priceConverter = await viem.deployContract(
      "PriceConverter",
      [mockAggregator.address],
      { client: { wallet: owner } }
    );

    // 部署测试 ERC20
    mockERC20 = await viem.deployContract("MockERC20", ["TestToken", "TEST", 18], {
      client: { wallet: owner },
    });

    // 部署 ERC20 的 Mock Aggregator
    const tokenAggregator = await viem.deployContract("MockAggregatorV3", [], {
      client: { wallet: owner },
    });
    
    // 设置 Token 价格为 1 USD
    await tokenAggregator.write.setLatestAnswer([1n * 10n ** 8n], {
      account: owner.account,
    });

    // 配置 Token 价格 feed
    await priceConverter.write.setTokenPriceFeed(
      [mockERC20.address, tokenAggregator.address],
      { account: owner.account }
    );
  });

  it("Should get ETH price", async () => {
    const price = await priceConverter.read.getEthPrice();
    assert.equal(price, 2000n * 10n ** 8n);
  });

  it("Should get ETH value in USD", async () => {
    // 1 ETH should be 2000 USD
    const value = await priceConverter.read.getEthValueInUSD([parseEther("1")]);
    assert.equal(value, 2000n * 10n ** 8n);
  });

  it("Should get token price", async () => {
    const price = await priceConverter.read.getTokenPrice([mockERC20.address]);
    assert.equal(price, 1n * 10n ** 8n);
  });

  it("Should get token value in USD", async () => {
    // 1000 tokens at $1 = $1000
    const value = await priceConverter.read.getTokenValueInUSD([
      mockERC20.address,
      parseEther("1000"),
    ]);
    assert.equal(value, 1000n * 10n ** 8n);
  });

  it("Should update ETH price feed", async () => {
    const newAggregator = await viem.deployContract("MockAggregatorV3", [], {
      client: { wallet: owner },
    });
    
    await newAggregator.write.setLatestAnswer([3000n * 10n ** 8n], {
      account: owner.account,
    });

    await viem.assertions.emitWithArgs(
      priceConverter.write.setEthPriceFeed([newAggregator.address], {
        account: owner.account,
      }),
      priceConverter,
      "EthPriceFeedUpdated",
      [newAggregator.address]
    );

    const price = await priceConverter.read.getEthPrice();
    assert.equal(price, 3000n * 10n ** 8n);
  });

  it("Should check if feed is configured", async () => {
    const isConfigured = await priceConverter.read.isFeedConfigured([
      mockERC20.address,
    ]);
    assert.equal(isConfigured, true);

    const notConfigured = await priceConverter.read.isFeedConfigured([
      user1.account.address,
    ]);
    assert.equal(notConfigured, false);
  });

  it("Should revert on unconfigured token", async () => {
    const randomToken = user1.account.address;

    await assert.rejects(
      async () => {
        await priceConverter.read.getTokenPrice([randomToken]);
      },
      (error: any) => {
        return error.message.includes("FeedNotConfigured");
      }
    );
  });

  it("Should prevent non-owner from setting feeds", async () => {
    await assert.rejects(
      async () => {
        await priceConverter.write.setEthPriceFeed([mockAggregator.address], {
          account: user1.account,
        });
      },
      (error: any) => {
        return error.message.includes("OwnableUnauthorizedAccount");
      }
    );
  });
});

