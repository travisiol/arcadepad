import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { ArcadePad, MockFeeEscrow, MockPonsFactory } from "../typechain-types";

const NO_SOCIALS: [string, string, string, string, string] = ["", "", "", "", ""];
const DAY = 24 * 3600;
const BPS = 10_000n;

const SCORE_TYPES = {
  Score: [
    { name: "cabinet", type: "address" },
    { name: "player", type: "address" },
    { name: "round", type: "uint256" },
    { name: "score", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

async function deploy() {
  const [owner, treasury, referee, creator, alice, bob, stranger] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("MockPonsFactory");
  const factory = (await Factory.deploy(stranger.address)) as unknown as MockPonsFactory;
  const escrow = (await ethers.getContractAt("MockFeeEscrow", await factory.feeEscrow())) as unknown as MockFeeEscrow;
  const Pad = await ethers.getContractFactory("ArcadePad");
  const pad = (await Pad.deploy(await factory.getAddress(), referee.address, treasury.address, owner.address, 4)) as unknown as ArcadePad;
  const fee = await factory.launchFee();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = { name: "ArcadePad", version: "1", chainId, verifyingContract: await pad.getAddress() };

  function input(over: Partial<ArcadePad.LaunchInputStruct> = {}): ArcadePad.LaunchInputStruct {
    return {
      name: "Pixel Coin",
      symbol: "PXL",
      logo: "ipfs://logo",
      description: "eat the token",
      socials: NO_SOCIALS,
      creatorTaxBps: 0,
      game: 0,
      potBps: 4000,
      roundLength: 7 * DAY,
      buyAmount: 0n,
      minTokensOut: 0n,
      ...over,
    };
  }

  async function sign(signer: typeof referee, cabinet: string, player: string, round: bigint | number, score: bigint | number, deadline: bigint | number) {
    return signer.signTypedData(domain, SCORE_TYPES, { cabinet, player, round, score, deadline });
  }

  return { owner, treasury, referee, creator, alice, bob, stranger, factory, escrow, pad, fee, domain, input, sign };
}

async function launched() {
  const f = await deploy();
  const buy = ethers.parseEther("0.05");
  const tx = await f.pad.connect(f.creator).launch(f.input({ buyAmount: buy }), { value: f.fee + buy });
  const receipt = await tx.wait();
  const token = await f.pad.tokenAt(0);
  const cab = await f.pad.cabinet(token);
  const curve = await ethers.getContractAt("MockCurve", cab.curve);
  const erc20 = await ethers.getContractAt("MockLaunchedToken", token);
  return { ...f, token, cab, curve, erc20, receipt, buy };
}

describe("ArcadePad", () => {
  describe("launch", () => {
    it("launches through the forwarder with a first buy, the vault as fee recipient", async () => {
      const f = await launched();
      expect(await f.pad.count()).to.equal(1n);
      expect(f.cab.token).to.equal(f.token);
      expect(f.cab.creator).to.equal(f.creator.address);
      expect(f.cab.game).to.equal(0);
      expect(f.cab.potBps).to.equal(4000);
      expect(f.cab.roundLength).to.equal(7 * DAY);
      expect(f.cab.round).to.equal(1);
      expect(f.cab.pot).to.equal(0n);
      // Pons pays creator fees to the vault, and only the vault.
      expect(await f.curve.deployer()).to.equal(f.cab.vault);
      expect(await f.pad.tokenOfVault(f.cab.vault)).to.equal(f.token);
      // The creator got the first tokens, not the pad.
      expect(await f.erc20.balanceOf(f.creator.address)).to.be.gt(0n);
      expect(await f.erc20.balanceOf(await f.pad.getAddress())).to.equal(0n);
      // 0.01 % of the supply to post a score.
      expect(f.cab.minHold).to.equal((await f.curve.launchSupply()) / BPS);
      const forwarder = await ethers.getContractAt("MockLaunchForwarder", await f.factory.launchForwarder());
      expect(await forwarder.lastBuyRecipient()).to.equal(f.creator.address);
      await expect(f.receipt).to.not.be.null;
    });

    it("emits CabinetLaunched", async () => {
      const f = await deploy();
      await expect(f.pad.connect(f.creator).launch(f.input(), { value: f.fee }))
        .to.emit(f.pad, "CabinetLaunched")
        .withArgs(
          (a: string) => ethers.isAddress(a),
          f.creator.address,
          (a: string) => ethers.isAddress(a),
          (a: string) => ethers.isAddress(a),
          0,
          4000,
          7 * DAY,
          "PXL",
          0n,
        );
    });

    it("launches without a first buy through the factory", async () => {
      const f = await deploy();
      await f.pad.connect(f.creator).launch(f.input({ game: 3 }), { value: f.fee });
      const token = await f.pad.tokenAt(0);
      const erc20 = await ethers.getContractAt("MockLaunchedToken", token);
      expect(await erc20.balanceOf(f.creator.address)).to.equal(0n);
      expect(await f.factory.lastLauncher()).to.equal(await f.pad.getAddress());
      expect((await f.pad.cabinet(token)).game).to.equal(3);
      // The token carries its metadata.
      expect(await erc20.logo()).to.equal("ipfs://logo");
    });

    it("refuses an unknown game, a pot or a round out of range, a tax too high, a wrong value", async () => {
      const f = await deploy();
      await expect(f.pad.launch(f.input({ game: 4 }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "UnknownGame").withArgs(4);
      await expect(f.pad.launch(f.input({ potBps: 999 }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "PotOutOfRange").withArgs(999);
      await expect(f.pad.launch(f.input({ potBps: 9001 }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "PotOutOfRange").withArgs(9001);
      await expect(f.pad.launch(f.input({ roundLength: DAY - 1 }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "RoundOutOfRange");
      await expect(f.pad.launch(f.input({ roundLength: 31 * DAY }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "RoundOutOfRange");
      await expect(f.pad.launch(f.input({ creatorTaxBps: 1001 }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "TaxTooHigh");
      await expect(f.pad.launch(f.input(), { value: f.fee - 1n })).to.be.revertedWithCustomError(f.pad, "WrongValue");
      await expect(f.pad.launch(f.input({ buyAmount: 1000n }), { value: f.fee })).to.be.revertedWithCustomError(f.pad, "WrongValue");
    });

    it("pages newest first", async () => {
      const f = await deploy();
      for (const symbol of ["AAA", "BBB", "CCC"]) await f.pad.connect(f.creator).launch(f.input({ symbol }), { value: f.fee });
      const page = await f.pad.page(0, 2);
      expect(page.length).to.equal(2);
      expect(page[0].token).to.equal(await f.pad.tokenAt(2));
      expect(page[1].token).to.equal(await f.pad.tokenAt(1));
      expect((await f.pad.page(2, 10)).length).to.equal(1);
      expect((await f.pad.page(3, 10)).length).to.equal(0);
    });
  });

  describe("fees", () => {
    it("splits collected fees pad / pot / creator", async () => {
      const f = await launched();
      const amount = ethers.parseEther("1");
      await f.escrow.credit(f.cab.vault, { value: amount });
      expect(await f.pad.collectable(f.token)).to.equal(amount);
      await expect(f.pad.connect(f.stranger).collect(f.token))
        .to.emit(f.pad, "FeesCollected")
        .withArgs(f.token, amount, (amount * 4000n) / BPS, (amount * 5000n) / BPS, (amount * 1000n) / BPS);
      const cab = await f.pad.cabinet(f.token);
      expect(cab.pot).to.equal((amount * 4000n) / BPS);
      expect(cab.collected).to.equal(amount);
      expect(await f.pad.claimable(f.treasury.address)).to.equal((amount * 1000n) / BPS);
      expect(await f.pad.claimable(f.creator.address)).to.equal((amount * 5000n) / BPS);
      expect(await f.pad.collectable(f.token)).to.equal(0n);
    });

    it("forwards ETH sent straight to the vault too, and refuses an empty collect", async () => {
      const f = await launched();
      await expect(f.pad.collect(f.token)).to.be.revertedWithCustomError(await ethers.getContractAt("FeeVault", f.cab.vault), "NothingToCollect");
      await f.alice.sendTransaction({ to: f.cab.vault, value: ethers.parseEther("0.2") });
      await f.pad.collect(f.token);
      expect((await f.pad.cabinet(f.token)).pot).to.equal(ethers.parseEther("0.08"));
    });

    it("only a vault can deposit", async () => {
      const f = await launched();
      await expect(f.pad.connect(f.alice).deposit({ value: 1n })).to.be.revertedWithCustomError(f.pad, "NotAVault");
    });

    it("pays creator and pad by withdraw()", async () => {
      const f = await launched();
      await f.escrow.credit(f.cab.vault, { value: ethers.parseEther("1") });
      await f.pad.collect(f.token);
      await expect(f.pad.connect(f.creator).withdraw()).to.changeEtherBalance(f.creator, ethers.parseEther("0.5"));
      await expect(f.pad.connect(f.treasury).withdraw()).to.changeEtherBalance(f.treasury, ethers.parseEther("0.1"));
      await expect(f.pad.connect(f.creator).withdraw()).to.be.revertedWithCustomError(f.pad, "NothingToWithdraw");
    });
  });

  describe("scores", () => {
    async function holder(f: Awaited<ReturnType<typeof launched>>, who: typeof f.alice, eth = "0.01") {
      const v = ethers.parseEther(eth);
      await f.curve.connect(who).buy(v, 0, who.address, { value: v });
      return who;
    }

    it("accepts a referee-signed high score from a holder", async () => {
      const f = await launched();
      await holder(f, f.alice);
      const deadline = (await time.latest()) + 600;
      const sig = await f.sign(f.referee, f.token, f.alice.address, 1, 4200, deadline);
      await expect(f.pad.connect(f.bob).postScore(f.token, f.alice.address, 4200, deadline, sig))
        .to.emit(f.pad, "HighScore")
        .withArgs(f.token, 1, f.alice.address, 4200);
      const cab = await f.pad.cabinet(f.token);
      expect(cab.bestScore).to.equal(4200n);
      expect(cab.bestPlayer).to.equal(f.alice.address);
      // The digest view matches what the referee signed.
      const digest = await f.pad.scoreDigest(f.token, f.alice.address, 1, 4200, deadline);
      expect(ethers.recoverAddress(digest, sig)).to.equal(f.referee.address);
    });

    it("refuses a score that does not beat the best, a non-holder, an expired or foreign signature, a wrong round", async () => {
      const f = await launched();
      await holder(f, f.alice);
      await holder(f, f.bob);
      const deadline = (await time.latest()) + 600;
      await f.pad.postScore(f.token, f.alice.address, 4200, deadline, await f.sign(f.referee, f.token, f.alice.address, 1, 4200, deadline));
      await expect(f.pad.postScore(f.token, f.bob.address, 4200, deadline, await f.sign(f.referee, f.token, f.bob.address, 1, 4200, deadline)))
        .to.be.revertedWithCustomError(f.pad, "NotAHighScore")
        .withArgs(4200, 4200);
      await expect(f.pad.postScore(f.token, f.bob.address, 4100, deadline, await f.sign(f.referee, f.token, f.bob.address, 1, 4100, deadline)))
        .to.be.revertedWithCustomError(f.pad, "NotAHighScore");
      await expect(f.pad.postScore(f.token, f.stranger.address, 5000, deadline, await f.sign(f.referee, f.token, f.stranger.address, 1, 5000, deadline)))
        .to.be.revertedWithCustomError(f.pad, "NotAHolder");
      await expect(f.pad.postScore(f.token, f.bob.address, 5000, deadline, await f.sign(f.owner, f.token, f.bob.address, 1, 5000, deadline)))
        .to.be.revertedWithCustomError(f.pad, "BadSignature");
      await expect(f.pad.postScore(f.token, f.bob.address, 5000, deadline, await f.sign(f.referee, f.token, f.bob.address, 2, 5000, deadline)))
        .to.be.revertedWithCustomError(f.pad, "BadSignature");
      // A signature for another cabinet or another score is just a bad signature.
      await expect(f.pad.postScore(f.token, f.bob.address, 5000, deadline, await f.sign(f.referee, f.token, f.bob.address, 1, 5001, deadline)))
        .to.be.revertedWithCustomError(f.pad, "BadSignature");
      const stale = (await time.latest()) - 1;
      await expect(f.pad.postScore(f.token, f.bob.address, 5000, stale, await f.sign(f.referee, f.token, f.bob.address, 1, 5000, stale)))
        .to.be.revertedWithCustomError(f.pad, "ScoreExpired");
      await expect(f.pad.postScore(f.stranger.address, f.bob.address, 5000, deadline, "0x")).to.be.revertedWithCustomError(f.pad, "UnknownCabinet");
    });

    it("needs exactly the minimum holding", async () => {
      const f = await launched();
      const min = f.cab.minHold;
      await f.erc20.connect(f.creator).transfer(f.bob.address, min - 1n);
      const deadline = (await time.latest()) + 600;
      await expect(f.pad.postScore(f.token, f.bob.address, 10, deadline, await f.sign(f.referee, f.token, f.bob.address, 1, 10, deadline)))
        .to.be.revertedWithCustomError(f.pad, "NotAHolder")
        .withArgs(min - 1n, min);
      await f.erc20.connect(f.creator).transfer(f.bob.address, 1n);
      await f.pad.postScore(f.token, f.bob.address, 10, deadline, await f.sign(f.referee, f.token, f.bob.address, 1, 10, deadline));
    });

    it("lets the owner rotate the referee", async () => {
      const f = await launched();
      await holder(f, f.alice);
      await expect(f.pad.connect(f.alice).setReferee(f.alice.address)).to.be.revertedWithCustomError(f.pad, "OwnableUnauthorizedAccount");
      await expect(f.pad.connect(f.owner).setReferee(f.bob.address)).to.emit(f.pad, "RefereeChanged").withArgs(f.bob.address);
      const deadline = (await time.latest()) + 600;
      await expect(f.pad.postScore(f.token, f.alice.address, 10, deadline, await f.sign(f.referee, f.token, f.alice.address, 1, 10, deadline)))
        .to.be.revertedWithCustomError(f.pad, "BadSignature");
      await f.pad.postScore(f.token, f.alice.address, 10, deadline, await f.sign(f.bob, f.token, f.alice.address, 1, 10, deadline));
    });
  });

  describe("rounds", () => {
    it("pays the pot to the round's best player at the bell and opens the next round", async () => {
      const f = await launched();
      const v = ethers.parseEther("0.01");
      await f.curve.connect(f.alice).buy(v, 0, f.alice.address, { value: v });
      await f.escrow.credit(f.cab.vault, { value: ethers.parseEther("1") });
      await f.pad.collect(f.token);
      const deadline = (await time.latest()) + 600;
      await f.pad.postScore(f.token, f.alice.address, 999, deadline, await f.sign(f.referee, f.token, f.alice.address, 1, 999, deadline));
      expect(await f.pad.dueForSettlement(f.token)).to.equal(false);
      const end = await f.pad.roundEnd(f.token);
      await time.increaseTo(end);
      expect(await f.pad.dueForSettlement(f.token)).to.equal(true);
      await expect(f.pad.connect(f.stranger).settle(f.token))
        .to.emit(f.pad, "RoundSettled")
        .withArgs(f.token, 1, f.alice.address, 999, ethers.parseEther("0.4"));
      const cab = await f.pad.cabinet(f.token);
      expect(cab.round).to.equal(2);
      expect(cab.pot).to.equal(0n);
      expect(cab.bestScore).to.equal(0n);
      expect(cab.bestPlayer).to.equal(ethers.ZeroAddress);
      expect(cab.paidOut).to.equal(ethers.parseEther("0.4"));
      expect(cab.roundStart).to.equal(end);
      expect(await f.pad.claimable(f.alice.address)).to.equal(ethers.parseEther("0.4"));
      await expect(f.pad.connect(f.alice).withdraw()).to.changeEtherBalance(f.alice, ethers.parseEther("0.4"));
      // Settling again does nothing until the next bell.
      await f.pad.settle(f.token);
      expect((await f.pad.cabinet(f.token)).round).to.equal(2);
    });

    it("rolls the pot over when nobody scored", async () => {
      const f = await launched();
      await f.escrow.credit(f.cab.vault, { value: ethers.parseEther("1") });
      await f.pad.collect(f.token);
      await time.increase(7 * DAY);
      await expect(f.pad.settle(f.token)).to.emit(f.pad, "RoundSettled").withArgs(f.token, 1, ethers.ZeroAddress, 0, 0);
      const cab = await f.pad.cabinet(f.token);
      expect(cab.round).to.equal(2);
      expect(cab.pot).to.equal(ethers.parseEther("0.4"));
    });

    it("settles lazily on the next score, so a round-1 signature dies with the round", async () => {
      const f = await launched();
      const v = ethers.parseEther("0.01");
      await f.curve.connect(f.alice).buy(v, 0, f.alice.address, { value: v });
      await time.increase(7 * DAY);
      const deadline = (await time.latest()) + 600;
      await expect(f.pad.postScore(f.token, f.alice.address, 5, deadline, await f.sign(f.referee, f.token, f.alice.address, 1, 5, deadline)))
        .to.be.revertedWithCustomError(f.pad, "BadSignature");
      await f.pad.postScore(f.token, f.alice.address, 5, deadline, await f.sign(f.referee, f.token, f.alice.address, 2, 5, deadline));
      expect((await f.pad.cabinet(f.token)).round).to.equal(2);
    });

    it("settles fees deposited after the bell into the next round", async () => {
      const f = await launched();
      const v = ethers.parseEther("0.01");
      await f.curve.connect(f.alice).buy(v, 0, f.alice.address, { value: v });
      await f.escrow.credit(f.cab.vault, { value: ethers.parseEther("1") });
      await f.pad.collect(f.token);
      const deadline = (await time.latest()) + 600;
      await f.pad.postScore(f.token, f.alice.address, 7, deadline, await f.sign(f.referee, f.token, f.alice.address, 1, 7, deadline));
      await time.increase(7 * DAY);
      await f.escrow.credit(f.cab.vault, { value: ethers.parseEther("1") });
      await f.pad.collect(f.token); // settles round 1 first
      expect(await f.pad.claimable(f.alice.address)).to.equal(ethers.parseEther("0.4"));
      const cab = await f.pad.cabinet(f.token);
      expect(cab.round).to.equal(2);
      expect(cab.pot).to.equal(ethers.parseEther("0.4"));
    });

    it("keeps the schedule across skipped rounds", async () => {
      const f = await launched();
      const start = f.cab.roundStart;
      await time.increaseTo(Number(start) + Math.floor(2.5 * 7 * DAY));
      await f.pad.settle(f.token);
      const cab = await f.pad.cabinet(f.token);
      expect(cab.round).to.equal(2);
      expect(cab.roundStart).to.equal(start + BigInt(2 * 7 * DAY));
    });
  });

  it("deploys with the right immutables and refuses a zero referee or treasury", async () => {
    const f = await deploy();
    expect(await f.pad.forwarder()).to.equal(await f.factory.launchForwarder());
    expect(await f.pad.escrow()).to.equal(await f.factory.feeEscrow());
    expect(await f.pad.gameCount()).to.equal(4);
    expect(await f.pad.owner()).to.equal(f.owner.address);
    expect(await f.pad.launchFee()).to.equal(f.fee);
    const Pad = await ethers.getContractFactory("ArcadePad");
    await expect(Pad.deploy(await f.factory.getAddress(), ethers.ZeroAddress, f.treasury.address, f.owner.address, 4)).to.be.revertedWithCustomError(f.pad, "ZeroAddress");
    await expect(Pad.deploy(await f.factory.getAddress(), f.referee.address, f.treasury.address, f.owner.address, 0)).to.be.revertedWithCustomError(f.pad, "UnknownGame");
    expect(network.name).to.equal("hardhat");
  });

  it("survives a fixture reload", async () => {
    const f = await loadFixture(deploy);
    expect(await f.pad.count()).to.equal(0n);
  });
});
