// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/INftAuctionFactory.sol";
import "./Auction.sol";

/**
 * @title NftAuctionFactory
 * @notice NFT 拍卖工厂合约，采用 Uniswap V2 风格工厂模式
 * @dev 每场拍卖部署独立的 Auction 合约实例，支持 UUPS 升级
 */
contract NftAuctionFactory is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    INftAuctionFactory
{
    // 定义角色
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // 状态变量
    address[] public allAuctions;                    // 所有拍卖地址
    address public priceConverter;                   // 价格转换器地址
    uint256 public defaultFeeRate;                   // 默认手续费率（基点，1% = 100）
    
    // 动态手续费结构
    struct FeeStructure {
        uint256 threshold;  // USD 阈值（8 位小数）
        uint256 feeRate;    // 费率（基点）
    }
    FeeStructure[] public feeStructures;

    // 映射关系
    mapping(address => address[]) public auctionsBySeller;   // 卖家 => 拍卖列表
    mapping(address => mapping(uint256 => address[])) public auctionsByNFT; // NFT合约 => TokenId => 拍卖列表
    mapping(address => bool) public isAuction;               // 验证是否为工厂创建的拍卖

    // 事件 (AuctionCreated 在接口中定义)
    event PriceConverterUpdated(address indexed oldConverter, address indexed newConverter);
    event DefaultFeeRateUpdated(uint256 oldRate, uint256 newRate);
    event FeeStructureUpdated(uint256 indexed index, uint256 threshold, uint256 feeRate);
    event PlatformFeeWithdrawn(address indexed token, address indexed to, uint256 amount);

    // 错误定义
    error InvalidAddress();
    error InvalidParameter();
    error Unauthorized();
    error WithdrawFailed();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice 初始化函数
     * @param admin 管理员地址
     * @param _priceConverter 价格转换器地址
     * @param _defaultFeeRate 默认手续费率（基点）
     */
    function initialize(
        address admin,
        address _priceConverter,
        uint256 _defaultFeeRate
    ) public initializer {
        if (admin == address(0)) revert InvalidAddress();
        
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        priceConverter = _priceConverter;
        defaultFeeRate = _defaultFeeRate;

        // 初始化默认阶梯费率
        _initializeDefaultFeeStructure();
    }

    /**
     * @notice 初始化默认费率结构
     */
    function _initializeDefaultFeeStructure() internal {
        // 0-1000 USD: 2.5%
        feeStructures.push(FeeStructure({
            threshold: 1000 * 1e8,
            feeRate: 250
        }));
        
        // 1000-10000 USD: 2%
        feeStructures.push(FeeStructure({
            threshold: 10000 * 1e8,
            feeRate: 200
        }));
        
        // 10000+ USD: 1.5%
        feeStructures.push(FeeStructure({
            threshold: type(uint256).max,
            feeRate: 150
        }));
    }

    /**
     * @inheritdoc INftAuctionFactory
     */
    function createAuction(
        uint256 duration,
        uint256 price,
        address nftAddress,
        uint256 nftId
    ) external override returns (uint256) {
        address auctionAddr = _createAuction(msg.sender, nftAddress, nftId, address(0), price, duration);
        return uint256(uint160(auctionAddr));
    }

    /**
     * @notice 创建支持 ERC20 支付的拍卖
     * @param nftAddress NFT 合约地址
     * @param nftId NFT Token ID
     * @param paymentToken 支付代币地址（address(0) 表示 ETH）
     * @param startPrice 起拍价
     * @param duration 拍卖持续时间（秒）
     */
    function createAuctionWithToken(
        address nftAddress,
        uint256 nftId,
        address paymentToken,
        uint256 startPrice,
        uint256 duration
    ) external returns (address) {
        return _createAuction(msg.sender, nftAddress, nftId, paymentToken, startPrice, duration);
    }

    /**
     * @notice 内部创建拍卖逻辑
     */
    function _createAuction(
        address seller,
        address nftAddress,
        uint256 nftId,
        address paymentToken,
        uint256 startPrice,
        uint256 duration
    ) internal nonReentrant returns (address) {
        if (nftAddress == address(0)) revert InvalidAddress();
        if (startPrice == 0) revert InvalidParameter();
        if (duration == 0) revert InvalidParameter();

        // 计算手续费率（使用默认值或动态计算）
        uint256 feeRate = defaultFeeRate;

        // 步骤1: 将NFT从seller转移到Factory
        IERC721(nftAddress).transferFrom(seller, address(this), nftId);

        // 步骤2: 部署新的 Auction 合约
        Auction auction = new Auction(
            seller,
            nftAddress,
            nftId,
            paymentToken,
            startPrice,
            duration,
            feeRate,
            priceConverter
        );

        address auctionAddress = address(auction);

        // 步骤3: 将NFT从Factory转移到Auction（通过调用initialize）
        IERC721(nftAddress).approve(auctionAddress, nftId);
        auction.initialize();

        // 记录拍卖
        allAuctions.push(auctionAddress);
        auctionsBySeller[seller].push(auctionAddress);
        auctionsByNFT[nftAddress][nftId].push(auctionAddress);
        isAuction[auctionAddress] = true;

        emit AuctionCreated(
            auctionAddress,
            seller,
            nftAddress,
            nftId,
            paymentToken,
            startPrice,
            duration
        );

        return auctionAddress;
    }

    /**
     * @inheritdoc INftAuctionFactory
     */
    function getAuction(uint256 auctionId) external view override returns (uint256) {
        require(auctionId < allAuctions.length, "Invalid auction ID");
        // 返回地址的 uint256 表示（为了兼容接口）
        return uint256(uint160(allAuctions[auctionId]));
    }

    /**
     * @notice 获取拍卖地址（更友好的版本）
     * @param index 拍卖索引
     */
    function getAuctionAddress(uint256 index) external view returns (address) {
        require(index < allAuctions.length, "Invalid index");
        return allAuctions[index];
    }

    /**
     * @inheritdoc INftAuctionFactory
     */
    function allAuction() external view override returns (address[] memory) {
        return allAuctions;
    }

    /**
     * @notice 获取拍卖总数
     */
    function auctionCount() external view returns (uint256) {
        return allAuctions.length;
    }

    /**
     * @notice 获取卖家的所有拍卖
     */
    function getAuctionsBySeller(address seller) external view returns (address[] memory) {
        return auctionsBySeller[seller];
    }

    /**
     * @notice 获取特定 NFT 的所有拍卖
     */
    function getAuctionsByNFT(
        address nftContract,
        uint256 tokenId
    ) external view returns (address[] memory) {
        return auctionsByNFT[nftContract][tokenId];
    }

    /**
     * @inheritdoc INftAuctionFactory
     */
    function endAuction(uint256 auctionId) external override {
        require(auctionId < allAuctions.length, "Invalid auction ID");
        Auction(allAuctions[auctionId]).endAuction();
    }

    /**
     * @notice 设置价格转换器
     */
    function setPriceConverter(address _priceConverter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address oldConverter = priceConverter;
        priceConverter = _priceConverter;
        emit PriceConverterUpdated(oldConverter, _priceConverter);
    }

    /**
     * @notice 设置默认手续费率
     * @param _feeRate 新的费率（基点）
     */
    function setDefaultFeeRate(uint256 _feeRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeRate <= 10000, "Fee rate too high");
        uint256 oldRate = defaultFeeRate;
        defaultFeeRate = _feeRate;
        emit DefaultFeeRateUpdated(oldRate, _feeRate);
    }

    /**
     * @notice 设置阶梯费率结构
     * @param index 费率结构索引
     * @param threshold USD 阈值
     * @param feeRate 费率
     */
    function setFeeStructure(
        uint256 index,
        uint256 threshold,
        uint256 feeRate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(feeRate <= 10000, "Fee rate too high");
        
        if (index >= feeStructures.length) {
            feeStructures.push(FeeStructure({
                threshold: threshold,
                feeRate: feeRate
            }));
        } else {
            feeStructures[index] = FeeStructure({
                threshold: threshold,
                feeRate: feeRate
            });
        }
        
        emit FeeStructureUpdated(index, threshold, feeRate);
    }

    /**
     * @notice 根据 USD 金额计算手续费率
     * @param amountInUSD 金额（8 位小数）
     */
    function calculateFeeRate(uint256 amountInUSD) public view returns (uint256) {
        for (uint256 i = 0; i < feeStructures.length; i++) {
            if (amountInUSD < feeStructures[i].threshold) {
                return feeStructures[i].feeRate;
            }
        }
        return defaultFeeRate;
    }

    /**
     * @notice 提取平台手续费（ETH）
     * @param to 接收地址
     */
    function withdrawFees(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert InvalidParameter();
        
        (bool success, ) = to.call{value: balance}("");
        if (!success) revert WithdrawFailed();
        
        emit PlatformFeeWithdrawn(address(0), to, balance);
    }

    /**
     * @notice 提取平台手续费（ERC20）
     * @param token 代币地址
     * @param to 接收地址
     */
    function withdrawTokenFees(
        address token,
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (token == address(0) || to == address(0)) revert InvalidAddress();
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert InvalidParameter();
        
        require(IERC20(token).transfer(to, balance), "Transfer failed");
        
        emit PlatformFeeWithdrawn(token, to, balance);
    }

    /**
     * @notice 接收 ETH
     */
    receive() external payable {}

    /**
     * @notice 授权升级
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice 支持的接口
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
