require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    monad: {
      url: "https://rpc.monad.xyz",
      chainId: 143,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: "5G98MBTZA4GYHHKR6F3NYEZSR3D8XVRB93",
    customChains: [
      {
        network: "monad",
        chainId: 143,
        urls: {
          apiURL: "https://api.monadscan.com/api",
          browserURL: "https://monadscan.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};
