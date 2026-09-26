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
 * @notice USDC escrow for one freelance contract per escrow id, with an
 *         explicit on-chain lifecycle. Replaces ForjEscrow v2, whose client
 *         could refund unilaterally at any time and whose disputes had no
 *         bounds or deadline. v2 stays deployed and immutable; v3 is a new
 *         deployment, not an upgrade. There is no proxy.
 *
 *  Lifecycle (see docs/escrow/ESCROW-V3.md for the full matrix):
 *
 *    fund() ──► Funded ──submitWork──► Submitted ──release / review timeout──► Released
 *                 │  ▲                   │   │
 *                 │  └──submitWork── RevisionRequested ◄──requestRevision (≤ maxRevisions)
 *                 │                      │   │
 *                 │                      │   └──raiseDispute (client, in review) ──► Disputed
 *                 │                      └──raiseDispute (freelancer, before work deadline)
 *                 │                                                            │
 *                 ├──cancelByFreelancer (any active non-disputed state) ──► Refunded
 *                 └──refundAfterDeadline (client, work deadline missed) ──► Refunded
 *
 *    Disputed ──resolveDispute(shareBps) by arbiter before deadline──► Resolved
 *             └─resolveExpiredDispute() by anyone after deadline───► Resolved (50/50, no fee)
 *
 *  Money rules:
 *    - The client deposits amount + clientFee in one transferFrom.
 *    - Release pays freelancer amount − freelancerFee; the fee recipient
 *      gets clientFee + freelancerFee.
 *    - Every refund returns the full deposit; no fee is kept.
 *    - A dispute split applies fees only to the freelancer's share, so the
 *      fee recipient can never receive more than the fee agreed at funding.
 *
 *  Roles:
 *    owner    (Ownable2Step; intended: TimelockController behind a Safe)
 *             fee recipient, default fees, windows, revision cap, arbiter,
 *             guardian, unpause, rescue of non-USDC tokens. Changes apply
 *             to escrows funded afterwards only.
 *    arbiter  resolves disputes, bounded by the split rule, and only before
 *             the dispute deadline. Cannot be a party to the escrow.
 *    guardian can pause new funding. Cannot unpause or move funds.
 *    Pausing never blocks settlement, refunds, submissions or disputes.
 */
contract ForjEscrowV3 is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────

    enum Status {
        None,              // 0 — slot unused
        Funded,            // 1 — deposit held, waiting for the first delivery
        Submitted,         // 2 — delivery under client review
        RevisionRequested, // 3 — client asked for changes; waiting for a resubmission
        Disputed,          // 4 — frozen; only the arbiter (or the dispute timeout) settles
        Released,          // 5 — terminal: paid to freelancer
        Refunded,          // 6 — terminal: full deposit back to client
        Resolved           // 7 — terminal: dispute settled by split
    }

    enum RefundReason {
        FreelancerCancelled, // freelancer gave the deposit back
        DeadlineMissed       // no (re)submission before the work deadline
    }

    struct Escrow {
        // slot 0
        address client;
        uint64 fundedAt;
        uint16 freelancerFeeBps;
        uint8 maxRevisions;
        uint8 revisionCount;
        // slot 1
        address freelancer;
        uint64 workDeadline;   // (re)submission must happen by this time
        Status status;
        // slot 2
        uint128 amount;        // agreed work amount, USDC base units
        uint128 clientFee;     // fee deposited by the client on top of amount
        // slot 3
        uint64 reviewDeadline;  // while Submitted: client must act by this
        uint64 disputeDeadline; // while Disputed: arbiter must act by this
        uint32 reviewWindow;
        uint32 revisionWindow;
        uint32 disputeWindow;
        // slot 4
        bytes32 contractRef;   // off-chain contract id, unique per escrow
    }

    // ─────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;          // 10% per side
    uint16 public constant EXPIRED_DISPUTE_SHARE_BPS = 5_000;
    uint8 public constant MAX_REVISIONS_CAP = 5;
    uint128 public constant MIN_AMOUNT = 1_000_000;      // 1 USDC
    uint64 public constant MAX_DELIVERY_PERIOD = 365 days;
    uint32 public constant MIN_WINDOW = 1 days;
    uint32 public constant MAX_WINDOW = 30 days;
    uint32 public constant MIN_DISPUTE_WINDOW = 3 days;
    uint32 public constant MAX_DISPUTE_WINDOW = 60 days;

    // ─────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    address public feeRecipient;
    address public arbiter;
    address public guardian;

    uint16 public defaultClientFeeBps;
    uint16 public defaultFreelancerFeeBps;
    uint32 public reviewWindow;
    uint32 public revisionWindow;
    uint32 public disputeWindow;
    uint8 public maxRevisions;

    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) private _escrows;
    /// @dev keccak256(client, contractRef) → escrowId. Scoping the reference
    ///      to the funding client means nobody else can squat a contract's
    ///      reference and make the real client's fund() revert.
    mapping(bytes32 => uint256) private _escrowIdByKey;

    // ─────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────

    event EscrowFunded(
        uint256 indexed escrowId,
        bytes32 indexed contractRef,
        address indexed client,
        address freelancer,
        uint256 amount,
        uint256 clientFee,
        uint16 freelancerFeeBps,
        uint64 workDeadline,
        uint8 maxRevisions
    );
    event WorkSubmitted(uint256 indexed escrowId, uint8 submissionNumber, uint64 reviewDeadline);
    event RevisionRequested(uint256 indexed escrowId, uint8 revisionCount, uint64 workDeadline);
    event DisputeRaised(uint256 indexed escrowId, address indexed by, uint64 disputeDeadline);
    event Released(uint256 indexed escrowId, uint256 toFreelancer, uint256 toFee, bool byTimeout);
    event Refunded(uint256 indexed escrowId, uint256 toClient, RefundReason reason);
    event DisputeResolved(
        uint256 indexed escrowId,
        uint16 freelancerShareBps,
        uint256 toFreelancer,
        uint256 toClient,
        uint256 toFee,
        bool byTimeout
    );

    event ArbiterUpdated(address indexed previous, address indexed next);
    event GuardianUpdated(address indexed previous, address indexed next);
    event FeeRecipientUpdated(address indexed previous, address indexed next);
    event DefaultFeesUpdated(uint16 clientFeeBps, uint16 freelancerFeeBps);
    event WindowsUpdated(uint32 reviewWindow, uint32 revisionWindow, uint32 disputeWindow);
    event MaxRevisionsUpdated(uint8 maxRevisions);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReference();
    error DuplicateReference(bytes32 contractRef);
    error InvalidStatus(Status actual);
    error NotClient();
    error NotFreelancer();
    error NotParty();
    error NotArbiter();
    error NotGuardian();
    error ArbiterIsParty();
    error DeadlinePassed(uint64 deadline);
    error DeadlineNotReached(uint64 deadline);
    error RevisionLimitReached(uint8 maxRevisions);
    error FeeTooHigh(uint16 bps);
    error FeeAboveAcceptedLimit(uint16 currentBps, uint16 acceptedBps);
    error InvalidShare(uint16 bps);
    error WindowOutOfRange(uint32 seconds_);
    error RevisionCapOutOfRange(uint8 value);
    error UnsupportedToken();
    error CannotRescueUSDC();
    error RenounceDisabled();

    // ─────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────

    constructor(
        IERC20 usdc_,
        address initialOwner,
        address feeRecipient_,
        address arbiter_,
        address guardian_,
        uint16 clientFeeBps_,
        uint16 freelancerFeeBps_
    ) Ownable(initialOwner) {
        if (address(usdc_) == address(0) || feeRecipient_ == address(0) || arbiter_ == address(0)) {
            revert InvalidAddress();
        }
        usdc = usdc_;
        feeRecipient = feeRecipient_;
        arbiter = arbiter_;
        guardian = guardian_;
        _setDefaultFees(clientFeeBps_, freelancerFeeBps_);
        _setWindows(7 days, 7 days, 14 days);
        maxRevisions = 2;
        nextEscrowId = 1;

        emit ArbiterUpdated(address(0), arbiter_);
        emit GuardianUpdated(address(0), guardian_);
        emit FeeRecipientUpdated(address(0), feeRecipient_);
        emit MaxRevisionsUpdated(2);
    }

    // ─────────────────────────────────────────────────────────────────
    // Funding
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Client creates and funds an escrow in one call. Pulls
     *         `amount + clientFee`; approve that much first (`quoteFund`).
     * @param contractRef          Off-chain contract id (non-zero; unique per client).
     * @param maxClientFeeBps      Highest client fee the caller accepts.
     * @param maxFreelancerFeeBps  Highest freelancer fee agreed off-chain.
     *        Both limits stop a fee change landing between agreement and
     *        funding from being charged silently.
     */
    function fund(
        bytes32 contractRef,
        address freelancer,
        uint128 amount,
        uint64 deliveryDeadline,
        uint16 maxClientFeeBps,
        uint16 maxFreelancerFeeBps
    ) external whenNotPaused nonReentrant returns (uint256 escrowId) {
        if (contractRef == bytes32(0)) revert InvalidReference();
        bytes32 key = keccak256(abi.encode(msg.sender, contractRef));
        if (_escrowIdByKey[key] != 0) revert DuplicateReference(contractRef);
        if (freelancer == address(0) || freelancer == msg.sender) revert InvalidAddress();
        if (amount < MIN_AMOUNT) revert InvalidAmount();
        if (deliveryDeadline <= block.timestamp || deliveryDeadline > block.timestamp + MAX_DELIVERY_PERIOD) {
            revert InvalidDeadline();
        }
        uint16 clientFeeBps = defaultClientFeeBps;
        uint16 freelancerFeeBps = defaultFreelancerFeeBps;
        if (clientFeeBps > maxClientFeeBps) revert FeeAboveAcceptedLimit(clientFeeBps, maxClientFeeBps);
        if (freelancerFeeBps > maxFreelancerFeeBps) {
            revert FeeAboveAcceptedLimit(freelancerFeeBps, maxFreelancerFeeBps);
        }

        uint128 clientFee = uint128((uint256(amount) * clientFeeBps) / BPS);
        uint256 totalIn = uint256(amount) + clientFee;

        escrowId = nextEscrowId++;
        _escrowIdByKey[key] = escrowId;
        _escrows[escrowId] = Escrow({
            client: msg.sender,
            fundedAt: uint64(block.timestamp),
            freelancerFeeBps: freelancerFeeBps,
            maxRevisions: maxRevisions,
            revisionCount: 0,
            freelancer: freelancer,
            workDeadline: deliveryDeadline,
            status: Status.Funded,
            amount: amount,
            clientFee: clientFee,
            reviewDeadline: 0,
            disputeDeadline: 0,
            reviewWindow: reviewWindow,
            revisionWindow: revisionWindow,
            disputeWindow: disputeWindow,
            contractRef: contractRef
        });

        // Balance-delta check: rejects fee-on-transfer / rebasing tokens,
        // which would leave the escrow unable to pay out what it recorded.
        uint256 before = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), totalIn);
        if (usdc.balanceOf(address(this)) - before != totalIn) revert UnsupportedToken();

        emit EscrowFunded(
            escrowId,
            contractRef,
            msg.sender,
            freelancer,
            amount,
            clientFee,
            freelancerFeeBps,
            deliveryDeadline,
            maxRevisions
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // Work lifecycle
    // ─────────────────────────────────────────────────────────────────

    /// @notice Freelancer delivers (or re-delivers) before the work deadline.
    function submitWork(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (msg.sender != e.freelancer) revert NotFreelancer();
        if (e.status != Status.Funded && e.status != Status.RevisionRequested) revert InvalidStatus(e.status);
        if (block.timestamp > e.workDeadline) revert DeadlinePassed(e.workDeadline);

        e.status = Status.Submitted;
        e.reviewDeadline = uint64(block.timestamp) + e.reviewWindow;

        emit WorkSubmitted(escrowId, e.revisionCount + 1, e.reviewDeadline);
    }

    /// @notice Client asks for changes during review. Capped per escrow.
    function requestRevision(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (msg.sender != e.client) revert NotClient();
        if (e.status != Status.Submitted) revert InvalidStatus(e.status);
        if (block.timestamp > e.reviewDeadline) revert DeadlinePassed(e.reviewDeadline);
        if (e.revisionCount >= e.maxRevisions) revert RevisionLimitReached(e.maxRevisions);

        e.revisionCount += 1;
        e.status = Status.RevisionRequested;
        e.reviewDeadline = 0;
        e.workDeadline = uint64(block.timestamp) + e.revisionWindow;

        emit RevisionRequested(escrowId, e.revisionCount, e.workDeadline);
    }

    /// @notice Client approves and pays. Allowed any time before settlement
    ///         except during a dispute (paying early only helps the freelancer).
    function release(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (msg.sender != e.client) revert NotClient();
        if (e.status != Status.Funded && e.status != Status.Submitted && e.status != Status.RevisionRequested) {
            revert InvalidStatus(e.status);
        }
        _release(escrowId, e, false);
    }

    /// @notice Anyone can settle to the freelancer once the review window of
    ///         a submission has passed without a client decision.
    function releaseAfterReview(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Submitted) revert InvalidStatus(e.status);
        if (block.timestamp <= e.reviewDeadline) revert DeadlineNotReached(e.reviewDeadline);
        _release(escrowId, e, true);
    }

    // ─────────────────────────────────────────────────────────────────
    // Refunds — only two paths, both explicit
    // ─────────────────────────────────────────────────────────────────

    /// @notice Freelancer walks away and returns the whole deposit.
    function cancelByFreelancer(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (msg.sender != e.freelancer) revert NotFreelancer();
        if (e.status != Status.Funded && e.status != Status.Submitted && e.status != Status.RevisionRequested) {
            revert InvalidStatus(e.status);
        }
        _refund(escrowId, e, RefundReason.FreelancerCancelled);
    }

    /// @notice Client recovers the deposit when no (re)submission arrived
    ///         before the work deadline. Never available while work is under
    ///         review or disputed.
    function refundAfterDeadline(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (msg.sender != e.client) revert NotClient();
        if (e.status != Status.Funded && e.status != Status.RevisionRequested) revert InvalidStatus(e.status);
        if (block.timestamp <= e.workDeadline) revert DeadlineNotReached(e.workDeadline);
        _refund(escrowId, e, RefundReason.DeadlineMissed);
    }

    // ─────────────────────────────────────────────────────────────────
    // Disputes
    // ─────────────────────────────────────────────────────────────────

    /**
     * @notice Freeze the escrow for arbitration.
     *         Client: only while a submission is under review.
     *         Freelancer: only while a revision is outstanding and its
     *         deadline hasn't passed (e.g. to contest the revision request).
     */
    function raiseDispute(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (msg.sender == e.client) {
            if (e.status != Status.Submitted) revert InvalidStatus(e.status);
            if (block.timestamp > e.reviewDeadline) revert DeadlinePassed(e.reviewDeadline);
        } else if (msg.sender == e.freelancer) {
            if (e.status != Status.RevisionRequested) revert InvalidStatus(e.status);
            if (block.timestamp > e.workDeadline) revert DeadlinePassed(e.workDeadline);
        } else {
            revert NotParty();
        }

        e.status = Status.Disputed;
        e.reviewDeadline = 0;
        e.disputeDeadline = uint64(block.timestamp) + e.disputeWindow;

        emit DisputeRaised(escrowId, msg.sender, e.disputeDeadline);
    }

    /**
     * @notice Arbiter settles a dispute by choosing the freelancer's share
     *         of the work amount, in basis points. Fees apply to that share
     *         only, so 0 bps is a full refund (no fee) and 10,000 bps equals
     *         a normal release. The arbiter cannot route funds anywhere else.
     */
    function resolveDispute(uint256 escrowId, uint16 freelancerShareBps) external nonReentrant {
        if (msg.sender != arbiter) revert NotArbiter();
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Disputed) revert InvalidStatus(e.status);
        if (msg.sender == e.client || msg.sender == e.freelancer) revert ArbiterIsParty();
        if (block.timestamp > e.disputeDeadline) revert DeadlinePassed(e.disputeDeadline);
        if (freelancerShareBps > BPS) revert InvalidShare(freelancerShareBps);
        _split(escrowId, e, freelancerShareBps, true, false);
    }

    /**
     * @notice If the arbiter misses the dispute deadline, anyone can settle
     *         with an even split of the work amount and no platform fee — the
     *         platform, not the parties, bears the cost of its own inaction.
     */
    function resolveExpiredDispute(uint256 escrowId) external nonReentrant {
        Escrow storage e = _mustExist(escrowId);
        if (e.status != Status.Disputed) revert InvalidStatus(e.status);
        if (block.timestamp <= e.disputeDeadline) revert DeadlineNotReached(e.disputeDeadline);
        _split(escrowId, e, EXPIRED_DISPUTE_SHARE_BPS, false, true);
    }

    // ─────────────────────────────────────────────────────────────────
    // Administration
    // ─────────────────────────────────────────────────────────────────

    function pause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setArbiter(address next) external onlyOwner {
        if (next == address(0)) revert InvalidAddress();
        emit ArbiterUpdated(arbiter, next);
        arbiter = next;
    }

    /// @dev Zero disables the guardian; the owner can still pause.
    function setGuardian(address next) external onlyOwner {
        emit GuardianUpdated(guardian, next);
        guardian = next;
    }

    function setFeeRecipient(address next) external onlyOwner {
        if (next == address(0)) revert InvalidAddress();
        emit FeeRecipientUpdated(feeRecipient, next);
        feeRecipient = next;
    }

    function setDefaultFees(uint16 clientFeeBps_, uint16 freelancerFeeBps_) external onlyOwner {
        _setDefaultFees(clientFeeBps_, freelancerFeeBps_);
    }

    function setWindows(uint32 review, uint32 revision, uint32 dispute) external onlyOwner {
        _setWindows(review, revision, dispute);
    }

    function setMaxRevisions(uint8 next) external onlyOwner {
        if (next > MAX_REVISIONS_CAP) revert RevisionCapOutOfRange(next);
        maxRevisions = next;
        emit MaxRevisionsUpdated(next);
    }

    /// @notice Recover tokens sent here by mistake. Never the escrowed USDC.
    function rescueToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (address(token) == address(usdc)) revert CannotRescueUSDC();
        if (to == address(0)) revert InvalidAddress();
        token.safeTransfer(to, amount);
        emit TokenRescued(address(token), to, amount);
    }

    /// @dev Renouncing would strand the admin functions (fees, arbiter).
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ─────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    /// @notice Escrow funded by `client` for `contractRef`, or 0 if none.
    function escrowIdByRef(address client, bytes32 contractRef) external view returns (uint256) {
        return _escrowIdByKey[keccak256(abi.encode(client, contractRef))];
    }

    function quoteFund(uint128 amount) external view returns (uint256 totalIn, uint256 clientFee) {
        clientFee = (uint256(amount) * defaultClientFeeBps) / BPS;
        totalIn = uint256(amount) + clientFee;
    }

    // ─────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────

    function _mustExist(uint256 escrowId) private view returns (Escrow storage e) {
        e = _escrows[escrowId];
        if (e.status == Status.None) revert InvalidStatus(Status.None);
    }

    function _release(uint256 escrowId, Escrow storage e, bool byTimeout) private {
        uint256 amount = e.amount;
        uint256 freelancerFee = (amount * e.freelancerFeeBps) / BPS;
        uint256 toFreelancer = amount - freelancerFee;
        uint256 toFee = uint256(e.clientFee) + freelancerFee;

        e.status = Status.Released;
        e.reviewDeadline = 0;
        e.amount = 0;
        e.clientFee = 0;

        if (toFee > 0) usdc.safeTransfer(feeRecipient, toFee);
        usdc.safeTransfer(e.freelancer, toFreelancer);

        emit Released(escrowId, toFreelancer, toFee, byTimeout);
    }

    function _refund(uint256 escrowId, Escrow storage e, RefundReason reason) private {
        uint256 toClient = uint256(e.amount) + e.clientFee;

        e.status = Status.Refunded;
        e.reviewDeadline = 0;
        e.amount = 0;
        e.clientFee = 0;

        usdc.safeTransfer(e.client, toClient);

        emit Refunded(escrowId, toClient, reason);
    }

    function _split(uint256 escrowId, Escrow storage e, uint16 shareBps, bool feesApply, bool byTimeout) private {
        uint256 amount = e.amount;
        uint256 clientFee = e.clientFee;

        uint256 freelancerGross = (amount * shareBps) / BPS;
        uint256 freelancerFee = feesApply ? (freelancerGross * e.freelancerFeeBps) / BPS : 0;
        uint256 clientFeeKept = feesApply ? (clientFee * shareBps) / BPS : 0;

        uint256 toFreelancer = freelancerGross - freelancerFee;
        uint256 toFee = freelancerFee + clientFeeKept;
        uint256 toClient = (amount - freelancerGross) + (clientFee - clientFeeKept);

        e.status = Status.Resolved;
        e.disputeDeadline = 0;
        e.amount = 0;
        e.clientFee = 0;

        if (toFee > 0) usdc.safeTransfer(feeRecipient, toFee);
        if (toFreelancer > 0) usdc.safeTransfer(e.freelancer, toFreelancer);
        if (toClient > 0) usdc.safeTransfer(e.client, toClient);

        emit DisputeResolved(escrowId, shareBps, toFreelancer, toClient, toFee, byTimeout);
    }

    function _setDefaultFees(uint16 clientFeeBps_, uint16 freelancerFeeBps_) private {
        if (clientFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh(clientFeeBps_);
        if (freelancerFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh(freelancerFeeBps_);
        defaultClientFeeBps = clientFeeBps_;
        defaultFreelancerFeeBps = freelancerFeeBps_;
        emit DefaultFeesUpdated(clientFeeBps_, freelancerFeeBps_);
    }

    function _setWindows(uint32 review, uint32 revision, uint32 dispute) private {
        if (review < MIN_WINDOW || review > MAX_WINDOW) revert WindowOutOfRange(review);
        if (revision < MIN_WINDOW || revision > MAX_WINDOW) revert WindowOutOfRange(revision);
        if (dispute < MIN_DISPUTE_WINDOW || dispute > MAX_DISPUTE_WINDOW) revert WindowOutOfRange(dispute);
        reviewWindow = review;
        revisionWindow = revision;
        disputeWindow = dispute;
        emit WindowsUpdated(review, revision, dispute);
    }
}
