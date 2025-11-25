// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPriceConverter.sol";

/**
 * @title PriceConverter
 * @notice 使用 Chainlink 预言机将加密货币价格转换为 USD
 * @dev 支持 ETH 和多种 ERC20 代币
 */
contract PriceConverter is IPriceConverter, Ownable {
    // Chainlink 价格 feed 地址映射
    mapping(address => address) public priceFeeds; // token => aggregator
    address public ethPriceFeed; // ETH/USD feed

    // 价格过期时间（秒）
    uint256 public constant PRICE_STALE_THRESHOLD = 3600; // 1 小时

    // 事件
    event PriceFeedUpdated(address indexed token, address indexed feed);
    event EthPriceFeedUpdated(address indexed feed);

    // 错误
    error InvalidFeedAddress();
    error StalePrice();
    error InvalidPrice();
    error FeedNotConfigured();

    /**
     * @notice 构造函数
     * @param _ethPriceFeed ETH/USD Chainlink feed 地址
     */
    constructor(address _ethPriceFeed) Ownable(msg.sender) {
        if (_ethPriceFeed == address(0)) revert InvalidFeedAddress();
        ethPriceFeed = _ethPriceFeed;
        emit EthPriceFeedUpdated(_ethPriceFeed);
    }

    /**
     * @notice 设置 ETH 价格 feed
     * @param _ethPriceFeed 新的 feed 地址
     */
    function setEthPriceFeed(address _ethPriceFeed) external onlyOwner {
        if (_ethPriceFeed == address(0)) revert InvalidFeedAddress();
        ethPriceFeed = _ethPriceFeed;
        emit EthPriceFeedUpdated(_ethPriceFeed);
    }

    /**
     * @notice 设置 ERC20 代币价格 feed
     * @param token 代币地址
     * @param feed Chainlink feed 地址
     */
    function setTokenPriceFeed(address token, address feed) external onlyOwner {
        if (token == address(0) || feed == address(0)) revert InvalidFeedAddress();
        priceFeeds[token] = feed;
        emit PriceFeedUpdated(token, feed);
    }

    /**
     * @notice 批量设置代币价格 feed
     * @param tokens 代币地址数组
     * @param feeds feed 地址数组
     */
    function setTokenPriceFeeds(
        address[] calldata tokens,
        address[] calldata feeds
    ) external onlyOwner {
        require(tokens.length == feeds.length, "Length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0) || feeds[i] == address(0)) {
                revert InvalidFeedAddress();
            }
            priceFeeds[tokens[i]] = feeds[i];
            emit PriceFeedUpdated(tokens[i], feeds[i]);
        }
    }

    /**
     * @inheritdoc IPriceConverter
     */
    function getEthPrice() public view override returns (uint256) {
        return _getPrice(ethPriceFeed);
    }

    /**
     * @inheritdoc IPriceConverter
     */
    function getTokenPrice(address token) public view override returns (uint256) {
        address feed = priceFeeds[token];
        if (feed == address(0)) revert FeedNotConfigured();
        return _getPrice(feed);
    }

    /**
     * @inheritdoc IPriceConverter
     */
    function getEthValueInUSD(uint256 ethAmount) external view override returns (uint256) {
        uint256 ethPrice = getEthPrice(); // 8 decimals
        // ethAmount in wei (18 decimals), ethPrice in USD (8 decimals)
        // result = ethAmount * ethPrice / 1e18 (in 8 decimals)
        return (ethAmount * ethPrice) / 1e18;
    }

    /**
     * @inheritdoc IPriceConverter
     */
    function getTokenValueInUSD(
        address token,
        uint256 amount
    ) external view override returns (uint256) {
        uint256 tokenPrice = getTokenPrice(token); // 8 decimals
        // Assuming token has 18 decimals (adjust if needed)
        // result = amount * tokenPrice / 1e18 (in 8 decimals)
        return (amount * tokenPrice) / 1e18;
    }

    /**
     * @notice 从 Chainlink aggregator 获取价格
     * @param aggregator Aggregator 地址
     * @return 价格（8 位小数）
     */
    function _getPrice(address aggregator) internal view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(aggregator);
        
        try priceFeed.latestRoundData() returns (
            uint80 /* roundId */,
            int256 price,
            uint256 /* startedAt */,
            uint256 updatedAt,
            uint80 /* answeredInRound */
        ) {
            // 检查价格有效性
            if (price <= 0) revert InvalidPrice();
            
            // 检查价格时效性
            if (block.timestamp - updatedAt > PRICE_STALE_THRESHOLD) {
                revert StalePrice();
            }

            return uint256(price);
        } catch {
            revert InvalidPrice();
        }
    }

    /**
     * @notice 检查 feed 是否配置
     * @param token 代币地址（address(0) 表示 ETH）
     */
    function isFeedConfigured(address token) external view returns (bool) {
        if (token == address(0)) {
            return ethPriceFeed != address(0);
        }
        return priceFeeds[token] != address(0);
    }
}

