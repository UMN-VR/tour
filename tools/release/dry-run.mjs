#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { planTourAppDelivery } from './delivery.mjs';

const [flag, directory, pinFile, retainedFile] = process.argv.slice(2);
if (flag !== '--dry-run' || !directory || !pinFile || process.argv.length > 6) {
  throw new Error('Usage: node tools/release/dry-run.mjs --dry-run RELEASE_DIR PIN_JSON [RETAINED_RELEASES_JSON]');
}
const pin = JSON.parse(readFileSync(pinFile, 'utf8'));
if (pin.schemaVersion !== 1 || pin.repository !== 'UMN-VR/tour' || pin.mountPath !== '/tour/twin-cities/') {
  throw new Error('Expected the exact tour assembly pin');
}
const retained = retainedFile ? JSON.parse(readFileSync(retainedFile, 'utf8')) : [];
if (!Array.isArray(retained)) throw new Error('Retained supported releases must be an explicit list');
console.log(JSON.stringify(planTourAppDelivery({ directory, descriptorSha256: pin.descriptorSha256, retained }), null, 2));
