// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  WorkChainEscrow
 * @author WorkChain
 * @notice Two-sided escrow for off-chain freelance work, paid in USDC.
 *
 *         Lifecycle:
 *           Created (off-chain) → Funded → Submitted → Released
 *                                                    ↘ Disputed → Resolved
 *                                       ↘ TimedOut → Released (claim) | Refunded
 *
 *         Each escrow row maps to exactly one off-chain `contracts.id` row,
 *         linked via `onChainContractId` on the database side.
 *
 *         Funds custody:
 *           - Client `approve()`s USDC to this contract, then calls
 *             `fund()` which `transferFrom`s into escrow.
 *           - Funds remain in this contract until `release()`, `refund()`,
 *             `claimAfterTimeout()`, or `resolveDispute()` distributes them.
 *           - Platform fee is deducted at release time, not at funding —
 *             this way disputes can refund the full amount.
 *
 *         Security model:
 *           - `nonReentrant` on every state-mutating + value-moving func.
 *           - `Ownable2Step` for arbiter — two-step ownership transfer
 *             prevents accidental misconfigurations.
 *           - `Pausable` killswitch on funding only — never blocks
 *             withdrawals, so users can always recover their funds even
 *             if the platform multisig is compromised.
 *           - `SafeERC20` for non-standard tokens (USDC is well-behaved
 *             but the lib costs almost nothing and is safer).
 */
contract WorkChainEscrow is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────

    enum Status {
        None,        // 0 — slot unused (sanity guard against id 0)
        Funded,      // 1 — client deposited
        Submitted,   // 2 — freelancer submitted, awaiting review
        Released,    // 3 — funds paid to freelancer
        Refunded,    // 4 — funds returned to client
        Disputed,    // 5 — arbiter intervention pending
        Resolved     // 6 — arbiter split the funds, terminal
    }

    struct Escrow {
        address client;
        address freelancer;
        uint128 amount;            // total in USDC (6 decimals → fits 1.7e30 USDC)
        uint128 platformFeeBps;    // basis points withheld at release
        uint64  fundedAt;
        uint64  submittedAt;
        uint64  deliveryDeadline;  // unix seconds; auto-release window starts here
        uint64  autoReleaseAt;     // unix seconds; computed at submit
        Status  status;
    }

    // ─────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────

    /// @notice The single ERC-20 we settle in. Set once at construction.
    IERC20 public immutable usdc;

    /// @notice Address that receives the platform fee at release.
    address public feeRecipient;

    /// @notice Default fee bps used when funding (can be 0). Capped at 10%
    ///         to avoid silently misconfigured runaway fees.
    uint16 public defaultFeeBps;

    /// @notice Auto-release window after submission, in seconds (default 7d).
    uint64 public autoReleaseWindow;

    /// @notice Monotonic counter — first valid id is 1.
    uint256 public nextEscrowId;

    /// @notice escrowId → Escrow.
    mapping(uint256 => Escrow) public escrows;

    // ─────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────

    uint16  public constant MAX_FEE_BPS = 1_000;             // 10%
    uint64  public constant MIN_AUTO_RELEASE_WINDOW = 1 days;
    uint64  public constant MAX_AUTO_RELEASE_WINDOW = 30 days;

    // ─────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────

    event EscrowFunded(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        uint256 amount,
        uint64  deliveryDeadline,
        uint16  feeBps
    );
    event WorkSubmitted(uint256 indexed escrowId, uint64 autoReleaseAt);
    event RevisionRequested(uint256 indexed escrowId);
    event Released(
        uint256 indexed escrowId,
        address indexed freelancer,
        uint256 freelancerAmount,
        uint256 feeAmount
    );
    event Refunded(uint256 indexed escrowId, address indexed client, uint256 amount);
    event DisputeRaised(uint256 indexed escrowId, address indexed by);
    event DisputeResolved(
        uint256 indexed escrowId,
        uint256 toFreelancer,
        uint256 toClient,
        uint256 toFee
    );
    event FeeRecipientUpdated(address indexed previous, address indexed next);
    event DefaultFeeBpsUpdated(uint16 previous, uint16 next);
    event AutoReleaseWindowUpdated(uint64 previous, uint64 next);

    // ─────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidStatus(Status expected, Status actual);
    error NotClient();
    error NotFreelancer();
    error NotParty();
    error TooEarly(uint64 unlockAt);
    error FeeTooHigh(uint16 bps);
    error WindowOutOfRange(uint64 seconds_);
    error SplitMismatch(uint256 total, uint256 supplied);

    // ─────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────

    constructor(
        IERC20 usdc_,
        address feeRecipient_,
        uint16 defaultFeeBps_,
        uint64 autoReleaseWindow_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (address(usdc_) == address(0) || feeRecipient_ == address(0) || initialOwner == address(0)) {
            revert InvalidAddress();
        }
        if (defaultFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh(defaultFeeBps_);
        if (
            autoReleaseWindow_ < MIN_AUTO_RELEASE_WINDOW ||
            autoReleaseWindow_ > MAX_AUTO_RELEASE_WINDOW
        ) {
            revert WindowOutOfRange(autoReleaseWindow_);
        }

        usdc = usdc_;
        feeRecipient = feeRecipient_;
        defaultFeeBps = defaultFeeBps_;
        autoReleaseWindow = autoReleaseWindow_;
        // First valid id is 1 — id 0 is reserved as "unused" sentinel.
        nextEscrowId = 1;
    }

    // ─────────────────────────────────────────────────────────────────
    // Mutations: lifecycle
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Client funds an escrow. Pulls USDC via `transferFrom` — caller
     *         must `approve(this, amount)` first.
     * @return escrowId Newly assigned id (frontend echoes this back to API).
     */
    function fund(
        address freelancer,
        uint128 amount,
        uint64 deliveryDeadline
    ) external whenNotPaused nonReentrant returns (uint256 escrowId) {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deliveryDeadline <= block.timestamp) revert InvalidDeadline();

        escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            client: msg.sender,
            freelancer: freelancer,
            amount: amount,
            platformFeeBps: defaultFeeBps,
            fundedAt: uint64(block.timestamp),
            submittedAt: 0,
            deliveryDeadline: deliveryDeadline,
            autoReleaseAt: 0,
            status: Status.Funded
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowFunded(escrowId, msg.sender, freelancer, amount, deliveryDeadline, defaultFeeBps);
    }

    /**
     * @notice Freelancer marks work as submitted. Starts the auto-release
     *         clock so the client can no longer hold funds indefinitely.
     */
    function submit(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded) revert InvalidStatus(Status.Funded, e.status);
        if (msg.sender != e.freelancer) revert NotFreelancer();

        e.status = Status.Submitted;
        e.submittedAt = uint64(block.timestamp);
        e.autoReleaseAt = uint64(block.timestamp) + autoReleaseWindow;

        emit WorkSubmitted(escrowId, e.autoReleaseAt);
    }

    /**
     * @notice Client requests a revision on a submitted escrow. Resets the
     *         auto-release clock — freelancer must re-submit to start it again.
     */
    function requestRevision(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Submitted) revert InvalidStatus(Status.Submitted, e.status);
        if (msg.sender != e.client) revert NotClient();

        e.status = Status.Funded;
        e.submittedAt = 0;
        e.autoReleaseAt = 0;

        emit RevisionRequested(escrowId);
    }

    /**
     * @notice Client approves the work; funds release to freelancer minus fee.
     *         Allowed from either Funded (early release) or Submitted state.
     */
    function release(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded && e.status != Status.Submitted) {
            revert InvalidStatus(Status.Submitted, e.status);
        }
        if (msg.sender != e.client) revert NotClient();

        _releaseTo(escrowId, e);
    }

    /**
     * @notice Permissionless claim once the auto-release deadline passes.
     *         Lets the freelancer (or anyone — funds still go to freelancer)
     *         self-serve a release if the client goes silent.
     */
    function claimAfterTimeout(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Submitted) revert InvalidStatus(Status.Submitted, e.status);
        if (e.autoReleaseAt == 0 || block.timestamp < e.autoReleaseAt) {
            revert TooEarly(e.autoReleaseAt);
        }

        _releaseTo(escrowId, e);
    }

    /**
     * @notice Mutual cancel — only valid before any submission. Either party
     *         can call; funds return in full to client.
     */
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded) revert InvalidStatus(Status.Funded, e.status);
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParty();

        e.status = Status.Refunded;
        uint256 amt = e.amount;
        // amount is zero'd out before transfer — defensive even with nonReentrant
        e.amount = 0;

        usdc.safeTransfer(e.client, amt);

        emit Refunded(escrowId, e.client, amt);
    }

    /**
     * @notice Either party can flag the escrow for arbiter resolution. Funds
     *         are *frozen* — only `resolveDispute` (owner-only) can move them.
     */
    function raiseDispute(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded && e.status != Status.Submitted) {
            revert InvalidStatus(Status.Submitted, e.status);
        }
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParty();

        e.status = Status.Disputed;

        emit DisputeRaised(escrowId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────
    // Mutations: arbiter (owner-only)
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Arbiter splits the disputed escrow. The three amounts must sum
     *         exactly to the locked total — no rounding leftovers, no minting.
     * @param  toFreelancer  paid to freelancer
     * @param  toClient      refunded to client
     * @param  toFee         taken as platform fee
     */
    function resolveDispute(
        uint256 escrowId,
        uint256 toFreelancer,
        uint256 toClient,
        uint256 toFee
    ) external nonReentrant onlyOwner {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Disputed) revert InvalidStatus(Status.Disputed, e.status);

        uint256 sum = toFreelancer + toClient + toFee;
        if (sum != e.amount) revert SplitMismatch(e.amount, sum);

        e.status = Status.Resolved;
        e.amount = 0;

        if (toFreelancer > 0) usdc.safeTransfer(e.freelancer, toFreelancer);
        if (toClient > 0)     usdc.safeTransfer(e.client, toClient);
        if (toFee > 0)        usdc.safeTransfer(feeRecipient, toFee);

        emit DisputeResolved(escrowId, toFreelancer, toClient, toFee);
    }

    // ─────────────────────────────────────────────────────────────────
    // Mutations: admin (owner-only)
    // ─────────────────────────────────────────────────────────────────

    function setFeeRecipient(address next) external onlyOwner {
        if (next == address(0)) revert InvalidAddress();
        emit FeeRecipientUpdated(feeRecipient, next);
        feeRecipient = next;
    }

    function setDefaultFeeBps(uint16 next) external onlyOwner {
        if (next > MAX_FEE_BPS) revert FeeTooHigh(next);
        emit DefaultFeeBpsUpdated(defaultFeeBps, next);
        defaultFeeBps = next;
    }

    function setAutoReleaseWindow(uint64 next) external onlyOwner {
        if (next < MIN_AUTO_RELEASE_WINDOW || next > MAX_AUTO_RELEASE_WINDOW) {
            revert WindowOutOfRange(next);
        }
        emit AutoReleaseWindowUpdated(autoReleaseWindow, next);
        autoReleaseWindow = next;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    function isReleasable(uint256 escrowId) external view returns (bool) {
        Escrow storage e = escrows[escrowId];
        return e.status == Status.Submitted &&
               e.autoReleaseAt > 0 &&
               block.timestamp >= e.autoReleaseAt;
    }

    // ─────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────

    function _mustExist(uint256 escrowId) private view returns (Escrow storage e) {
        e = escrows[escrowId];
        if (e.status == Status.None) revert InvalidStatus(Status.Funded, Status.None);
    }

    /**
     * @dev Splits the escrow amount per `platformFeeBps` and transfers.
     *      Zero-out the storage `amount` first as a belt-and-braces guard
     *      against any future refactor that drops `nonReentrant`.
     */
    function _releaseTo(uint256 escrowId, Escrow storage e) private {
        uint256 total = e.amount;
        uint256 fee = (total * e.platformFeeBps) / 10_000;
        uint256 toFreelancer = total - fee;

        e.status = Status.Released;
        e.amount = 0;

        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(e.freelancer, toFreelancer);

        emit Released(escrowId, e.freelancer, toFreelancer, fee);
    }
}
