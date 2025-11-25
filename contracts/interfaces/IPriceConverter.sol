// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPriceConverter
 * @notice 价格转换器接口，用于将加密货币价格转换为 USD
 */
interface IPriceConverter {
    /**
     * @notice 获取 ETH 的 USD 价值
     * @param ethAmount ETH 数量（wei）
     * @return USD 价值（8 位小数）
     */
    function getEthValueInUSD(uint256 ethAmount) external view returns (uint256);

    /**
     * @notice 获取 ERC20 代币的 USD 价值
     * @param token 代币合约地址
     * @param amount 代币数量
     * @return USD 价值（8 位小数）
     */
    function getTokenValueInUSD(address token, uint256 amount) external view returns (uint256);

    /**
     * @notice 获取 ETH 当前价格
     * @return 价格（USD，8 位小数）
     */
    function getEthPrice() external view returns (uint256);

    /**
     * @notice 获取 ERC20 代币当前价格
     * @param token 代币合约地址
     * @return 价格（USD，8 位小数）
     */
    function getTokenPrice(address token) external view returns (uint256);
}

