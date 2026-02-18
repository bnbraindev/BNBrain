/**
 * E2E: Solidity compilation tests.
 *
 * Tests the solidity compiler service directly (not via HTTP).
 * Run: npm run test:solidity
 */

import {
  test,
  suiteHeader,
  printSummary,
  assertTruthy,
} from './helpers';

import { compileSolidityContract } from '@/lib/services/solidity';

async function main() {
  suiteHeader('E2E: Solidity Compilation');

  // ── Simple contract ──────────────────────────────────────
  console.log('\n📄 Simple Contract');

  await test('Compile minimal contract → success with abi + bytecode', async () => {
    const source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleToken {
    string public name = "Test";
    uint256 public totalSupply;

    constructor() {
        totalSupply = 1000;
    }
}`;
    const result = await compileSolidityContract(source, 'SimpleToken');
    assertTruthy(result.contractName === 'SimpleToken', `Expected SimpleToken, got ${result.contractName}`);
    assertTruthy(result.abi.length > 0, 'ABI is empty');
    assertTruthy(result.bytecode.startsWith('0x'), 'Bytecode missing 0x prefix');
    assertTruthy(result.bytecode.length > 10, 'Bytecode too short');
    return `abi: ${result.abi.length} entries, bytecode: ${result.bytecode.length} chars`;
  });

  // ── Syntax error ─────────────────────────────────────────
  console.log('\n❌ Syntax Error');

  await test('Compile syntax-error contract → throws', async () => {
    const source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Broken {
    uint256 public x = ;  // syntax error
}`;
    try {
      await compileSolidityContract(source, 'Broken');
      throw new Error('Expected compile to throw but it succeeded');
    } catch (err: any) {
      if (err.message.includes('Expected compile to throw')) throw err;
      assertTruthy(
        err.message.includes('compile failed') || err.message.includes('Error'),
        `Unexpected error: ${err.message.slice(0, 100)}`
      );
      return `correctly threw: ${err.message.slice(0, 80)}`;
    }
  });

  // ── OpenZeppelin import ──────────────────────────────────
  console.log('\n📦 OpenZeppelin Import');

  await test('Compile ERC20 with OpenZeppelin → success', async () => {
    const source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {
    constructor() ERC20("MyToken", "MTK") {
        _mint(msg.sender, 1000 * 10 ** decimals());
    }
}`;
    const result = await compileSolidityContract(source, 'MyToken');
    assertTruthy(result.contractName === 'MyToken', `Expected MyToken, got ${result.contractName}`);
    assertTruthy(result.abi.length > 5, `ABI too small: ${result.abi.length}`);
    assertTruthy(result.bytecode.length > 100, 'Bytecode too short for ERC20');
    return `abi: ${result.abi.length} entries, bytecode: ${result.bytecode.length} chars`;
  });

  printSummary();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
