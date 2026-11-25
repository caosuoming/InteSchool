import { parentPort, workerData } from "node:worker_threads";
import { computeDuplicateScan, type DuplicateScanInput } from "./duplicateScan.js";

if (!parentPort) throw new Error("duplicate scan requires a worker thread");
parentPort.postMessage(computeDuplicateScan(workerData as DuplicateScanInput));
