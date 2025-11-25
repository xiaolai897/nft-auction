// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPriceConverter.sol";

/**
 * @title Auction
 * @notice 独立的 NFT 拍卖合约，每场拍卖部署一个实例
 * @dev 支持 ETH 和 ERC20 出价，集成 Chainlink 价格预言机
 */
contract Auction is ERC721Holder, ReentrancyGuard {
    // 拍卖信息结构
    struct AuctionInfo {
        address seller;           // 卖家地址
        address nftContract;      // NFT 合约地址
        uint256 tokenId;          // NFT Token ID
        address paymentToken;     // 支付代币地址（address(0) 表示 ETH）
        uint256 startPrice;       // 起拍价
        uint256 startTime;        // 开始时间
        uint256 duration;         // 持续时间（秒）
        uint256 highestBid;       // 最高出价
        address highestBidder;    // 最高出价者
        bool ended;               // 是否已结束
        uint256 feeRate;          // 手续费率（基点 basis points，1% = 100）
    }

    // 状态变量
    AuctionInfo public auctionInfo;
    address public factory;              // 工厂合约地址
    IPriceConverter public priceConverter; // 价格转换器
    bool private initialized;            // 初始化标志

    // 事件
    event BidPlaced(
        address indexed bidder,
        uint256 amount,
        uint256 amountInUSD,
        uint256 timestamp
    );
    
    event AuctionFinished(
        address indexed winner,
        uint256 amount,
        uint256 amountInUSD,
        uint256 platformFee
    );
    
    event AuctionCancelled(address indexed seller);

    // 错误定义
    error AuctionNotStarted();
    error AuctionEnded();
    error AuctionNotEnded();
    error BidTooLow(uint256 required, uint256 provided);
    error InvalidBidder();
    error TransferFailed();
    error Unauthorized();
    error AuctionAlreadyEnded();
    error AlreadyInitialized();
    error OnlyFactory();

    /**
     * @notice 构造函数
     * @param _seller 卖家地址
     * @param _nftContract NFT 合约地址
     * @param _tokenId NFT Token ID
     * @param _paymentToken 支付代币地址（address(0) 表示 ETH）
     * @param _startPrice 起拍价
     * @param _duration 拍卖持续时间（秒）
     * @param _feeRate 平台手续费率（基点）
     * @param _priceConverter 价格转换器地址
     */
    constructor(
        address _seller,
        address _nftContract,
        uint256 _tokenId,
        address _paymentToken,
        uint256 _startPrice,
        uint256 _duration,
        uint256 _feeRate,
        address _priceConverter
    ) {
        require(_seller != address(0), "Invalid seller");
        require(_nftContract != address(0), "Invalid NFT contract");
        require(_startPrice > 0, "Start price must be > 0");
        require(_duration > 0, "Duration must be > 0");
        require(_feeRate <= 10000, "Fee rate too high"); // 最高 100%

        factory = msg.sender;
        priceConverter = IPriceConverter(_priceConverter);

        auctionInfo = AuctionInfo({
            seller: _seller,
            nftContract: _nftContract,
            tokenId: _tokenId,
            paymentToken: _paymentToken,
            startPrice: _startPrice,
            startTime: block.timestamp,
            duration: _duration,
            highestBid: 0,
            highestBidder: address(0),
            ended: false,
            feeRate: _feeRate
        });

        // NFT将在initialize()函数中转入
    }

    /**
     * @notice 初始化拍卖，转移NFT到合约
     * @dev 只能由Factory调用一次
     */
    function initialize() external {
        if (msg.sender != factory) revert OnlyFactory();
        if (initialized) revert AlreadyInitialized();
        
        // 将 NFT 转入合约托管
        IERC721(auctionInfo.nftContract).safeTransferFrom(
            factory,
            address(this),
            auctionInfo.tokenId
        );
        
        initialized = true;
    }

    /**
     * @notice 使用 ETH 出价
     */
    function bid() external payable nonReentrant {
        AuctionInfo storage auction = auctionInfo;
        
        // 检查拍卖状态
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp >= auction.startTime + auction.duration) revert AuctionEnded();
        if (auction.ended) revert AuctionAlreadyEnded();
        if (auction.paymentToken != address(0)) revert("Use bidWithERC20");
        
        uint256 bidAmount = msg.value;
        
        // 检查出价金额
        uint256 minBid = auction.highestBid > 0 ? auction.highestBid : auction.startPrice;
        if (bidAmount <= minBid) {
            revert BidTooLow(minBid + 1, bidAmount);
        }

        // 退还前一个出价者
        if (auction.highestBidder != address(0)) {
            (bool success, ) = auction.highestBidder.call{value: auction.highestBid}("");
            if (!success) revert TransferFailed();
        }

        // 更新最高出价
        auction.highestBid = bidAmount;
        auction.highestBidder = msg.sender;

        // 获取 USD 价格
        uint256 amountInUSD = 0;
        if (address(priceConverter) != address(0)) {
            try priceConverter.getEthValueInUSD(bidAmount) returns (uint256 usdValue) {
                amountInUSD = usdValue;
            } catch {
                // 预言机失败时仍允许出价，但 USD 为 0
            }
        }

        emit BidPlaced(msg.sender, bidAmount, amountInUSD, block.timestamp);
    }

    /**
     * @notice 使用 ERC20 代币出价
     * @param amount 出价金额
     */
    function bidWithERC20(uint256 amount) external nonReentrant {
        AuctionInfo storage auction = auctionInfo;
        
        // 检查拍卖状态
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp >= auction.startTime + auction.duration) revert AuctionEnded();
        if (auction.ended) revert AuctionAlreadyEnded();
        if (auction.paymentToken == address(0)) revert("Use bid() for ETH");
        
        // 检查出价金额
        uint256 minBid = auction.highestBid > 0 ? auction.highestBid : auction.startPrice;
        if (amount <= minBid) {
            revert BidTooLow(minBid + 1, amount);
        }

        // 接收 ERC20 代币
        IERC20 token = IERC20(auction.paymentToken);
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );

        // 退还前一个出价者
        if (auction.highestBidder != address(0)) {
            require(
                token.transfer(auction.highestBidder, auction.highestBid),
                "Refund failed"
            );
        }

        // 更新最高出价
        auction.highestBid = amount;
        auction.highestBidder = msg.sender;

        // 获取 USD 价格
        uint256 amountInUSD = 0;
        if (address(priceConverter) != address(0)) {
            try priceConverter.getTokenValueInUSD(auction.paymentToken, amount) returns (uint256 usdValue) {
                amountInUSD = usdValue;
            } catch {
                // 预言机失败时仍允许出价
            }
        }

        emit BidPlaced(msg.sender, amount, amountInUSD, block.timestamp);
    }

    /**
     * @notice 结束拍卖
     * @dev 任何人都可以调用，但必须满足时间条件
     */
    function endAuction() external nonReentrant {
        AuctionInfo storage auction = auctionInfo;
        
        // 检查状态
        if (auction.ended) revert AuctionAlreadyEnded();
        if (block.timestamp < auction.startTime + auction.duration) {
            revert AuctionNotEnded();
        }

        auction.ended = true;

        // 如果有出价者
        if (auction.highestBidder != address(0)) {
            // 计算平台手续费
            uint256 fee = (auction.highestBid * auction.feeRate) / 10000;
            uint256 sellerAmount = auction.highestBid - fee;

            // 转移 NFT 给获胜者
            IERC721(auction.nftContract).safeTransferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );

            // 转移资金
            if (auction.paymentToken == address(0)) {
                // ETH
                (bool success1, ) = auction.seller.call{value: sellerAmount}("");
                if (!success1) revert TransferFailed();
                
                if (fee > 0) {
                    (bool success2, ) = factory.call{value: fee}("");
                    if (!success2) revert TransferFailed();
                }
            } else {
                // ERC20
                IERC20 token = IERC20(auction.paymentToken);
                require(token.transfer(auction.seller, sellerAmount), "Seller payment failed");
                
                if (fee > 0) {
                    require(token.transfer(factory, fee), "Fee transfer failed");
                }
            }

            // 获取 USD 价格用于事件
            uint256 amountInUSD = 0;
            if (address(priceConverter) != address(0)) {
                if (auction.paymentToken == address(0)) {
                    try priceConverter.getEthValueInUSD(auction.highestBid) returns (uint256 usdValue) {
                        amountInUSD = usdValue;
                    } catch {}
                } else {
                    try priceConverter.getTokenValueInUSD(auction.paymentToken, auction.highestBid) returns (uint256 usdValue) {
                        amountInUSD = usdValue;
                    } catch {}
                }
            }

            emit AuctionFinished(auction.highestBidder, auction.highestBid, amountInUSD, fee);
        } else {
            // 无人出价，退还 NFT 给卖家
            IERC721(auction.nftContract).safeTransferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
            
            emit AuctionFinished(address(0), 0, 0, 0);
        }
    }

    /**
     * @notice 卖家取消拍卖（仅在无出价时）
     */
    function cancelAuction() external nonReentrant {
        AuctionInfo storage auction = auctionInfo;
        
        if (msg.sender != auction.seller) revert Unauthorized();
        if (auction.ended) revert AuctionAlreadyEnded();
        if (auction.highestBidder != address(0)) revert("Cannot cancel with bids");

        auction.ended = true;

        // 退还 NFT
        IERC721(auction.nftContract).safeTransferFrom(
            address(this),
            auction.seller,
            auction.tokenId
        );

        emit AuctionCancelled(auction.seller);
    }

    /**
     * @notice 获取拍卖的 USD 价值
     * @return 当前最高出价的 USD 等值
     */
    function getHighestBidInUSD() external view returns (uint256) {
        if (auctionInfo.highestBid == 0) return 0;
        if (address(priceConverter) == address(0)) return 0;

        if (auctionInfo.paymentToken == address(0)) {
            try priceConverter.getEthValueInUSD(auctionInfo.highestBid) returns (uint256 usdValue) {
                return usdValue;
            } catch {
                return 0;
            }
        } else {
            try priceConverter.getTokenValueInUSD(auctionInfo.paymentToken, auctionInfo.highestBid) returns (uint256 usdValue) {
                return usdValue;
            } catch {
                return 0;
            }
        }
    }

    /**
     * @notice 检查拍卖是否可以结束
     */
    function canEnd() external view returns (bool) {
        return !auctionInfo.ended && 
               block.timestamp >= auctionInfo.startTime + auctionInfo.duration;
    }

    /**
     * @notice 获取剩余时间
     */
    function timeRemaining() external view returns (uint256) {
        if (auctionInfo.ended) return 0;
        uint256 endTime = auctionInfo.startTime + auctionInfo.duration;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }
}

