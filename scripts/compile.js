const fs = require('fs');
const path = require('path');
const solc = require('solc');

function findImports(importPath) {
  const contractPath = path.resolve(__dirname, '../contracts', importPath);
  if (fs.existsSync(contractPath)) {
    return { contents: fs.readFileSync(contractPath, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

async function compile() {
  console.log('⚡ Compiling Kobo Launchpad Smart Contracts...');
  const contractsDir = path.resolve(__dirname, '../contracts');
  const files = [
    'MockCNGN.sol',
    'KoboToken.sol',
    'KoboBondingCurve.sol',
    'KoboAmmPair.sol',
    'KoboAmmFactory.sol',
    'KoboAmmRouter.sol'
  ];

  const sources = {};
  for (const file of files) {
    const fullPath = path.join(contractsDir, file);
    sources[file] = { content: fs.readFileSync(fullPath, 'utf8') };
  }

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    let hasError = false;
    for (const error of output.errors) {
      console.log(error.formattedMessage);
      if (error.severity === 'error') hasError = true;
    }
    if (hasError) {
      console.error('❌ Compilation failed with errors.');
      process.exit(1);
    }
  }

  const artifactsDir = path.resolve(__dirname, '../artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const compiled = {};
  for (const contractFile in output.contracts) {
    for (const contractName in output.contracts[contractFile]) {
      const contract = output.contracts[contractFile][contractName];
      const artifact = {
        contractName,
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
      };
      fs.writeFileSync(
        path.join(artifactsDir, `${contractName}.json`),
        JSON.stringify(artifact, null, 2)
      );
      compiled[contractName] = artifact;
      console.log(`✅ Compiled ${contractName} -> artifacts/${contractName}.json`);
    }
  }

  console.log('🎉 All contracts compiled successfully!');
  return compiled;
}

if (require.main === module) {
  compile().catch(console.error);
}

module.exports = compile;
