// Retired: never turn old benchmark invocations into automatic paid chat uploads.
const help = `The old hardcoded chat benchmark has been retired.

For model access checks with a small generic prompt:
  npm run ai:models -- --help
  npm run ai:models -- --probe --max-models 1
The optional probe may use paid quota; it never uploads chats.

For application checks with synthetic fixtures:
  node scripts/browser-check.cjs --help
  TEST_DATABASE_URL_FILE=/path/to/disposable-database-url node scripts/browser-check.cjs

For live report checks, explicitly supply exactly three ZIP fixtures:
  TEST_DATABASE_URL_FILE=/path/to/disposable-database-url node scripts/browser-check.cjs --live ZIP1 ZIP2 ZIP3
Live mode sends those chats to the configured AI service and may use paid quota.

This retired entry point only prints guidance. It does not load credentials, open
ZIP files, access a database or network, or forward legacy arguments.
`;
console.log(help);
if (process.argv.slice(2).some(argument => argument !== '--help' && argument !== '-h')) process.exitCode = 1;
