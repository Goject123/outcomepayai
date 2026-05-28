// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

contract OutcomePayEscrow is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum Status {
        Created,
        Funded,
        ProofSubmitted,
        Released,
        Refunded,
        Disputed
    }

    enum VerificationResult {
        Unknown,
        Pass,
        Fail,
        Dispute
    }

    struct Settlement {
        address buyer;
        address provider;
        address token;
        uint256 amount;
        uint256 deadline;
        bytes32 intentHash;
        bytes32 proofHash;
        bytes32 verificationHash;
        VerificationResult verificationResult;
        Status status;
    }

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint256 public nextSettlementId = 1;
    mapping(uint256 settlementId => Settlement) private settlements;

    event SettlementCreated(
        uint256 indexed settlementId,
        address indexed buyer,
        address indexed provider,
        address token,
        uint256 amount,
        uint256 deadline,
        bytes32 intentHash
    );
    event EscrowFunded(uint256 indexed settlementId, address indexed buyer, uint256 amount);
    event ProofSubmitted(uint256 indexed settlementId, address indexed provider, bytes32 proofHash);
    event OutcomeVerified(uint256 indexed settlementId, VerificationResult result, bytes32 verificationHash);
    event PaymentReleased(uint256 indexed settlementId, address indexed provider, uint256 amount);
    event PaymentRefunded(uint256 indexed settlementId, address indexed buyer, uint256 amount);
    event DisputeRaised(uint256 indexed settlementId, bytes32 verificationHash);
    event OutcomeReceiptCreated(
        uint256 indexed settlementId,
        bytes32 intentHash,
        bytes32 proofHash,
        bytes32 verificationHash,
        Status finalStatus
    );

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidStatus(Status currentStatus);
    error UnauthorizedCaller();
    error DeadlineExpired();
    error DeadlineNotExpired();
    error MissingProof();
    error MissingVerification();

    constructor(address admin, address initialVerifier) {
        if (admin == address(0) || initialVerifier == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, initialVerifier);
    }

    function createSettlement(
        address provider,
        address token,
        uint256 amount,
        uint256 deadline,
        bytes32 intentHash
    ) external whenNotPaused returns (uint256 settlementId) {
        if (provider == address(0) || token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (intentHash == bytes32(0)) revert MissingProof();

        settlementId = nextSettlementId++;
        settlements[settlementId] = Settlement({
            buyer: msg.sender,
            provider: provider,
            token: token,
            amount: amount,
            deadline: deadline,
            intentHash: intentHash,
            proofHash: bytes32(0),
            verificationHash: bytes32(0),
            verificationResult: VerificationResult.Unknown,
            status: Status.Created
        });

        emit SettlementCreated(settlementId, msg.sender, provider, token, amount, deadline, intentHash);
    }

    function fundEscrow(uint256 settlementId) external nonReentrant whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        _requireStatus(settlement, Status.Created);
        if (msg.sender != settlement.buyer) revert UnauthorizedCaller();
        if (block.timestamp > settlement.deadline) revert DeadlineExpired();

        settlement.status = Status.Funded;
        IERC20(settlement.token).safeTransferFrom(settlement.buyer, address(this), settlement.amount);

        emit EscrowFunded(settlementId, settlement.buyer, settlement.amount);
    }

    function submitProof(uint256 settlementId, bytes32 proofHash) external whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        _requireStatus(settlement, Status.Funded);
        if (msg.sender != settlement.provider) revert UnauthorizedCaller();
        if (proofHash == bytes32(0)) revert MissingProof();
        if (block.timestamp > settlement.deadline) revert DeadlineExpired();

        settlement.proofHash = proofHash;
        settlement.status = Status.ProofSubmitted;

        emit ProofSubmitted(settlementId, settlement.provider, proofHash);
    }

    function recordVerification(
        uint256 settlementId,
        VerificationResult result,
        bytes32 verificationHash
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        _requireStatus(settlement, Status.ProofSubmitted);
        if (result == VerificationResult.Unknown) revert MissingVerification();
        if (verificationHash == bytes32(0)) revert MissingVerification();

        settlement.verificationResult = result;
        settlement.verificationHash = verificationHash;

        emit OutcomeVerified(settlementId, result, verificationHash);
    }

    function releasePayment(uint256 settlementId) external nonReentrant onlyRole(VERIFIER_ROLE) whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        _requireStatus(settlement, Status.ProofSubmitted);
        if (settlement.verificationResult != VerificationResult.Pass) revert MissingVerification();

        settlement.status = Status.Released;
        IERC20(settlement.token).safeTransfer(settlement.provider, settlement.amount);

        emit PaymentReleased(settlementId, settlement.provider, settlement.amount);
        emit OutcomeReceiptCreated(
            settlementId,
            settlement.intentHash,
            settlement.proofHash,
            settlement.verificationHash,
            settlement.status
        );
    }

    function refundBuyer(uint256 settlementId) external nonReentrant onlyRole(VERIFIER_ROLE) whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        if (settlement.status != Status.Funded && settlement.status != Status.ProofSubmitted) {
            revert InvalidStatus(settlement.status);
        }
        if (settlement.status == Status.ProofSubmitted && settlement.verificationResult != VerificationResult.Fail) {
            revert MissingVerification();
        }

        settlement.status = Status.Refunded;
        IERC20(settlement.token).safeTransfer(settlement.buyer, settlement.amount);

        emit PaymentRefunded(settlementId, settlement.buyer, settlement.amount);
        emit OutcomeReceiptCreated(
            settlementId,
            settlement.intentHash,
            settlement.proofHash,
            settlement.verificationHash,
            settlement.status
        );
    }

    function refundExpired(uint256 settlementId) external nonReentrant whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        if (settlement.status != Status.Funded) revert InvalidStatus(settlement.status);
        if (block.timestamp <= settlement.deadline) revert DeadlineNotExpired();

        settlement.status = Status.Refunded;
        IERC20(settlement.token).safeTransfer(settlement.buyer, settlement.amount);

        emit PaymentRefunded(settlementId, settlement.buyer, settlement.amount);
        emit OutcomeReceiptCreated(
            settlementId,
            settlement.intentHash,
            settlement.proofHash,
            settlement.verificationHash,
            settlement.status
        );
    }

    function raiseDispute(uint256 settlementId, bytes32 verificationHash) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        Settlement storage settlement = settlements[settlementId];
        _requireStatus(settlement, Status.ProofSubmitted);
        if (verificationHash == bytes32(0)) revert MissingVerification();

        settlement.status = Status.Disputed;
        settlement.verificationResult = VerificationResult.Dispute;
        settlement.verificationHash = verificationHash;

        emit DisputeRaised(settlementId, verificationHash);
        emit OutcomeReceiptCreated(
            settlementId,
            settlement.intentHash,
            settlement.proofHash,
            settlement.verificationHash,
            settlement.status
        );
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function getSettlement(uint256 settlementId) external view returns (Settlement memory) {
        return settlements[settlementId];
    }

    function _requireStatus(Settlement storage settlement, Status expectedStatus) private view {
        if (settlement.status != expectedStatus) revert InvalidStatus(settlement.status);
    }
}
