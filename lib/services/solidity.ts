import { Worker } from 'worker_threads';
import path from 'path';

const COMPILE_TIMEOUT_MS = 30_000;

/**
 * Lazily resolve the node_modules base that contains @openzeppelin/contracts.
 * We search up from cwd to find the nearest node_modules with the package.
 * This avoids require.resolve on .sol files which Turbopack can't handle.
 */
let _ozBaseDirCached: string | null | undefined;
function getOzBaseDir(): string | null {
  if (_ozBaseDirCached !== undefined) return _ozBaseDirCached;
  const fs = require('fs') as typeof import('fs');
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'node_modules');
    const ozDir = path.join(candidate, '@openzeppelin', 'contracts', 'token', 'ERC20', 'ERC20.sol');
    try {
      fs.accessSync(ozDir);
      _ozBaseDirCached = candidate;
      return candidate;
    } catch { /* continue searching */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  _ozBaseDirCached = null;
  return null;
}

export interface CompiledSolidityContract {
  contractName: string;
  abi: readonly unknown[];
  bytecode: `0x${string}`;
  warnings: string[];
  usedViaIR: boolean;
}

interface SolcOutputError {
  severity?: 'error' | 'warning';
  formattedMessage?: string;
  message?: string;
}

interface SolcOutputContract {
  abi?: readonly unknown[];
  evm?: {
    bytecode?: {
      object?: string;
    };
  };
}

interface SolcOutput {
  contracts?: Record<string, Record<string, SolcOutputContract>>;
  errors?: SolcOutputError[];
}

/* ------------------------------------------------------------------ */
/*  Import pre-validation — catch missing / unsupported imports early  */
/* ------------------------------------------------------------------ */

let _ozContractsCache: string[] | null = null;

/** Recursively list every .sol file under @openzeppelin/contracts. */
function getAvailableOZContracts(nodeModulesBase: string): string[] {
  if (_ozContractsCache) return _ozContractsCache;
  const fsModule = require('fs') as typeof import('fs');
  const ozRoot = path.join(nodeModulesBase, '@openzeppelin', 'contracts');
  const result: string[] = [];
  function walk(dir: string) {
    try {
      const entries = fsModule.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.sol')) {
          result.push(path.relative(nodeModulesBase, full).replace(/\\/g, '/'));
        }
      }
    } catch { /* ignore */ }
  }
  walk(ozRoot);
  _ozContractsCache = result;
  return result;
}

/** Find OZ contracts with similar names to suggest as replacements. */
function findSimilarContracts(importPath: string, nodeModulesBase: string): string[] {
  const all = getAvailableOZContracts(nodeModulesBase);
  const target = path.basename(importPath, '.sol').toLowerCase();

  // 1. Exact filename in a different directory
  const exact = all.filter(c => path.basename(c, '.sol').toLowerCase() === target);
  if (exact.length > 0) return exact.slice(0, 5);

  // 2. Substring match
  const sub = all.filter(c => {
    const name = path.basename(c, '.sol').toLowerCase();
    return name.includes(target) || target.includes(name);
  });
  if (sub.length > 0) return sub.slice(0, 5);

  // 3. CamelCase word match ("MultiSigWallet" → ["multi","sig","wallet"])
  const words = target.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
  const wordMatch = all.filter(c => {
    const name = path.basename(c, '.sol').toLowerCase();
    return words.some(w => w.length >= 3 && name.includes(w));
  });
  if (wordMatch.length > 0) return wordMatch.slice(0, 8);

  // 4. Same parent directory
  const parentDir = path.dirname(importPath);
  const dirMatch = all.filter(c => c.startsWith(parentDir + '/'));
  return dirMatch.slice(0, 5);
}

/**
 * Pre-validate all import statements in user source code.
 * Returns an array of human-friendly error messages (empty = all valid).
 */
function validateImports(sourceCode: string, nodeModulesBase: string | null): string[] {
  const importRegex = /^\s*import\s[^;]*?["']([^"']+)["']\s*;/gm;
  const errors: string[] = [];
  let match;
  while ((match = importRegex.exec(sourceCode)) !== null) {
    const importPath = match[1];
    if (!importPath || importPath.startsWith('.')) continue;

    // Non-OZ external package
    if (!importPath.startsWith('@openzeppelin/')) {
      errors.push(
        `Unsupported import: "${importPath}". ` +
        `Only @openzeppelin/contracts/... imports are supported. ` +
        `For external protocols (PancakeSwap, Uniswap, Chainlink, etc.), ` +
        `define the required interface directly in your contract code.`
      );
      continue;
    }

    // OZ import — verify the file actually exists
    if (nodeModulesBase) {
      const fullPath = path.join(nodeModulesBase, importPath);
      const fsModule = require('fs') as typeof import('fs');
      try {
        fsModule.accessSync(fullPath);
      } catch {
        const suggestions = findSimilarContracts(importPath, nodeModulesBase);
        let msg = `OpenZeppelin contract not found: "${importPath}".`;
        if (suggestions.length > 0) {
          msg += `\nAvailable similar contracts:\n${suggestions.map(s => `  - import "${s}";`).join('\n')}`;
        }
        msg += `\nIf no suitable OpenZeppelin contract exists, implement the logic directly in your contract.`;
        errors.push(msg);
      }
    }
  }
  return errors;
}

function normalizeBytecode(bytecode: string | undefined): `0x${string}` | null {
  if (!bytecode) return null;
  const cleaned = bytecode.trim().replace(/^0x/i, '');
  if (!cleaned || cleaned.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;
  return `0x${cleaned}`;
}

function runSolcInWorker(jsonInput: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const solc = require('solc');
      const fs = require('fs');
      const pathMod = require('path');
      try {
        const importCallback = workerData.nodeModulesBase
          ? {
              import: (importPath) => {
                try {
                  const resolved = pathMod.join(workerData.nodeModulesBase, importPath);
                  const contents = fs.readFileSync(resolved, 'utf-8');
                  return { contents };
                } catch {
                  return { error: 'File not found: ' + importPath };
                }
              },
            }
          : undefined;
        const result = solc.compile(workerData.jsonInput, importCallback);
        parentPort.postMessage({ ok: true, result });
      } catch (error) {
        parentPort.postMessage({ ok: false, error: error.message || 'solc compile failed' });
      }
    `;
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { jsonInput, nodeModulesBase: getOzBaseDir() },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          `Solidity compilation exceeded ${COMPILE_TIMEOUT_MS}ms timeout. ` +
          'Reduce contract complexity or split into smaller files.'
        )
      );
    }, COMPILE_TIMEOUT_MS);

    worker.on('message', (msg: { ok: boolean; result?: string; error?: string }) => {
      clearTimeout(timer);
      if (msg.ok && msg.result) {
        resolve(msg.result);
      } else {
        reject(new Error(msg.error ?? 'solc compile failed'));
      }
    });

    worker.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    worker.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Solidity compiler worker exited with code ${code}`));
      }
    });
  });
}

export async function compileSolidityContract(
  sourceCode: string,
  contractName?: string
): Promise<CompiledSolidityContract> {
  // Pre-validate imports for clear, actionable error messages
  const importErrors = validateImports(sourceCode, getOzBaseDir());
  if (importErrors.length > 0) {
    throw new Error(`Import validation failed:\n\n${importErrors.join('\n\n')}`);
  }

  const compileOnce = async (viaIR: boolean): Promise<SolcOutput> => {
    const input = {
      language: 'Solidity',
      sources: {
        'Contract.sol': {
          content: sourceCode,
        },
      },
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        viaIR: viaIR || undefined,
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object'],
          },
        },
      },
    };

    const jsonInput = JSON.stringify(input);
    const rawOutput = await runSolcInWorker(jsonInput);
    return JSON.parse(rawOutput) as SolcOutput;
  };

  const getCompileErrors = (output: SolcOutput): SolcOutputError[] =>
    (output.errors ?? []).filter((err) => err.severity === 'error');

  let usedViaIR = false;
  let compileOutput = await compileOnce(false);
  let compileErrors = getCompileErrors(compileOutput);
  const hasStackTooDeep = compileErrors.some((err) => {
    const message = `${err.formattedMessage ?? ''}\n${err.message ?? ''}`.toLowerCase();
    return message.includes('stack too deep');
  });

  // Auto-retry with viaIR for "Stack too deep" contracts.
  if (compileErrors.length > 0 && hasStackTooDeep) {
    const viaIROutput = await compileOnce(true);
    const viaIRErrors = getCompileErrors(viaIROutput);
    if (viaIRErrors.length === 0) {
      compileOutput = viaIROutput;
      compileErrors = [];
      usedViaIR = true;
    } else {
      compileOutput = viaIROutput;
      compileErrors = viaIRErrors;
      usedViaIR = true;
    }
  }

  if (compileErrors.length > 0) {
    const message = compileErrors
      .map((err) => err.formattedMessage ?? err.message ?? 'Unknown compile error')
      .join('\n\n');
    throw new Error(
      `Solidity compile failed${usedViaIR ? ' (with viaIR fallback)' : ''}:\n${message}`
    );
  }

  const warnings = (compileOutput.errors ?? [])
    .filter((err) => err.severity === 'warning')
    .map((err) => err.formattedMessage ?? err.message ?? 'Compiler warning');
  if (usedViaIR) {
    warnings.unshift('Compilation retried with viaIR=true due Stack too deep.');
  }

  const contractsInFile = compileOutput.contracts?.['Contract.sol'];
  if (!contractsInFile || Object.keys(contractsInFile).length === 0) {
    throw new Error('No contract found in Solidity source');
  }

  const selectedName =
    contractName && contractsInFile[contractName]
      ? contractName
      : Object.keys(contractsInFile)[0];
  const selectedContract = contractsInFile[selectedName];

  const bytecode = normalizeBytecode(selectedContract?.evm?.bytecode?.object);
  if (!bytecode) {
    throw new Error(
      `Contract "${selectedName}" has empty bytecode. Ensure it is deployable and not abstract.`
    );
  }

  const abi = selectedContract?.abi ?? [];
  if (!Array.isArray(abi)) {
    throw new Error(`Contract "${selectedName}" ABI is invalid`);
  }

  return {
    contractName: selectedName,
    abi,
    bytecode,
    warnings,
    usedViaIR,
  };
}
