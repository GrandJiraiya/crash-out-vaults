// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Development only: intentionally no Base mainnet support.
abstract contract TestNetwork {
    error UnsupportedChain();
    constructor() {
        if (block.chainid != 84532 && block.chainid != 31337 && block.chainid != 1337) revert UnsupportedChain();
    }
}

// A distinct, worthless test token. Never use the real CRASHOUTCRYPTO token.
contract VaultTestToken is ERC20, TestNetwork {
    constructor() ERC20("Vault Wars TEST ONLY", "VAULTTEST") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

// Principal-only time lock; no interest, rewards, penalties or owner withdrawal.
contract VaultTestLock is TestNetwork, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    uint256 public totalLocked;
    struct Position { uint256 amount; uint64 unlockAt; }
    mapping(address => Position) public positions;
    event Locked(address indexed account, uint256 amount, uint64 unlockAt);
    event Released(address indexed account, uint256 amount);
    error InvalidLock();
    error NotMature();
    error UnexpectedTransfer();

    constructor(VaultTestToken asset) {
        require(address(asset).code.length != 0, "token required");
        token = IERC20(address(asset));
    }
    function lock(uint256 amount, uint16 daysToLock) external nonReentrant {
        if (amount == 0 || positions[msg.sender].amount != 0 ||
            (daysToLock != 7 && daysToLock != 30 && daysToLock != 90)) revert InvalidLock();
        uint64 unlockAt = uint64(block.timestamp + uint256(daysToLock) * 1 days);
        positions[msg.sender] = Position(amount, unlockAt);
        totalLocked += amount;
        uint256 balance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != balance + amount) revert UnexpectedTransfer();
        emit Locked(msg.sender, amount, unlockAt);
    }
    function release() external nonReentrant {
        Position memory p = positions[msg.sender];
        if (p.amount == 0 || block.timestamp < p.unlockAt) revert NotMature();
        delete positions[msg.sender];
        totalLocked -= p.amount;
        token.safeTransfer(msg.sender, p.amount);
        emit Released(msg.sender, p.amount);
    }
}

// Explicit, fixed allocations of pre-funded mock tokens. No paid entry.
// One publisher with no withdrawal power during the claim window.
contract VaultTestRewards is TestNetwork, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable publisher;
    uint256 public totalReserved;
    struct Epoch { uint256 remaining; uint64 closesAt; bool published; }
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => uint256)) public allocation;
    event Published(uint256 indexed week, uint256 funded, uint64 closesAt);
    event Claimed(uint256 indexed week, address indexed account, uint256 amount);
    event ExpiredRefund(uint256 indexed week, uint256 amount);
    error InvalidEpoch();
    error InvalidClaim();
    error Unauthorized();
    error UnexpectedTransfer();

    constructor(VaultTestToken asset, address initialPublisher) {
        require(address(asset).code.length != 0 && initialPublisher != address(0), "invalid setup");
        token = IERC20(address(asset));
        publisher = initialPublisher;
    }
    // week = UTC Unix timestamp of Monday 00:00. Publish only completed weeks.
    // Bounded to 100 allocations per test epoch; no editing after publication.
    function publish(uint256 week, address[] calldata accounts, uint256[] calldata amounts) external nonReentrant {
        if (msg.sender != publisher) revert Unauthorized();
        if (week < 4 days || (week - 4 days) % 7 days != 0 || week > block.timestamp ||
            block.timestamp - week < 7 days || epochs[week].published ||
            accounts.length == 0 || accounts.length > 100 || accounts.length != amounts.length) revert InvalidEpoch();
        uint256 total;
        for (uint256 i; i < accounts.length; ++i) {
            if (accounts[i] == address(0) || amounts[i] == 0 || allocation[week][accounts[i]] != 0) revert InvalidEpoch();
            allocation[week][accounts[i]] = amounts[i];
            total += amounts[i];
        }
        uint64 deadline = uint64(block.timestamp + 30 days);
        epochs[week] = Epoch(total, deadline, true);
        totalReserved += total;
        uint256 balance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), total);
        if (token.balanceOf(address(this)) != balance + total) revert UnexpectedTransfer();
        emit Published(week, total, deadline);
    }
    function claim(uint256 week) external nonReentrant {
        Epoch storage e = epochs[week];
        uint256 amount = allocation[week][msg.sender];
        if (!e.published || block.timestamp >= e.closesAt || amount == 0) revert InvalidClaim();
        allocation[week][msg.sender] = 0;
        e.remaining -= amount;
        totalReserved -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(week, msg.sender, amount);
    }
    function refundExpired(uint256 week) external nonReentrant {
        Epoch storage e = epochs[week];
        if (!e.published || block.timestamp < e.closesAt || e.remaining == 0) revert InvalidClaim();
        uint256 amount = e.remaining;
        e.remaining = 0;
        totalReserved -= amount;
        token.safeTransfer(publisher, amount);
        emit ExpiredRefund(week, amount);
    }
}
