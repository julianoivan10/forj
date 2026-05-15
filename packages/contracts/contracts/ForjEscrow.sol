// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  ForjEscrow
 * @author Forj
 * @notice Two-sided escrow for off-chain freelance work, paid in USDC, with
 *         a **split platform fee**: the client pays a percentage on top of
 *         the agreed work amount, and the freelancer has a separate (smaller)
 *         percentage deducted from their payout at release. Both sides
 *         contribute to the platform fee — both sides feel "fair".
 *
 *         v2 of the WorkChain escrow. Same lifecycle, same dispute model;
 *         the only meaningful change vs v1 is the fee structure, plus the
 *         resulting bookkeeping that a refund must return the full
 *         (amount + clientFee) to the client.
 *
 *         Lifecycle:
 *           Created (off-chain) → Funded → Submitted → Released
 *                                                    ↘ Disputed → Resolved
 *                                       ↘ TimedOut → Released (claim) | Refunded
 *
 *         Funds custody:
 *           - Client approves USDC to this contract for `amount + clientFee`,
 *             then calls `fund()` which pulls the full deposit in one go.
 *           - The contract tracks the agreed `amount` and both fee bps
 *             separately, so each settlement path knows exactly which
 *             buckets to pay out.
 *           - Funds remain held until `release()`, `refund()`,
 *             `claimAfterTimeout()`, or `resolveDispute()` distributes them.
 *
 *         Settlement math (when `amount = $100`, `clientFee = 5%`,
 *         `freelancerFee = 2%`):
 *           Deposited at fund:      $105        (amount + clientFee)
 *           Released to freelancer: $98         (amount - freelancerFee)
 *           Released to platform:   $7          (clientFee + freelancerFee)
 *           Refunded to client:     $105        (full deposit)
 *
 *         Security model (unchanged from v1):
 *           - `nonReentrant` on every state-mutating + value-moving func.
 *           - `Ownable2Step` for arbiter / fee config — two-step prevents
 *             accidental misconfig.
 *           - `Pausable` on funding only — never blocks withdrawals.
 *           - `SafeERC20` for non-standard tokens.
 */
contract ForjEscrow is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────

    enum Status {
        None,        // 0 — slot unused
        Funded,      // 1 — client deposited
        Submitted,   // 2 — freelancer submitted, awaiting review
        Released,    // 3 — funds paid to freelancer
        Refunded,    // 4 — funds returned to client
        Disputed,    // 5 — arbiter intervention pending
        Resolved     // 6 — arbiter split the funds, terminal
    }

    /**
     * @dev The escrow holds three logical buckets:
     *        - `amount`     — the agreed work amount (what freelancer is
     *                          quoting + what client agreed to)
     *        - `clientFee`  — `amount * clientFeeBps / 10_000`, paid in by
     *                          the client on top of `amount`
     *        - `freelancerFeeBps` — applied at release time against `amount`
     *
     *      We store the absolute `clientFee` rather than re-deriving it on
     *      release so a future change to `defaultClientFeeBps` can never
     *      retroactively alter an already-funded escrow.
     */
    struct Escrow {
        address client;
        address freelancer;
        uint128 amount;            // base agreed amount (6-decimal USDC units)
        uint128 clientFee;         // absolute USDC deposited as the client-side fee
        uint16  freelancerFeeBps;  // freelancer-side fee, applied at release
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

    /// @notice Client-side fee bps applied at funding (paid on top of amount).
    uint16 public defaultClientFeeBps;
    /// @notice Freelancer-side fee bps deducted at release.
    uint16 public defaultFreelancerFeeBps;

    uint64  public autoReleaseWindow;
    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) public escrows;

    // ─────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────

    /// @dev Individual cap of 10% per side; combined cap is therefore 20%.
    ///      Generous to leave room for tier experiments without redeploy.
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

    /**
     * @notice Client funds an escrow. Pulls `amount + clientFee` USDC via
     *         `transferFrom` — caller must `approve(this, amount + clientFee)`
     *         first. Use `quoteFund()` to compute the right approval value.
     * @return escrowId Newly assigned id.
     */
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

    /**
     * @notice Convenience view for clients: how much USDC do I need to
     *         approve before calling `fund(amount, …)` ?
     */
    function quoteFund(uint128 amount) external view returns (uint256 totalIn, uint256 clientFee) {
        clientFee = (uint256(amount) * defaultClientFeeBps) / 10_000;
        totalIn = uint256(amount) + clientFee;
    }

    /**
     * @notice Freelancer marks work as submitted. Starts the auto-release
     *         clock so the client can no longer hold funds indefinitely.
     */
    function submitWork(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded) revert InvalidStatus(Status.Funded, e.status);
        if (msg.sender != e.freelancer) revert NotFreelancer();

        e.status = Status.Submitted;
        e.submittedAt = uint64(block.timestamp);
        e.autoReleaseAt = uint64(block.timestamp) + autoReleaseWindow;

        emit WorkSubmitted(escrowId, e.autoReleaseAt);
    }

    /**
     * @notice Client asks for changes — flips state back to Funded and clears
     *         the auto-release clock so the freelancer must re-submit.
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
     * @notice Client approves the work; funds release to freelancer minus the
     *         freelancer-side fee. Platform takes the combined fee. Allowed
     *         from either Funded (early release) or Submitted state.
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
     *         can call; the client gets back the full `amount + clientFee`
     *         (no fee skimmed on cancellations).
     */
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Funded) revert InvalidStatus(Status.Funded, e.status);
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParty();

        e.status = Status.Refunded;
        uint256 refundAmt = uint256(e.amount) + uint256(e.clientFee);
        e.amount = 0;
        e.clientFee = 0;

        usdc.safeTransfer(e.client, refundAmt);

        emit Refunded(escrowId, e.client, refundAmt);
    }

    /**
     * @notice Either party can flag the escrow for arbiter resolution. Funds
     *         are frozen — only `resolveDispute` (owner-only) can move them.
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
     *         to the FULL deposit (amount + clientFee) since that's what the
     *         contract actually holds.
     */
    function resolveDispute(
        uint256 escrowId,
        uint256 toFreelancer,
        uint256 toClient,
        uint256 toFee
    ) external nonReentrant onlyOwner {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Disputed) revert InvalidStatus(Status.Disputed, e.status);

        uint256 totalHeld = uint256(e.amount) + uint256(e.clientFee);
        uint256 sum = toFreelancer + toClient + toFee;
        if (sum != totalHeld) revert SplitMismatch(totalHeld, sum);

        e.status = Status.Resolved;
        e.amount = 0;
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

    /**
     * @notice Update both default fee bps in one call so admin can't
     *         leave them inconsistent (e.g. set client to 10% then forget
     *         to set freelancer). Existing escrows are not affected —
     *         they snapshotted their fees at fund time.
     */
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
     * @dev Computes the freelancer payout + combined platform fee and
     *      moves USDC. The fee bucket is `clientFee + freelancerCut`
     *      (the latter is `amount * freelancerFeeBps / 10_000`).
     */
    function _releaseTo(uint256 escrowId, Escrow storage e) private {
        uint256 amount = uint256(e.amount);
        uint256 clientFee = uint256(e.clientFee);
        uint256 freelancerCut = (amount * e.freelancerFeeBps) / 10_000;
        uint256 toFreelancer = amount - freelancerCut;
        uint256 totalFee = clientFee + freelancerCut;

        e.status = Status.Released;
        e.amount = 0;
        e.clientFee = 0;

        if (totalFee > 0) usdc.safeTransfer(feeRecipient, totalFee);
        usdc.safeTransfer(e.freelancer, toFreelancer);

        emit Released(escrowId, e.freelancer, toFreelancer, totalFee);
    }
}
