// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  ForjEscrowV3
 * @author Forj
 * @notice v3 adds **on-chain partial release** so milestone-based contracts
 *         can flow payouts incrementally rather than holding everything
 *         until the very end. Same trust model, same fee structure, same
 *         dispute flow as v2 — just one extra function (`partialRelease`)
 *         and one extra storage slot per escrow (`released`).
 *
 *         Backward-compat note: this is a SEPARATE contract deploy. v2
 *         contracts at their existing addresses keep operating; the
 *         frontend routes new fund() calls to v3 once `addresses.ts`
 *         is updated.
 *
 *         Audit findings addressed:
 *           - SC-06: `rescueToken()` for misdirected ERC-20s (excludes USDC).
 *
 *         New surface area (vs v2):
 *           - `Escrow.released` — cumulative payout so far
 *           - `partialRelease(escrowId, amount)` — release a slice
 *           - `MilestoneReleased(escrowId, amount, totalReleasedAfter, feeSliced)`
 *             event
 *           - `remaining(escrowId)` view helper
 */
contract ForjEscrowV3 is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────

    enum Status {
        None,        // 0 — slot unused
        Funded,      // 1 — client deposited; may have partial releases
        Submitted,   // 2 — freelancer submitted work
        Released,    // 3 — fully paid out, terminal
        Refunded,    // 4 — fully refunded to client, terminal
        Disputed,    // 5 — arbiter intervention pending
        Resolved     // 6 — arbiter split, terminal
    }

    /**
     * @dev v3 adds `released` so partial payouts are tracked per-escrow.
     *      The invariant is: `released <= amount` at all times. When
     *      `released == amount`, status flips to Released.
     */
    struct Escrow {
        address client;
        address freelancer;
        uint128 amount;            // base agreed amount
        uint128 clientFee;         // absolute USDC deposited as client-side fee
        uint128 released;          // cumulative paid out via partialRelease (v3 new)
        uint16  freelancerFeeBps;
        uint64  fundedAt;
        uint64  submittedAt;
        uint64  deliveryDeadline;
        uint64  autoReleaseAt;
        Status  status;
    }

    // ─────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────

    IERC20  public immutable usdc;
    address public feeRecipient;
    uint16  public defaultClientFeeBps;
    uint16  public defaultFreelancerFeeBps;
    uint64  public autoReleaseWindow;
    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) public escrows;

    // ─────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────

    uint16  public constant MAX_FEE_BPS = 1_000;
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
        uint256 clientFee,
        uint16  freelancerFeeBps,
        uint64  deliveryDeadline
    );
    event WorkSubmitted(uint256 indexed escrowId, uint64 autoReleaseAt);
    event RevisionRequested(uint256 indexed escrowId);
    event Released(
        uint256 indexed escrowId,
        address indexed freelancer,
        uint256 freelancerAmount,
        uint256 totalFee
    );
    /**
     * @dev Emitted on each `partialRelease` call. `totalReleasedAfter` is
     *      the running cumulative — frontends compute "remaining" as
     *      `amount - totalReleasedAfter`.
     */
    event MilestoneReleased(
        uint256 indexed escrowId,
        address indexed freelancer,
        uint256 milestoneAmount,
        uint256 totalReleasedAfter,
        uint256 feeSliced
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
    event DefaultFeesUpdated(uint16 prevClient, uint16 nextClient, uint16 prevFreelancer, uint16 nextFreelancer);
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
    error AmountExceedsRemaining(uint256 remaining, uint256 requested);
    error CannotRescueUSDC();

    // ─────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────

    constructor(
        IERC20 usdc_,
        address feeRecipient_,
        uint16 defaultClientFeeBps_,
        uint16 defaultFreelancerFeeBps_,
        uint64 autoReleaseWindow_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (address(usdc_) == address(0) || feeRecipient_ == address(0) || initialOwner == address(0)) {
            revert InvalidAddress();
        }
        if (defaultClientFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh(defaultClientFeeBps_);
        if (defaultFreelancerFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh(defaultFreelancerFeeBps_);
        if (
            autoReleaseWindow_ < MIN_AUTO_RELEASE_WINDOW ||
            autoReleaseWindow_ > MAX_AUTO_RELEASE_WINDOW
        ) {
            revert WindowOutOfRange(autoReleaseWindow_);
        }

        usdc = usdc_;
        feeRecipient = feeRecipient_;
        defaultClientFeeBps = defaultClientFeeBps_;
        defaultFreelancerFeeBps = defaultFreelancerFeeBps_;
        autoReleaseWindow = autoReleaseWindow_;
        nextEscrowId = 1;
    }

    // ─────────────────────────────────────────────────────────────────
    // Mutations: lifecycle
    // ─────────────────────────────────────────────────────────────────

    function fund(
        address freelancer,
        uint128 amount,
        uint64 deliveryDeadline
    ) external whenNotPaused nonReentrant returns (uint256 escrowId) {
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deliveryDeadline <= block.timestamp) revert InvalidDeadline();

        uint128 clientFee = uint128((uint256(amount) * defaultClientFeeBps) / 10_000);
        uint256 totalIn = uint256(amount) + uint256(clientFee);

        escrowId = nextEscrowId++;
        escrows[escrowId] = Escrow({
            client: msg.sender,
            freelancer: freelancer,
            amount: amount,
            clientFee: clientFee,
            released: 0,
            freelancerFeeBps: defaultFreelancerFeeBps,
            fundedAt: uint64(block.timestamp),
            submittedAt: 0,
            deliveryDeadline: deliveryDeadline,
            autoReleaseAt: 0,
            status: Status.Funded
        });

        usdc.safeTransferFrom(msg.sender, address(this), totalIn);

        emit EscrowFunded(
            escrowId,
            msg.sender,
            freelancer,
            amount,
            clientFee,
            defaultFreelancerFeeBps,
            deliveryDeadline
        );
    }

    function quoteFund(uint128 amount) external view returns (uint256 totalIn, uint256 clientFee) {
        clientFee = (uint256(amount) * defaultClientFeeBps) / 10_000;
        totalIn = uint256(amount) + clientFee;
    }

    function submitWork(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded) revert InvalidStatus(Status.Funded, e.status);
        if (msg.sender != e.freelancer) revert NotFreelancer();

        e.status = Status.Submitted;
        e.submittedAt = uint64(block.timestamp);
        e.autoReleaseAt = uint64(block.timestamp) + autoReleaseWindow;

        emit WorkSubmitted(escrowId, e.autoReleaseAt);
    }

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
     * @notice Full release — pays out everything remaining + final fee.
     *         Identical to v2 semantics: from Funded or Submitted state.
     */
    function release(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded && e.status != Status.Submitted) {
            revert InvalidStatus(Status.Submitted, e.status);
        }
        if (msg.sender != e.client) revert NotClient();

        _releaseRemainder(escrowId, e);
    }

    /**
     * @notice **Phase 7B — milestone partial release.** Client approves a
     *         slice (`milestoneAmount`) instead of releasing the entire
     *         escrow. Pays out:
     *           - to freelancer: `milestoneAmount - (milestoneAmount * freelancerFeeBps / 10_000)`
     *           - to feeRecipient: freelancerCut + proportional slice of clientFee
     *
     *         The proportional clientFee slice is computed as
     *         `clientFee * milestoneAmount / amount`. If you partial-release
     *         half the work, half the client fee gets disbursed; the rest
     *         stays in the escrow against future partial releases.
     *
     *         When `released + milestoneAmount == amount`, the escrow flips
     *         to `Released` (terminal). Until then it stays in its current
     *         state (Funded or Submitted) so further partials are allowed.
     *
     *         Revision flow: a client who has done some partials and then
     *         wants changes can still call `requestRevision` from
     *         Submitted state — it flips back to Funded without
     *         affecting prior payouts.
     */
    function partialRelease(uint256 escrowId, uint128 milestoneAmount) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded && e.status != Status.Submitted) {
            revert InvalidStatus(Status.Submitted, e.status);
        }
        if (msg.sender != e.client) revert NotClient();
        if (milestoneAmount == 0) revert InvalidAmount();

        uint256 remainingBase = uint256(e.amount) - uint256(e.released);
        if (milestoneAmount > remainingBase) {
            revert AmountExceedsRemaining(remainingBase, milestoneAmount);
        }

        // Per-slice math. Done in uint256 to avoid intermediate overflow
        // even at the max uint128 amount.
        uint256 freelancerCut = (uint256(milestoneAmount) * e.freelancerFeeBps) / 10_000;
        // Proportional clientFee. Multiplied first to preserve precision
        // for small milestoneAmount / amount ratios.
        uint256 clientFeeSlice = (uint256(milestoneAmount) * uint256(e.clientFee)) / uint256(e.amount);
        uint256 toFreelancer = uint256(milestoneAmount) - freelancerCut;
        uint256 totalFee = freelancerCut + clientFeeSlice;

        // Update storage BEFORE external calls.
        e.released = uint128(uint256(e.released) + milestoneAmount);
        // Reduce clientFee balance so future slices can't over-disburse.
        e.clientFee = uint128(uint256(e.clientFee) - clientFeeSlice);

        // If we've now released the full amount, terminal.
        if (uint256(e.released) == uint256(e.amount)) {
            e.status = Status.Released;
            // Roll any remaining clientFee dust into the final fee sweep
            // so contract balance for this escrow returns to zero.
            if (e.clientFee > 0) {
                totalFee += uint256(e.clientFee);
                e.clientFee = 0;
            }
        }

        if (totalFee > 0) usdc.safeTransfer(feeRecipient, totalFee);
        usdc.safeTransfer(e.freelancer, toFreelancer);

        emit MilestoneReleased(
            escrowId,
            e.freelancer,
            milestoneAmount,
            uint256(e.released),
            totalFee
        );
        // If terminal, also emit the v2-compatible Released event so
        // downstream consumers that only listen for Released still see it.
        if (e.status == Status.Released) {
            emit Released(escrowId, e.freelancer, toFreelancer, totalFee);
        }
    }

    function claimAfterTimeout(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Submitted) revert InvalidStatus(Status.Submitted, e.status);
        if (e.autoReleaseAt == 0 || block.timestamp < e.autoReleaseAt) {
            revert TooEarly(e.autoReleaseAt);
        }

        _releaseRemainder(escrowId, e);
    }

    /**
     * @notice Refund the un-released remainder back to the client.
     *
     * v3 semantics: refunds whatever hasn't been partially released yet,
     * INCLUDING any leftover clientFee. Once partial releases have begun,
     * a refund only returns the rest — you can't undo work already paid.
     */
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded) revert InvalidStatus(Status.Funded, e.status);
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParty();

        uint256 remainingBase = uint256(e.amount) - uint256(e.released);
        uint256 refundAmt = remainingBase + uint256(e.clientFee);

        e.status = Status.Refunded;
        e.amount = uint128(uint256(e.released)); // zero out base balance left in escrow
        e.clientFee = 0;

        usdc.safeTransfer(e.client, refundAmt);

        emit Refunded(escrowId, e.client, refundAmt);
    }

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
     * @notice Arbiter resolves a disputed escrow over the REMAINING balance
     *         (i.e. what hasn't been partially released yet, plus the
     *         remaining clientFee). Past partial releases stay paid out.
     */
    function resolveDispute(
        uint256 escrowId,
        uint256 toFreelancer,
        uint256 toClient,
        uint256 toFee
    ) external nonReentrant onlyOwner {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Disputed) revert InvalidStatus(Status.Disputed, e.status);

        uint256 remainingBase = uint256(e.amount) - uint256(e.released);
        uint256 totalHeld = remainingBase + uint256(e.clientFee);
        uint256 sum = toFreelancer + toClient + toFee;
        if (sum != totalHeld) revert SplitMismatch(totalHeld, sum);

        e.status = Status.Resolved;
        e.amount = uint128(uint256(e.released));
        e.clientFee = 0;

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

    function setDefaultFees(uint16 clientBps, uint16 freelancerBps) external onlyOwner {
        if (clientBps > MAX_FEE_BPS) revert FeeTooHigh(clientBps);
        if (freelancerBps > MAX_FEE_BPS) revert FeeTooHigh(freelancerBps);
        emit DefaultFeesUpdated(defaultClientFeeBps, clientBps, defaultFreelancerFeeBps, freelancerBps);
        defaultClientFeeBps = clientBps;
        defaultFreelancerFeeBps = freelancerBps;
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

    /**
     * @notice Rescue tokens accidentally sent to this contract. Excludes
     *         USDC by design — the protocol's settlement token is held
     *         on behalf of users and only the lifecycle paths may move it.
     */
    function rescueToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(usdc)) revert CannotRescueUSDC();
        if (to == address(0)) revert InvalidAddress();
        token.safeTransfer(to, amount);
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

    /**
     * @notice How much base amount is still un-released. Frontends use this
     *         to render "remaining" against the bar / progress widget.
     */
    function remaining(uint256 escrowId) external view returns (uint256) {
        Escrow storage e = escrows[escrowId];
        return uint256(e.amount) - uint256(e.released);
    }

    // ─────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────

    function _mustExist(uint256 escrowId) private view returns (Escrow storage e) {
        e = escrows[escrowId];
        if (e.status == Status.None) revert InvalidStatus(Status.Funded, Status.None);
    }

    /**
     * @dev Release-everything-remaining helper. Shared between `release()`
     *      (client approval) and `claimAfterTimeout()` (auto-release).
     *      Computes pro-rated fees over whatever's left.
     */
    function _releaseRemainder(uint256 escrowId, Escrow storage e) private {
        uint256 remainingBase = uint256(e.amount) - uint256(e.released);
        uint256 freelancerCut = (remainingBase * e.freelancerFeeBps) / 10_000;
        uint256 toFreelancer = remainingBase - freelancerCut;
        // Sweep all remaining clientFee — partial releases may have left
        // a dust amount here that we should disburse with the final cut.
        uint256 totalFee = freelancerCut + uint256(e.clientFee);

        e.status = Status.Released;
        e.released = e.amount; // mark fully released
        e.clientFee = 0;
        // We keep `amount` as-is for historical lookup; the source of
        // truth for "is this escrow paid out" is `status === Released`.

        if (totalFee > 0) usdc.safeTransfer(feeRecipient, totalFee);
        usdc.safeTransfer(e.freelancer, toFreelancer);

        emit Released(escrowId, e.freelancer, toFreelancer, totalFee);
    }
}
