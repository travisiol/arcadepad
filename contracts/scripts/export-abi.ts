import hre from "hardhat";
import { exportAbis } from "./lib/exportAbi";

/** Re-exports the ArcadePad and FeeVault ABIs to ../src/lib/abi. */
exportAbis(hre)
  .then(() => console.log("exported"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
