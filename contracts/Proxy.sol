// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Re-export ERC1967Proxy for Hardhat deployment scripts
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// Create a named contract that Hardhat can find
contract UUPSProxy is ERC1967Proxy {
    constructor(
        address implementation,
        bytes memory _data
    ) ERC1967Proxy(implementation, _data) {}
}

