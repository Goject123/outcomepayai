// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

contract DemoSubscription {
    address public immutable owner;
    uint256 public immutable planPrice;
    string public planName;

    event PlanConfigured(address indexed owner, uint256 planPrice, string planName);

    constructor(address _owner, uint256 _planPrice, string memory _planName) {
        require(_owner != address(0), "Owner is zero address");

        owner = _owner;
        planPrice = _planPrice;
        planName = _planName;

        emit PlanConfigured(_owner, _planPrice, _planName);
    }
}
