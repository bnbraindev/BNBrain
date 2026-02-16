/**
 * Contract source code cache — fetch once, store locally, serve forever.
 *
 * Directory layout:
 *   .contract-cache/
 *     {chainId}/
 *       {address}/
 *         metadata.json        — contract info + file index
 *         sources/              — unpacked .sol files (directory structure preserved)
 *         archive.zip           — pre-built zip for download
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ContractSourceMetadata {
  chainId: number;
  address: string;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: boolean;
  runs: string;
  evmVersion: string;
  licenseType: string;
  proxy: boolean;
  implementation: string;
  isMultiFile: boolean;
  /** Relative paths of all source files (from sources/ dir) */
  files: string[];
  totalSourceChars: number;
  /** Rough token estimate (~3.5 chars per token for Solidity) */
  tokenEstimate: number;
  fetchedAt: string;
  /** Which data source provided this contract: 'sourcify' | 'bscscan' | undefined (legacy) */
  source?: string;
}

interface BscScanSourceResult {
  sourceCode: string;
  abi: string;
  contractName: string;
  compilerVersion: string;
  optimizationUsed: string;
  runs: string;
  constructorArguments: string;
  evmVersion: string;
  library: string;
  licenseType: string;
  proxy: string;
  implementation: string;
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const CACHE_ROOT = process.env.CONTRACT_CACHE_DIR ||
  path.join(process.cwd(), '.contract-cache');

function cacheDir(chainId: number, address: string): string {
  return path.join(CACHE_ROOT, String(chainId), address.toLowerCase());
}

function sourcesDir(chainId: number, address: string): string {
  return path.join(cacheDir(chainId, address), 'sources');
}

function metadataPath(chainId: number, address: string): string {
  return path.join(cacheDir(chainId, address), 'metadata.json');
}

function zipPath(chainId: number, address: string): string {
  return path.join(cacheDir(chainId, address), 'archive.zip');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Parse BscScan's source code format into a file map. */
function parseSourceCode(raw: string): Map<string, string> {
  const files = new Map<string, string>();

  if (raw.startsWith('{{')) {
    // Multi-file: Standard JSON Input wrapped in double braces
    try {
      const parsed = JSON.parse(raw.slice(1, -1)) as {
        sources?: Record<string, { content?: string }>;
      };
      if (parsed.sources) {
        for (const [filePath, file] of Object.entries(parsed.sources)) {
          if (file.content) {
            files.set(filePath, file.content);
          }
        }
      }
    } catch {
      // Fallback: treat as single file
      files.set('Contract.sol', raw);
    }
  } else if (raw.startsWith('{')) {
    // Possible JSON without double braces (rare)
    try {
      const parsed = JSON.parse(raw) as {
        sources?: Record<string, { content?: string }>;
      };
      if (parsed.sources) {
        for (const [filePath, file] of Object.entries(parsed.sources)) {
          if (file.content) {
            files.set(filePath, file.content);
          }
        }
      } else {
        files.set('Contract.sol', raw);
      }
    } catch {
      files.set('Contract.sol', raw);
    }
  } else {
    // Single flat Solidity file
    files.set('Contract.sol', raw);
  }

  return files;
}

/** Create a zip from a directory tree and write it to disk. */
function buildZip(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Check if a contract's source is already cached. */
export function isCached(chainId: number, address: string): boolean {
  return fs.existsSync(metadataPath(chainId, address));
}

/** Read cached metadata (returns null if not cached). */
export function getCachedMetadata(
  chainId: number,
  address: string
): ContractSourceMetadata | null {
  const p = metadataPath(chainId, address);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as ContractSourceMetadata;
  } catch {
    return null;
  }
}

/** Read the pre-built zip as a Buffer (returns null if not cached). */
export function getCachedZipBuffer(
  chainId: number,
  address: string
): Buffer | null {
  const p = zipPath(chainId, address);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

/** Read a specific source file from cache. */
export function getCachedFileContent(
  chainId: number,
  address: string,
  filePath: string
): string | null {
  const fullPath = path.join(sourcesDir(chainId, address), filePath);
  // Prevent path traversal
  if (!fullPath.startsWith(sourcesDir(chainId, address))) return null;
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

/** List all cached source files (relative paths). */
export function listCachedFiles(chainId: number, address: string): string[] {
  const meta = getCachedMetadata(chainId, address);
  return meta?.files ?? [];
}

/**
 * Save contract source code result to local cache.
 * Parses the source, writes individual files, builds zip, writes metadata.
 * Returns the metadata for immediate use.
 *
 * @param options.source - Which data provider supplied this ('sourcify' | 'bscscan')
 */
export async function saveContractSource(
  chainId: number,
  address: string,
  result: BscScanSourceResult,
  options?: { source?: string }
): Promise<ContractSourceMetadata> {
  const addr = address.toLowerCase();
  const srcDir = sourcesDir(chainId, addr);
  ensureDir(srcDir);

  // Parse source code into files
  const fileMap = parseSourceCode(result.sourceCode);

  // Write each source file to disk
  const fileList: string[] = [];
  let totalChars = 0;
  for (const [filePath, content] of fileMap) {
    const fullPath = path.join(srcDir, filePath);
    // Prevent path traversal — skip any file that escapes the source directory
    if (!fullPath.startsWith(srcDir)) continue;
    ensureDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, 'utf-8');
    fileList.push(filePath);
    totalChars += content.length;
  }

  // Build zip
  const zp = zipPath(chainId, addr);
  await buildZip(srcDir, zp);

  // Write metadata
  const metadata: ContractSourceMetadata = {
    chainId,
    address: addr,
    contractName: result.contractName || 'Unknown',
    compilerVersion: result.compilerVersion || '',
    optimizationUsed: result.optimizationUsed === '1',
    runs: result.runs || '',
    evmVersion: result.evmVersion || '',
    licenseType: result.licenseType || '',
    proxy: result.proxy === '1',
    implementation: result.implementation || '',
    isMultiFile: fileMap.size > 1,
    files: fileList,
    totalSourceChars: totalChars,
    tokenEstimate: Math.ceil(totalChars / 3.5),
    fetchedAt: new Date().toISOString(),
    source: options?.source,
  };
  fs.writeFileSync(metadataPath(chainId, addr), JSON.stringify(metadata, null, 2));

  return metadata;
}

/**
 * Get the main contract source code from cache.
 * For single-file: returns the only file.
 * For multi-file: returns the file matching contractName, or the first non-library file.
 */
export function getMainContractSource(
  chainId: number,
  address: string
): { filePath: string; content: string } | null {
  const meta = getCachedMetadata(chainId, address);
  if (!meta || meta.files.length === 0) return null;

  const addr = address.toLowerCase();

  // Single file
  if (meta.files.length === 1) {
    const content = getCachedFileContent(chainId, addr, meta.files[0]);
    return content ? { filePath: meta.files[0], content } : null;
  }

  // Multi-file: find the main contract
  // Priority: exact contractName match > contracts/ directory > first non-@ file
  const contractName = meta.contractName;
  const candidates = [
    meta.files.find(f => path.basename(f, '.sol') === contractName),
    meta.files.find(f => f.startsWith('contracts/') && path.basename(f, '.sol') === contractName),
    meta.files.find(f => f.includes(`/${contractName}.sol`)),
    meta.files.find(f => !f.startsWith('@') && f.startsWith('contracts/')),
    meta.files.find(f => !f.startsWith('@')),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      const content = getCachedFileContent(chainId, addr, candidate);
      if (content) return { filePath: candidate, content };
    }
  }

  // Fallback: first file
  const content = getCachedFileContent(chainId, addr, meta.files[0]);
  return content ? { filePath: meta.files[0], content } : null;
}
