import React from "react";
import "./App.css";

import { useEffect, useState, useContext, createContext } from "react";

import { ChakraProvider } from "@chakra-ui/react";

import { ethers } from "ethers";
import { Web3Provider } from "@ethersproject/providers";
import { Web3ReactProvider, useWeb3React } from "@web3-react/core";
import { InjectedConnector } from "@web3-react/injected-connector";
import { formatEther, formatUnits, commify } from "@ethersproject/units";

import {
  Text,
  Image,
  Link,
  Badge,
  Flex,
  SimpleGrid,
  Heading,
  Button,
  VStack,
  Box,
  Input,
  Stat,
  StatLabel,
  StatNumber,
  SatHelpText,
  StatArrow,
  StatGroup,
  Table,
  Thead,
  Tbody,
  Tfoot,
  Tr,
  Th,
  Td,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import YEARN_V2_VAULT_ABI from "./abi/yearn-v2-vault.json";
import ERC20_ABI from "./abi/erc20.json";

window.ethers = ethers;

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
  var timeout;
  return function () {
    var context = this,
      args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

export const injectedConnector = new InjectedConnector({
  supportedChainIds: [
    1, // Mainet
    3, // Ropsten
    4, // Rinkeby
    5, // Goerli
    42, // Kovan
  ],
});

function getLibrary(provider) {
  let library = new Web3Provider(provider);
  library.pollingInterval = 12000;
  return library;
}

const AppContext = createContext();

function AppContextProvider({ children }) {
  const [account, setAccount] = useState(null);

  const defaultContext = {
    account,
    setAccount,
  };

  return (
    <AppContext.Provider value={defaultContext}>{children}</AppContext.Provider>
  );
}

function Wallet() {
  const {
    chainId,
    account: web3Account,
    activate,
    active,
    library,
  } = useWeb3React();
  const { account, setAccount } = useContext(AppContext);
  const onClick = () => {
    activate(injectedConnector);
  };

  const [inputAccount, setInputAccount] = useState(account || "");

  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (web3Account && !account) {
      setAccount(web3Account);
    }
  }, [web3Account, account]);

  useEffect(() => {
    if (account) {
      setInputAccount(account);
    }
  }, [account]);

  async function fetchBalance() {
    if (!!account && !!library) {
      let balance = await library.getBalance(account);
      setBalance(balance);
    }
  }

  useEffect(() => {
    fetchBalance();
  }, [account]);

  const handleInput = (e) => {
    let addr = e.target.value;
    setInputAccount(addr);

    if (ethers.utils.isAddress(addr)) {
      setAccount(addr);
    }
  };

  return (
    <Box w="100%">
      <Text color="gray.200" as="h2" fontWeight="bold" fontSize="xl">
        Address
        {active && (
          <Badge ml="2" colorScheme="green">
            connected
          </Badge>
        )}
      </Text>
      <Box
        color="gray.700"
        bgColor="gray.100"
        borderColor="gray.100"
        borderWidth="1px"
        borderRadius="lg"
        p="6"
        w="100%"
      >
        <VStack spacing="2" align="start">
          {active ? (
            <>
              <Input value={inputAccount} onChange={handleInput} />
              <SimpleGrid columns={2} spacing={6}>
                <Stat>
                  <StatLabel>Chain ID</StatLabel>
                  <StatNumber>{chainId}</StatNumber>
                </Stat>
                <Stat>
                  <StatLabel>Balance</StatLabel>
                  <StatNumber>{formatEther(balance)} ETH</StatNumber>
                </Stat>
              </SimpleGrid>
            </>
          ) : (
            <>
              <Button colorScheme="teal" onClick={onClick}>
                Connect
              </Button>
            </>
          )}
        </VStack>
      </Box>
    </Box>
  );
}

function getSigner(library, account) {
  return library.getSigner(account).connectUnchecked();
}

function getProviderOrSigner(library, account) {
  return account ? getSigner(library, account) : library;
}

function truncate(text, startChars, endChars, maxLength) {
  if (text.length > maxLength) {
    var start = text.substring(0, startChars);
    var end = text.substring(text.length - endChars, text.length);
    return start + "..." + end;
  }
  return text;
}

function YearnVaultPerformance({ vaultInfo }) {
  const { account } = useContext(AppContext);
  const { library } = useWeb3React();

  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    async function fetchTransfers() {
      let transferEvents = await vaultInfo.contract.queryFilter(
        vaultInfo.contract.filters.Transfer(null, account),
        0,
        "latest"
      );

      let transferTxReceipts = await Promise.all(
        transferEvents.map(async (e) => {
          return (await e.getTransaction()).wait();
        })
      );

      let transfers = transferTxReceipts.map((r) => {
        let erc20Log = r.logs.find(
          (l) => l.address === vaultInfo.erc20.address
        );
        let vaultTokenLog = r.logs.find(
          (l) => l.address === vaultInfo.contract.address
        );
        window.erc20Log = erc20Log;

        let from = vaultInfo.erc20.interface.parseLog(erc20Log).args.value;
        let to = vaultInfo.contract.interface.parseLog(vaultTokenLog).args
          .value;
        let price = from.mul(vaultInfo.mantissa).div(to);
        return {
          tx: r.transactionHash,
          block: r.blockNumber,
          from: from,
          to: to,
          price: price,
          priceFormatted: formatUnits(price, vaultInfo.decimals),
        };
      });

      window.transfers = transfers;
      window.transferTxs = transferTxReceipts;

      setTransfers(transfers);
    }

    fetchTransfers();
  }, [account, library, vaultInfo]);

  let totalInvested = ethers.BigNumber.from("0");
  let totalShares = ethers.BigNumber.from("0");
  transfers.forEach((t) => {
    totalInvested = totalInvested.add(t.to);
    totalShares = totalShares.add(t.from);
  });
  let currentValue = totalShares
    .mul(vaultInfo.sharePrice)
    .div(vaultInfo.mantissa);
  let netReturn = currentValue.sub(totalInvested);

  return (
    <Box>
      <Text color="gray.100" as="h2" fontWeight="bold" fontSize="xl">
        Yearn
      </Text>
      <Box
        color="gray.700"
        bgColor="gray.100"
        borderColor="gray.100"
        borderWidth="1px"
        borderRadius="lg"
        w="100%"
      >
        <VStack w="100%" spacing={2} align="start">
          <VStack p={6} align="start">
            <Text fontSize="2xl" fontWeight="bold">
              <Link
                color="teal.500"
                isExternal
                href={`https://etherscan.io/address/${vaultInfo.contract.address}`}
              >
                {vaultInfo.name}
              </Link>
            </Text>
            <Stat>
              <StatLabel>Share price</StatLabel>
              <StatNumber>
                $
                {commify(formatUnits(vaultInfo.sharePrice, vaultInfo.decimals))}
              </StatNumber>
            </Stat>
            <SimpleGrid columns={2} spacing={6}>
              <Stat flexShrink="0">
                <StatLabel>Total invested</StatLabel>
                <StatNumber>
                  ${commify(formatUnits(totalInvested, vaultInfo.decimals))}
                </StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Total shares</StatLabel>
                <StatNumber>
                  {commify(formatUnits(totalShares, vaultInfo.decimals))}
                </StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Current value</StatLabel>
                <StatNumber>
                  ${commify(formatUnits(currentValue, vaultInfo.decimals))}
                </StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Net return</StatLabel>
                <StatNumber>
                  ${commify(formatUnits(netReturn, vaultInfo.decimals))}
                </StatNumber>
              </Stat>
            </SimpleGrid>
          </VStack>
          <Box px={6}>
            <Heading as="h3" size="md">
              Deposits
            </Heading>
          </Box>
          <Table colorScheme="blackAlpha">
            <Thead>
              <Tr>
                <Th>Tx</Th>
                <Th>Amount</Th>
                <Th>Shares</Th>
                <Th>Price</Th>
              </Tr>
            </Thead>
            <Tbody>
              {transfers.map((t) => {
                return (
                  <Tr>
                    <Td>
                      <Link
                        color="teal.500"
                        isExternal
                        href={`https://etherscan.io/tx/${t.tx}`}
                      >
                        {truncate(t.tx, 20, 0, 20)}
                      </Link>
                    </Td>
                    <Td>{`$${formatUnits(
                      t.from.toString(),
                      vaultInfo.decimals
                    )}`}</Td>
                    <Td>{`${formatUnits(
                      t.to.toString(),
                      vaultInfo.decimals
                    )}`}</Td>
                    <Td>{`$${t.priceFormatted}`}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </VStack>
      </Box>
    </Box>
  );
}

function Yearn() {
  const { chainId, activate, active, library } = useWeb3React();
  const { account } = useContext(AppContext);
  const [vaultInfo, setVaultInfo] = useState(null);

  let usdcVaultAddress = "0x5f18C75AbDAe578b483E5F43f12a39cF75b973a9";
  let yearnV2Vault = new ethers.Contract(
    usdcVaultAddress,
    YEARN_V2_VAULT_ABI,
    getProviderOrSigner(library, account)
  );
  window.yearnV2Vault = yearnV2Vault;

  useEffect(() => {
    async function fetchVaultInfo() {
      let decimals = await yearnV2Vault.decimals({ gasLimit: 60000 });
      let sharePrice = await yearnV2Vault.pricePerShare({ gasLimit: 60000 });
      let name = await yearnV2Vault.name({ gasLimit: 60000 });

      let erc20 = await yearnV2Vault.token({ gasLimit: 60000 });
      let erc20Contract = new ethers.Contract(
        erc20,
        ERC20_ABI,
        getProviderOrSigner(library, account)
      );
      window.ERC20 = erc20Contract;

      let mantissa = ethers.BigNumber.from("10").pow(decimals);

      setVaultInfo({
        name,
        decimals,
        sharePrice,
        mantissa,
        erc20: erc20Contract,
        contract: yearnV2Vault,
      });
    }

    if (!!library) {
      fetchVaultInfo();
    }
  }, [account, library]);

  return (
    <Box w="100%">
      {vaultInfo && <YearnVaultPerformance vaultInfo={vaultInfo} />}
    </Box>
  );
}

function App() {
  return (
    <AppContextProvider>
      <ChakraProvider>
        <Web3ReactProvider getLibrary={getLibrary}>
          <Box
            w="100vw"
            h="100vh"
            p={6}
            bgGradient="linear(to-r, gray.800, blue.800)"
          >
            <Box mx="auto" w="auto" maxW="2xl">
              <VStack spacing={4} w="100%">
                <Heading color="gray.200">Yearn Stats</Heading>
                <Box mx="auto" w="100%">
                  <VStack spacing="6">
                    <Wallet />
                    <Yearn />
                  </VStack>
                </Box>
              </VStack>
            </Box>
          </Box>
        </Web3ReactProvider>
      </ChakraProvider>
    </AppContextProvider>
  );
}

export default App;
