// Retired: the old script used obsolete auth fixtures and a hardcoded database.
// Keep this entry point inert so old commands cannot mutate data automatically.
const help = `The old security smoke harness has been retired.

Use the maintained browser checks:
  node scripts/browser-check.cjs --help
  TEST_DATABASE_URL_FILE=/path/to/disposable-database-url node scripts/browser-check.cjs

The maintained default uses synthetic fixtures. It requires an explicitly selected
isolated test database and a running local test app; see its --help first.

For live end-to-end report checks, explicitly supply exactly three ZIP fixtures:
  TEST_DATABASE_URL_FILE=/path/to/disposable-database-url node scripts/browser-check.cjs --live ZIP1 ZIP2 ZIP3
Live mode sends those chats to the configured AI service and may use paid quota.

This retired entry point only prints guidance. It does not read credentials, chat
files or a database, and does not run or forward any supplied arguments.
`;
console.log(help);
if (process.argv.slice(2).some(argument => argument !== '--help' && argument !== '-h')) process.exitCode = 1;
