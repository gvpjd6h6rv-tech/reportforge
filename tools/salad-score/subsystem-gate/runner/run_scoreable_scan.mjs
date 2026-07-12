'use strict';
import path from 'node:path';
import { runSaladScore } from '../../runner/run_salad_score.mjs';
import { checkDeclaredFilesScanned } from '../checkers/check_declared_files_scanned.mjs';

/** Runs the official scanner and derives: the FULL root scan paths (used
 *  only to verify every declared scoreable file was actually found on
 *  disk -- checkDeclaredFilesScanned needs the whole scan, since a
 *  declared-but-never-scanned file is exactly what it must catch, so it
 *  compares absolute-to-absolute against the ORIGINAL scan.files, never
 *  serialized), and the scoped subset (declared ∩ scanned -- the ONLY
 *  files that belong to this subsystem) with its `path` field
 *  RE-CANONICALIZED to root-relative, forward-slashed form -- the single
 *  point where the scanner's absolute paths become the public,
 *  directory-independent representation every downstream checker
 *  (ownership, hidden-side-effect, over-20, scanned-scoreable) and the
 *  final result consume. Single responsibility: scan + canonicalized
 *  scoreable-subset derivation. */
export function runScoreableScan(root, config, ownershipMapPath, scoreableFiles) {
  const scan = runSaladScore({ roots: [root], config, ownershipMapPath });
  const scannedPaths = scan.files.map((f) => f.path);
  const scopedResults = scan.files
    .filter((f) => scoreableFiles.includes(f.path))
    .map((f) => ({ ...f, path: path.relative(root, f.path).replace(/\\/g, '/') }));
  return {
    scannedPaths,
    scoreableScanned: checkDeclaredFilesScanned(scoreableFiles, scannedPaths),
    scopedResults,
    scannedScoreablePaths: scopedResults.map((f) => f.path),
  };
}
