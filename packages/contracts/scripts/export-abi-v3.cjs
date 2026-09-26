// Regenerates src/forj-escrow-v3-abi.ts from the compiled artifact so the
// app can never drift from the contract it talks to.
const fs = require('fs');
const path = require('path');
const artifact = require('../artifacts/contracts/ForjEscrowV3.sol/ForjEscrowV3.json');
const out =
  '/**\n * ABI for ForjEscrowV3, generated from the Hardhat artifact.\n * Regenerate after any contract change: pnpm --filter @forj/contracts abi:v3\n */\n' +
  `export const forjEscrowV3Abi = ${JSON.stringify(artifact.abi, null, 2)} as const;\n\nexport type ForjEscrowV3Abi = typeof forjEscrowV3Abi;\n`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'forj-escrow-v3-abi.ts'), out);
console.log('wrote src/forj-escrow-v3-abi.ts');
