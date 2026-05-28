// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, Ownable {
    uint256 public constant MAX_FAUCET_AMOUNT = 1_000 * 10 ** 6;

    event FaucetMinted(address indexed to, uint256 amount);

    constructor(address initialOwner) ERC20("Mock USD Coin", "mUSDC") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet(address to, uint256 amount) external {
        require(to != address(0), "Recipient is zero address");
        require(amount > 0 && amount <= MAX_FAUCET_AMOUNT, "Invalid faucet amount");

        _mint(to, amount);
        emit FaucetMinted(to, amount);
    }
}
