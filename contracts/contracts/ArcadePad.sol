// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FeeVault} from "./FeeVault.sol";
import {IPonsCurve, IPonsFactoryV2, IPonsFeeEscrow, IPonsLaunchForwarder} from "./interfaces/IPonsV2.sol";

/**
 * ARCADE PAD — launch a token, launch a game.
 *
 * A launch creates a Pons V2 token (Robinhood Chain) and a cabinet: one of
 * the pad's arcade games, skinned with the token. The token's creator fees
 * — the share Pons pays the creator on every trade — do not go to the
 * creator directly. They go to a FeeVault deployed for that token, and
 * `collect()` splits them three ways:
 *
 *   pad        10 %        (PAD_BPS, fixed)
 *   pot        potBps      (chosen at launch, 10 – 90 %)
 *   creator    the rest
 *
 * The pot is the cabinet's prize. Rounds last `roundLength`; the highest
 * score posted during a round takes the whole pot when the round is
 * settled, and the next round starts on the same schedule. No score →
 * the pot rolls over.
 *
 * A score is a referee-signed message (EIP-712). The referee replays the
 * run tick by tick with the same code the browser ran and signs only what
 * it reproduced; the contract checks the signature, that the score beats
 * the round's best, and that the player holds a sliver of the token.
 * Bots can play — the referee proves a run happened, not who played it.
 *
 * Everything is pull-payment: winners, creators and the pad withdraw
 * their `claimable` balance themselves.
 */
contract ArcadePad is Ownable2Step, ReentrancyGuard, EIP712 {
    // ───────────────────────────────────────────── constants ──

    uint16 public constant BPS = 10_000;
    /// The pad's cut of every collected fee.
    uint16 public constant PAD_BPS = 1_000;
    uint16 public constant MIN_POT_BPS = 1_000;
    uint16 public constant MAX_POT_BPS = 9_000;
    uint32 public constant MIN_ROUND = 1 days;
    uint32 public constant MAX_ROUND = 30 days;
    /// Hold at least this fraction of the launch supply to post a score
    /// (0.01 % — 100 000 tokens of a 1 000 000 000 supply).
    uint16 public constant HOLD_BPS = 1;
    /// Only ETH-paired launches, configId 0 (Pons' only config today).
    uint256 public constant LAUNCH_CONFIG_ID = 0;

    bytes32 public constant SCORE_TYPEHASH =
        keccak256("Score(address cabinet,address player,uint256 round,uint256 score,uint256 deadline)");

    // ───────────────────────────────────────────── storage ──

    IPonsFactoryV2 public immutable factory;
    IPonsLaunchForwarder public immutable forwarder;
    IPonsFeeEscrow public immutable escrow;
    /// Number of games in the site's cabinet row; a launch picks 0..gameCount-1.
    uint8 public immutable gameCount;

    /// Signs scores. Rotatable by the owner if the key is ever lost.
    address public referee;
    /// Receives the pad's cut.
    address public treasury;

    struct Cabinet {
        address token;
        address curve;
        address vault;
        address creator;
        uint8 game;
        uint16 potBps;
        uint32 roundLength;
        uint64 launchedAt;
        uint64 roundStart;
        uint32 round;
        uint256 pot;
        uint256 bestScore;
        address bestPlayer;
        uint256 collected;
        uint256 paidOut;
        uint256 minHold;
    }

    struct LaunchInput {
        string name;
        string symbol;
        string logo;
        string description;
        string[5] socials;
        uint16 creatorTaxBps;
        uint8 game;
        uint16 potBps;
        uint32 roundLength;
        uint256 buyAmount;
        uint256 minTokensOut;
    }

    mapping(address token => Cabinet) private _cabinets;
    mapping(address vault => address token) public tokenOfVault;
    address[] private _tokens;
    /// Pull payments: winners, creators, the treasury.
    mapping(address account => uint256) public claimable;

    // ───────────────────────────────────────────── events ──

    event CabinetLaunched(
        address indexed token,
        address indexed creator,
        address curve,
        address vault,
        uint8 game,
        uint16 potBps,
        uint32 roundLength,
        string symbol,
        uint256 buyAmount
    );
    event FeesCollected(address indexed token, uint256 amount, uint256 toPot, uint256 toCreator, uint256 toPad);
    event HighScore(address indexed token, uint32 indexed round, address indexed player, uint256 score);
    event RoundSettled(address indexed token, uint32 indexed round, address indexed winner, uint256 score, uint256 prize);
    event Withdrawn(address indexed account, uint256 amount);
    event RefereeChanged(address indexed referee);
    event TreasuryChanged(address indexed treasury);

    // ───────────────────────────────────────────── errors ──

    error ZeroAddress();
    error UnknownGame(uint8 game);
    error PotOutOfRange(uint16 potBps);
    error RoundOutOfRange(uint32 roundLength);
    error TaxTooHigh(uint16 creatorTaxBps);
    error WrongValue(uint256 expected, uint256 sent);
    error UnknownCabinet(address token);
    error NotAVault(address caller);
    error NotAHighScore(uint256 score, uint256 best);
    error NotAHolder(uint256 balance, uint256 minHold);
    error ScoreExpired(uint256 deadline);
    error BadSignature();
    error NothingToWithdraw();
    error PayFailed();

    // ───────────────────────────────────────────── setup ──

    constructor(IPonsFactoryV2 factory_, address referee_, address treasury_, address owner_, uint8 gameCount_)
        Ownable(owner_)
        EIP712("ArcadePad", "1")
    {
        if (address(factory_) == address(0) || referee_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (gameCount_ == 0) revert UnknownGame(0);
        factory = factory_;
        forwarder = IPonsLaunchForwarder(factory_.launchForwarder());
        escrow = IPonsFeeEscrow(factory_.feeEscrow());
        if (address(forwarder) == address(0) || address(escrow) == address(0)) revert ZeroAddress();
        referee = referee_;
        treasury = treasury_;
        gameCount = gameCount_;
    }

    function setReferee(address referee_) external onlyOwner {
        if (referee_ == address(0)) revert ZeroAddress();
        referee = referee_;
        emit RefereeChanged(referee_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    // ───────────────────────────────────────────── launch ──

    /**
     * Launch a token with a cabinet. Send `launchFee() + buyAmount` wei.
     * With buyAmount > 0 the launch goes through Pons' forwarder, which
     * buys the first tokens for the caller before anyone else can (the
     * caller is exempt from the snipe tax). With buyAmount = 0 the token is
     * simply created.
     */
    function launch(LaunchInput calldata input) external payable nonReentrant returns (address token, address curve, address vault) {
        if (input.game >= gameCount) revert UnknownGame(input.game);
        if (input.potBps < MIN_POT_BPS || input.potBps > MAX_POT_BPS) revert PotOutOfRange(input.potBps);
        if (input.roundLength < MIN_ROUND || input.roundLength > MAX_ROUND) revert RoundOutOfRange(input.roundLength);
        if (input.creatorTaxBps > factory.maxCreatorTaxBps()) revert TaxTooHigh(input.creatorTaxBps);
        uint256 fee = factory.launchFee();
        if (msg.value != fee + input.buyAmount) revert WrongValue(fee + input.buyAmount, msg.value);

        FeeVault v = new FeeVault(escrow);
        vault = address(v);

        IPonsFactoryV2.LaunchParams memory params = IPonsFactoryV2.LaunchParams({
            name: input.name,
            symbol: input.symbol,
            logo: input.logo,
            description: input.description,
            socials: IPonsFactoryV2.Socials({
                x: input.socials[0],
                telegram: input.socials[1],
                website: input.socials[2],
                discord: input.socials[3],
                extra: input.socials[4]
            }),
            creatorFeeRecipient: vault,
            creatorTaxBps: input.creatorTaxBps,
            buybackEnabled: true,
            economicsHash: factory.previewLaunchEconomics(LAUNCH_CONFIG_ID, address(0)),
            salt: keccak256(abi.encode("arcadepad", msg.sender, _tokens.length, input.symbol))
        });

        if (input.buyAmount > 0) {
            address[] memory exempt = new address[](0);
            (token, curve) = forwarder.launchAndBuy{value: msg.value}(
                params, LAUNCH_CONFIG_ID, address(0), input.buyAmount, input.minTokensOut, msg.sender, exempt
            );
        } else {
            address[] memory exempt = new address[](1);
            exempt[0] = msg.sender;
            (token, curve) = factory.launchToken{value: msg.value}(params, LAUNCH_CONFIG_ID, address(0), exempt);
        }

        uint256 supply = IPonsCurve(curve).launchSupply();
        Cabinet storage c = _cabinets[token];
        c.token = token;
        c.curve = curve;
        c.vault = vault;
        c.creator = msg.sender;
        c.game = input.game;
        c.potBps = input.potBps;
        c.roundLength = input.roundLength;
        c.launchedAt = uint64(block.timestamp);
        c.roundStart = uint64(block.timestamp);
        c.round = 1;
        c.minHold = (supply * HOLD_BPS) / BPS;
        tokenOfVault[vault] = token;
        _tokens.push(token);

        emit CabinetLaunched(token, msg.sender, curve, vault, input.game, input.potBps, input.roundLength, input.symbol, input.buyAmount);
    }

    // ───────────────────────────────────────────── fees ──

    /// Anyone. Pulls the token's swept creator fees from Pons' escrow into
    /// the pot / creator / pad split. Reverts with NothingToCollect() when
    /// there is nothing swept yet (fees accrue on the curve first; Pons
    /// sweeps them to the escrow).
    function collect(address token) external nonReentrant returns (uint256 amount) {
        Cabinet storage c = _cabinet(token);
        return FeeVault(payable(c.vault)).collect();
    }

    /// Only a vault. Splits what it forwards. A round that is over is
    /// settled first, so fees swept after the bell go to the next pot.
    function deposit() external payable {
        address token = tokenOfVault[msg.sender];
        if (token == address(0)) revert NotAVault(msg.sender);
        Cabinet storage c = _cabinets[token];
        _settleIfDue(c);
        uint256 toPad = (msg.value * PAD_BPS) / BPS;
        uint256 toPot = (msg.value * c.potBps) / BPS;
        uint256 toCreator = msg.value - toPad - toPot;
        c.pot += toPot;
        c.collected += msg.value;
        claimable[treasury] += toPad;
        claimable[c.creator] += toCreator;
        emit FeesCollected(token, msg.value, toPot, toCreator, toPad);
    }

    // ───────────────────────────────────────────── scores ──

    /**
     * Post a referee-signed score. Anyone may submit it (the signature
     * names the player). The round in the signature must be the cabinet's
     * current round — after a settlement the referee signs again.
     */
    function postScore(address token, address player, uint256 score, uint256 deadline, bytes calldata signature)
        external
    {
        Cabinet storage c = _cabinet(token);
        _settleIfDue(c);
        if (block.timestamp > deadline) revert ScoreExpired(deadline);
        if (score <= c.bestScore) revert NotAHighScore(score, c.bestScore);
        uint256 balance = IERC20(token).balanceOf(player);
        if (balance < c.minHold) revert NotAHolder(balance, c.minHold);
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(SCORE_TYPEHASH, token, player, uint256(c.round), score, deadline))
        );
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != referee) revert BadSignature();
        c.bestScore = score;
        c.bestPlayer = player;
        emit HighScore(token, c.round, player, score);
    }

    /// Anyone, once the round is over: pays the pot to the round's best
    /// player (as a claimable balance) and opens the next round. Without
    /// a score the pot rolls over.
    function settle(address token) external {
        Cabinet storage c = _cabinet(token);
        _settleIfDue(c);
    }

    function _settleIfDue(Cabinet storage c) private {
        uint256 end = uint256(c.roundStart) + c.roundLength;
        if (block.timestamp < end) return;
        uint256 prize = 0;
        if (c.bestPlayer != address(0)) {
            prize = c.pot;
            c.pot = 0;
            c.paidOut += prize;
            claimable[c.bestPlayer] += prize;
        }
        emit RoundSettled(c.token, c.round, c.bestPlayer, c.bestScore, prize);
        // Keep the schedule: the new round starts on the bell that rang, not now.
        uint256 elapsed = block.timestamp - c.roundStart;
        c.roundStart += uint64((elapsed / c.roundLength) * c.roundLength);
        c.round += 1;
        c.bestScore = 0;
        c.bestPlayer = address(0);
    }

    // ───────────────────────────────────────────── payouts ──

    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        claimable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert PayFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ───────────────────────────────────────────── views ──

    function cabinet(address token) external view returns (Cabinet memory) {
        return _cabinet(token);
    }

    function count() external view returns (uint256) {
        return _tokens.length;
    }

    function tokenAt(uint256 i) external view returns (address) {
        return _tokens[i];
    }

    /// Newest first. `offset` 0 is the latest launch.
    function page(uint256 offset, uint256 limit) external view returns (Cabinet[] memory out) {
        uint256 n = _tokens.length;
        if (offset >= n) return out;
        uint256 size = n - offset < limit ? n - offset : limit;
        out = new Cabinet[](size);
        for (uint256 i = 0; i < size; i++) {
            out[i] = _cabinets[_tokens[n - 1 - offset - i]];
        }
    }

    /// When the current round ends (unix seconds). The next call that
    /// touches the cabinet after this settles it.
    function roundEnd(address token) external view returns (uint256) {
        Cabinet storage c = _cabinet(token);
        return uint256(c.roundStart) + c.roundLength;
    }

    function dueForSettlement(address token) external view returns (bool) {
        Cabinet storage c = _cabinet(token);
        return block.timestamp >= uint256(c.roundStart) + c.roundLength;
    }

    /// What a collect() would move into the split right now.
    function collectable(address token) external view returns (uint256) {
        Cabinet storage c = _cabinet(token);
        return FeeVault(payable(c.vault)).collectable();
    }

    /// The digest a referee signs for (token, player, round, score, deadline).
    function scoreDigest(address token, address player, uint256 round, uint256 score, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(SCORE_TYPEHASH, token, player, round, score, deadline)));
    }

    function launchFee() external view returns (uint256) {
        return factory.launchFee();
    }

    function _cabinet(address token) private view returns (Cabinet storage c) {
        c = _cabinets[token];
        if (c.token == address(0)) revert UnknownCabinet(token);
    }
}
