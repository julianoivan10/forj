// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Test-only 6-decimal token that re-enters a target contract from
 *         inside `transfer`. Used to prove the escrow's `nonReentrant`
 *         guard holds even if the settlement token were hostile.
 *         Never deploy outside tests.
 */
contract MockReentrantToken is ERC20 {
    address public target;
    bytes public attackData;
    bool public attackAttempted;
    bool public attackSucceeded;

    constructor() ERC20("Reentrant USD", "rUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, bytes calldata data) external {
        target = target_;
        attackData = data;
        attackAttempted = false;
        attackSucceeded = false;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (target != address(0) && msg.sender == target && !attackAttempted) {
            attackAttempted = true;
            (bool ok, ) = target.call(attackData);
            attackSucceeded = ok;
        }
        return super.transfer(to, value);
    }
}

/**
 * @notice Test-only 6-decimal token with a USDC-style blocklist: transfers
 *         to a blocked address revert. Models Circle freezing a recipient.
 */
contract MockBlocklistToken is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Blocklist USD", "bUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blocked");
        super._update(from, to, value);
    }
}

/**
 * @notice Test-only token that burns 1% on every transfer. The escrow
 *         assumes a non-deflationary token; this mock demonstrates what
 *         breaks if that assumption is violated.
 */
contract MockFeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee USD", "fUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 burnt = value / 100;
            super._update(from, address(0), burnt);
            super._update(from, to, value - burnt);
        } else {
            super._update(from, to, value);
        }
    }
}
