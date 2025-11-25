import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("ERC721Collectible", function () {
  let viem: any;
  let publicClient: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let nft: any;

  beforeEach(async () => {
    // 初始化 viem 和账户
    const network = await hre.network.connect();
    viem = network.viem;
    publicClient = await viem.getPublicClient();
    [owner, user1, user2] = await viem.getWalletClients();
    // 部署 NFT 合约
    nft = await viem.deployContract("ERC721Collectible", [], {
      client: { wallet: owner },
    });

    // 初始化
    await nft.write.initialize(["TestNFT", "TNFT"], {
      account: owner.account,
    });
  });

  it("Should deploy and initialize correctly", async () => {
    const name = await nft.read.name();
    const symbol = await nft.read.symbol();

    assert.equal(name, "TestNFT");
    assert.equal(symbol, "TNFT");
  });

  it("Should mint NFT with OPERATOR_ROLE", async () => {
    const tokenId = await nft.write.mint([user1.account.address], {
      account: owner.account,
    });

    await publicClient.waitForTransactionReceipt({ hash: tokenId });

    const tokenOwner = await nft.read.ownerOf([1n]);
    assert.equal(tokenOwner.toLowerCase(), user1.account.address.toLowerCase());
  });

  it("Should emit TokenMinted event", async () => {
    const tx = nft.write.mint([user1.account.address], {
      account: owner.account,
    });

    await viem.assertions.emitWithArgs(tx, nft, "TokenMinted", [
      user1.account.address,
      1n,
    ]);
  });

  it("Should increment token counter", async () => {
    await nft.write.mint([user1.account.address], { account: owner.account });
    await nft.write.mint([user2.account.address], { account: owner.account });

    const counter = await nft.read.getTokenCounter();
    assert.equal(counter, 2n);
  });

  it("Should support interface", async () => {
    // ERC721 interface ID: 0x80ac58cd
    const supportsERC721 = await nft.read.supportsInterface(["0x80ac58cd"]);
    assert.equal(supportsERC721, true);
  });

  it("Should grant and check roles", async () => {
    const OPERATOR_ROLE = await nft.read.OPERATOR_ROLE();
    const hasRole = await nft.read.hasRole([
      OPERATOR_ROLE,
      owner.account.address,
    ]);

    assert.equal(hasRole, true);
  });

  it("Should prevent non-operator from minting", async () => {
    await assert.rejects(
      async () => {
        await nft.write.mint([user1.account.address], {
          account: user1.account,
        });
      },
      (error: any) => {
        return error.message.includes("AccessControlUnauthorizedAccount");
      }
    );
  });
});

