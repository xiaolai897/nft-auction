// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title INftAuctionFactory
 * @notice NFT 拍卖工厂接口
 */
interface INftAuctionFactory {
    /**
     * @notice 创建一场拍卖
     * @param duration 拍卖持续时间（秒）
     * @param price 起拍价
     * @param nftAddress NFT 合约地址
     * @param nftId NFT Token ID
     * @return 拍卖地址的 uint256 表示
     */
    function createAuction(
        uint256 duration,
        uint256 price,
        address nftAddress,
        uint256 nftId
    ) external returns (uint256);

    /**
     * @notice 获取拍卖地址
     * @param auctionId 拍卖索引
     * @return 拍卖地址的 uint256 表示
     */
    function getAuction(uint256 auctionId) external view returns (uint256);

    /**
     * @notice 获取所有拍卖地址
     * @return 拍卖地址数组
     */
    function allAuction() external view returns (address[] memory);

    /**
     * @notice 结束指定拍卖
     * @param auctionId 拍卖索引
     */
    function endAuction(uint256 auctionId) external;

    /**
     * @notice 拍卖创建事件
     * @param auctionAddress 拍卖合约地址
     * @param seller 卖家地址
     * @param nftContract NFT 合约地址
     * @param tokenId NFT Token ID
     * @param paymentToken 支付代币地址
     * @param startPrice 起拍价
     * @param duration 持续时间
     */
    event AuctionCreated(
        address indexed auctionAddress,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        address paymentToken,
        uint256 startPrice,
        uint256 duration
    );
}
